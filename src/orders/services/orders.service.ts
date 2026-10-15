import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { hashRequest } from '../../common/utils/request-hash';
import {
  OrderOperationKind,
  Prisma,
  Role,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/services/prisma.service';
import { userSelect, type AuthUser } from '../../auth/types/auth.types';
import {
  availableQuantity,
  reservedQuantities,
} from '../../inventory/utils/reservations';
import {
  preparePurchase,
  sortedPurchaseItems,
  type PurchaseLine,
} from '../../products/utils/purchase-lines';
import { persistSale } from '../../sales/persistence/persist-sale';
import { saleBalance, serializeSale } from '../../sales/presenters/sales-view';
import { expirePendingOrders } from './order-expiry.service';
import { nextOrderStatus } from '../rules/order-rules';
import {
  orderInclude,
  serializeOrder,
  type OrderDetail,
} from '../presenters/orders-view';
import {
  CreateOrderDto,
  ListOrdersDto,
  OrderOperationDto,
} from '../dto/orders.dto';

@Injectable()
export class OrdersService {
  private readonly reservationMinutes: number;
  constructor(
    private readonly db: PrismaService,
    config: ConfigService,
  ) {
    this.reservationMinutes = Number(
      config.get<string>('ORDER_RESERVATION_MINUTES', '1440'),
    );
    if (
      !Number.isInteger(this.reservationMinutes) ||
      this.reservationMinutes < 1 ||
      this.reservationMinutes > 10080
    )
      throw new Error(
        'ORDER_RESERVATION_MINUTES must be an integer from 1 to 10080',
      );
  }

  private async actor(
    tx: Prisma.TransactionClient,
    userId: number,
  ): Promise<AuthUser> {
    const actor = await tx.user.findUnique({
      where: { userId },
      select: userSelect,
    });
    if (!actor?.isActive)
      throw new ForbiddenException('Usuario inactivo o inexistente');
    return actor;
  }

  private scope(actor: AuthUser): Prisma.OrderWhereInput {
    return actor.role === Role.CUSTOMER ? { userId: actor.userId } : {};
  }

  private async requireOrder(
    tx: Prisma.TransactionClient,
    orderId: number,
    actor: AuthUser,
  ): Promise<OrderDetail> {
    const order = await tx.order.findFirst({
      where: { orderId, ...this.scope(actor) },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  create(dto: CreateOrderDto, userId: number) {
    const items = sortedPurchaseItems(dto.items);
    const requestHash = hashRequest({ items, fulfillment: 'PICKUP' });
    return this.db.catalogWrite(async (tx) => {
      const actor = await this.actor(tx, userId);
      if (actor.role !== Role.CUSTOMER)
        throw new ForbiddenException(
          'Solo CUSTOMER puede crear pedidos de autoservicio',
        );
      const at = new Date();
      await expirePendingOrders(tx, at);
      const existing = await tx.order.findUnique({
        where: { requestId: dto.requestId },
        include: orderInclude,
      });
      if (existing) {
        if (existing.userId !== userId || existing.requestHash !== requestHash)
          throw new ConflictException(
            'Identificador de pedido utilizado por otra operación',
          );
        return serializeOrder(existing, false, at);
      }
      const customer = await tx.customer.findUnique({ where: { userId } });
      if (!customer?.isActive)
        throw new ConflictException('El perfil de cliente no está habilitado');
      const { lines, total } = await preparePurchase(tx, items, at);
      const order = await tx.order.create({
        data: {
          requestId: dto.requestId,
          requestHash,
          userId,
          customerId: customer.customerId,
          customerName: customer.name,
          customerDocument: customer.document,
          total,
          expiresAt: new Date(at.getTime() + this.reservationMinutes * 60000),
          items: {
            create: lines.map(
              ({
                productId,
                productName,
                sku,
                quantity,
                unitPrice,
                subtotal,
              }) => ({
                productId,
                productName,
                sku,
                quantity,
                unitPrice,
                subtotal,
              }),
            ),
          },
        },
        include: orderInclude,
      });
      return serializeOrder(order, false, at);
    });
  }

  async get(orderId: number, actor: AuthUser) {
    const order = await this.requireOrder(this.db, orderId, actor);
    return serializeOrder(order, actor.role !== Role.CUSTOMER);
  }

  async list(dto: ListOrdersDto, actor: AuthUser) {
    const at = new Date();
    const filter: Prisma.OrderWhereInput =
      dto.status === 'EXPIRED'
        ? {
            OR: [
              { status: 'EXPIRED' },
              { status: 'PENDING', expiresAt: { lte: at } },
            ],
          }
        : dto.status === 'PENDING'
          ? { status: 'PENDING', expiresAt: { gt: at } }
          : { status: dto.status };
    const where: Prisma.OrderWhereInput = { ...this.scope(actor), ...filter };
    const [items, total] = await this.db.$transaction(
      [
        this.db.order.findMany({
          where,
          include: orderInclude,
          orderBy: { orderId: 'desc' },
          take: dto.limit,
          skip: (dto.page - 1) * dto.limit,
        }),
        this.db.order.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: items.map((order) =>
        serializeOrder(order, actor.role !== Role.CUSTOMER, at),
      ),
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }

  transition(
    orderId: number,
    kind: OrderOperationKind,
    dto: OrderOperationDto,
    userId: number,
  ) {
    const requestHash = hashRequest({ orderId, kind, reason: dto.reason });
    return this.db.catalogWrite(async (tx) => {
      const actor = await this.actor(tx, userId);
      const staff = actor.role !== Role.CUSTOMER;
      if (kind !== 'CANCEL' && !staff)
        throw new ForbiddenException('Operación reservada al personal');
      const at = new Date();
      await expirePendingOrders(tx, at);
      const order = await this.requireOrder(tx, orderId, actor);
      const previous = await tx.orderOperation.findUnique({
        where: { requestId: dto.requestId },
      });
      if (previous) {
        if (previous.userId !== userId || previous.requestHash !== requestHash)
          throw new ConflictException(
            'Identificador utilizado por otra operación',
          );
        return serializeOrder(order, staff, at);
      }
      const status = nextOrderStatus(order.status, kind);
      if (kind === 'CONFIRM') {
        await this.confirm(tx, order, actor, dto, requestHash, at);
      } else {
        if (kind === 'READY' || kind === 'COMPLETE') {
          if (
            !order.sale ||
            saleBalance(order.sale).cancelled ||
            serializeSale(order.sale).status === 'RETURNED'
          )
            throw new ConflictException(
              'La venta está anulada o completamente devuelta',
            );
          if (kind === 'COMPLETE' && saleBalance(order.sale).balanceDue.gt(0))
            throw new ConflictException(
              'Registra el cobro pendiente antes de entregar el pedido',
            );
        }
        await tx.order.update({
          where: { orderId },
          data: {
            status,
            ...(kind === 'READY'
              ? { readyAt: at }
              : kind === 'COMPLETE'
                ? { completedAt: at }
                : { cancelledAt: at }),
          },
        });
      }
      await tx.orderOperation.create({
        data: {
          orderId,
          userId,
          userName: actor.name,
          kind,
          requestId: dto.requestId,
          requestHash,
          reason: dto.reason,
        },
      });
      return serializeOrder(
        await this.requireOrder(tx, orderId, actor),
        staff,
        at,
      );
    });
  }

  private async confirm(
    tx: Prisma.TransactionClient,
    order: OrderDetail,
    actor: AuthUser,
    dto: OrderOperationDto,
    requestHash: string,
    at: Date,
  ) {
    const customer = await tx.customer.findUnique({
      where: { customerId: order.customerId },
      include: { user: { select: { isActive: true } } },
    });
    if (!customer?.isActive || !customer.user?.isActive)
      throw new ConflictException('El cliente o su cuenta están inactivos');
    const ids = order.items.map((item) => item.productId);
    const products = await tx.product.findMany({
      where: { productId: { in: ids } },
      include: {
        inventory: true,
        subCategory: { include: { category: true } },
      },
    });
    const otherReservations = await reservedQuantities(
      tx,
      ids,
      at,
      order.orderId,
    );
    const lines: PurchaseLine[] = [];
    for (const item of order.items) {
      const product = products.find((p) => p.productId === item.productId);
      if (
        !product?.isActive ||
        !product.subCategory.isActive ||
        !product.subCategory.category.isActive
      )
        throw new ConflictException(
          'Un producto del pedido dejó de estar habilitado',
        );
      const previousQuantity = product.inventory?.quantity ?? 0;
      if (
        availableQuantity(
          previousQuantity,
          otherReservations.get(item.productId) ?? 0,
        ) < item.quantity
      )
        throw new ConflictException(
          'Stock insuficiente para confirmar el pedido',
        );
      lines.push({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        previousQuantity,
      });
    }
    const sale = await persistSale(
      tx,
      {
        requestId: randomUUID(),
        requestHash: hashRequest({
          orderId: order.orderId,
          userId: actor.userId,
          requestId: dto.requestId,
          requestHash,
        }),
        customerId: order.customerId,
        customerName: order.customerName,
        customerDocument: order.customerDocument,
        userId: actor.userId,
        sellerName: actor.name,
        total: order.total,
      },
      lines,
    );
    await tx.order.update({
      where: { orderId: order.orderId },
      data: { status: 'CONFIRMED', confirmedAt: at, saleId: sale.saleId },
    });
  }
}
