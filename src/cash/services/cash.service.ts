import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/services/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../auth/types/auth.types';
import { hashRequest } from '../../common/utils/request-hash';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CloseShiftDto,
  ListShiftsDto,
  ManualCashDto,
  OpenShiftDto,
  RegisterDto,
} from '../dto/cash.dto';
import { cashSummary, checkCashBalance } from '../utils/cash-ledger';
@Injectable()
export class CashService {
  constructor(private readonly db: PrismaService) {}
  registers(user: AuthUser) {
    return this.db.cashRegister.findMany({
      where: user.role === 'ADMIN' ? {} : { isActive: true },
      orderBy: { registerId: 'asc' },
    });
  }
  register(dto: RegisterDto, registerId?: number) {
    return this.db.catalogWrite(async (tx) => {
      if (
        registerId &&
        (await tx.cashShift.count({ where: { registerId, closedAt: null } }))
      )
        throw new ConflictException(
          'Cierra el turno antes de modificar esta caja',
        );
      if (
        registerId &&
        !(await tx.cashRegister.findUnique({ where: { registerId } }))
      )
        throw new NotFoundException('Caja no encontrada');
      if (
        await tx.cashRegister.findFirst({
          where: {
            name: { equals: dto.name, mode: 'insensitive' },
            ...(registerId ? { registerId: { not: registerId } } : {}),
          },
        })
      )
        throw new ConflictException('Ya existe una caja con ese nombre');
      return registerId
        ? tx.cashRegister.update({ where: { registerId }, data: dto })
        : tx.cashRegister.create({ data: dto });
    });
  }
  async list(dto: ListShiftsDto, user: AuthUser) {
    const where: Prisma.CashShiftWhereInput = {
      ...(user.role !== 'ADMIN' ? { userId: user.userId } : {}),
      ...(dto.registerId ? { registerId: dto.registerId } : {}),
      ...(dto.status
        ? { closedAt: dto.status === 'OPEN' ? null : { not: null } }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.cashShift.findMany({
        where,
        include: { register: true },
        orderBy: { shiftId: 'desc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
      this.db.cashShift.count({ where }),
    ]);
    return {
      data: data.map((s) => this.serialize(s)),
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }
  async current(user: AuthUser) {
    const shift = await this.db.cashShift.findFirst({
      where: { userId: user.userId, closedAt: null },
    });
    return shift ? this.get(shift.shiftId, user) : null;
  }
  get(shiftId: number, user: AuthUser) {
    return this.db.$transaction(
      async (tx) => {
        const shift = await this.access(tx, shiftId, user);
        const summary = await cashSummary(tx, shiftId, shift.openingAmount);
        return { ...this.serialize(shift), summary };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  movements(shiftId: number, dto: PaginationDto, user: AuthUser) {
    return this.db.$transaction(
      async (tx) => {
        await this.access(tx, shiftId, user);
        const [data, total] = await Promise.all([
          tx.cashMovement.findMany({
            where: { shiftId },
            include: { saleOperation: { select: { saleId: true } } },
            orderBy: { movementId: 'desc' },
            skip: (dto.page - 1) * dto.limit,
            take: dto.limit,
          }),
          tx.cashMovement.count({ where: { shiftId } }),
        ]);
        return {
          data: data.map((m) => ({
            ...m,
            requestHash: undefined,
            amount: m.amount.toFixed(2),
          })),
          total,
          page: dto.page,
          limit: dto.limit,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  open(dto: OpenShiftDto, user: AuthUser) {
    return this.db.catalogWrite(async (tx) => {
      const hash = hashRequest({
        registerId: dto.registerId,
        openingAmount: dto.openingAmount,
      });
      const previous = await tx.cashShift.findUnique({
        where: { requestId: dto.requestId },
      });
      if (previous) {
        this.retry(previous.userId, previous.requestHash, user.userId, hash);
        return this.serialize(previous);
      }
      const register = await tx.cashRegister.findUnique({
        where: { registerId: dto.registerId },
      });
      if (!register?.isActive)
        throw new ConflictException('Selecciona una caja activa');
      if (
        await tx.cashShift.findFirst({
          where: {
            closedAt: null,
            OR: [{ registerId: dto.registerId }, { userId: user.userId }],
          },
        })
      )
        throw new ConflictException(
          'La caja o el usuario ya tiene un turno abierto',
        );
      return this.serialize(
        await tx.cashShift.create({
          data: {
            registerId: dto.registerId,
            userId: user.userId,
            userName: user.name,
            requestId: dto.requestId,
            requestHash: hash,
            openingAmount: dto.openingAmount,
          },
        }),
      );
    });
  }
  move(shiftId: number, dto: ManualCashDto, user: AuthUser) {
    return this.db.catalogWrite(async (tx) => {
      const shift = await this.access(tx, shiftId, user);
      const hash = hashRequest({
        shiftId,
        kind: dto.kind,
        amount: dto.amount,
        reason: dto.reason,
      });
      const previous = await tx.cashMovement.findUnique({
        where: { requestId: dto.requestId },
      });
      if (previous) {
        this.retry(previous.userId, previous.requestHash, user.userId, hash);
        return { movementId: previous.movementId };
      }
      this.ownerOpen(shift, user);
      const amount = new Prisma.Decimal(dto.amount);
      if (amount.lte(0))
        throw new ConflictException('El importe debe ser mayor que cero');
      const summary = await cashSummary(tx, shiftId, shift.openingAmount);
      checkCashBalance(
        new Prisma.Decimal(summary.expectedAmount).add(
          dto.kind === 'CASH_IN' ? amount : amount.negated(),
        ),
      );
      const movement = await tx.cashMovement.create({
        data: {
          shiftId,
          userId: user.userId,
          userName: user.name,
          requestId: dto.requestId,
          requestHash: hash,
          kind: dto.kind,
          amount,
          reason: dto.reason,
        },
      });
      return { movementId: movement.movementId };
    });
  }
  close(shiftId: number, dto: CloseShiftDto, user: AuthUser) {
    return this.db.catalogWrite(async (tx) => {
      const shift = await this.access(tx, shiftId, user);
      this.owner(shift, user);
      const hash = hashRequest({
        shiftId,
        countedAmount: dto.countedAmount,
        expectedLastMovementId: dto.expectedLastMovementId,
        reason: dto.reason,
      });
      const previous = await tx.cashShift.findUnique({
        where: { closeRequestId: dto.requestId },
      });
      if (previous) {
        this.retry(previous.userId, previous.closeHash!, user.userId, hash);
        return this.serialize(previous);
      }
      this.ownerOpen(shift, user);
      const summary = await cashSummary(tx, shiftId, shift.openingAmount);
      if (summary.lastMovementId !== dto.expectedLastMovementId)
        throw new ConflictException(
          'Hay movimientos nuevos. Actualiza el resumen y revisa el arqueo antes de cerrar',
        );
      return this.serialize(
        await tx.cashShift.update({
          where: { shiftId },
          data: {
            closedAt: new Date(),
            closeRequestId: dto.requestId,
            closeHash: hash,
            countedAmount: dto.countedAmount,
            expectedAmount: summary.expectedAmount,
            difference: new Prisma.Decimal(dto.countedAmount).sub(
              summary.expectedAmount,
            ),
            closeReason: dto.reason,
          },
        }),
      );
    });
  }
  private async access(
    tx: Prisma.TransactionClient,
    shiftId: number,
    user: AuthUser,
  ) {
    const shift = await tx.cashShift.findUnique({
      where: { shiftId },
      include: { register: true },
    });
    if (!shift) throw new NotFoundException('Turno no encontrado');
    if (user.role !== 'ADMIN' && shift.userId !== user.userId)
      throw new ForbiddenException(
        'No puedes consultar turnos de otro usuario',
      );
    return shift;
  }
  private owner(shift: { userId: number }, user: AuthUser) {
    if (shift.userId !== user.userId)
      throw new ForbiddenException(
        'Solo el responsable del turno puede operar su caja',
      );
  }
  private ownerOpen(
    shift: { userId: number; closedAt: Date | null },
    user: AuthUser,
  ) {
    this.owner(shift, user);
    if (shift.closedAt) throw new ConflictException('El turno ya está cerrado');
  }
  private retry(actor: number, stored: string, userId: number, hash: string) {
    if (actor !== userId || stored !== hash)
      throw new ConflictException('Identificador utilizado por otra operación');
  }
  private serialize<
    T extends {
      requestHash: string;
      closeHash: string | null;
      openingAmount: Prisma.Decimal;
      expectedAmount: Prisma.Decimal | null;
      countedAmount: Prisma.Decimal | null;
      difference: Prisma.Decimal | null;
    },
  >(shift: T) {
    const {
      requestHash: _requestHash,
      closeHash: _closeHash,
      ...publicShift
    } = shift;
    void _requestHash;
    void _closeHash;
    return {
      ...publicShift,
      openingAmount: shift.openingAmount.toFixed(2),
      expectedAmount: shift.expectedAmount?.toFixed(2) ?? null,
      countedAmount: shift.countedAmount?.toFixed(2) ?? null,
      difference: shift.difference?.toFixed(2) ?? null,
    };
  }
}
