import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/services/prisma.service';
import { activeStatusWhere } from '../../common/utils/status-filter';
import { escapeSearchText } from '../../common/utils/search-filter';
import {
  CreateSupplierDto,
  ListSuppliersDto,
  UpdateSupplierDto,
} from '../dto/suppliers.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly db: PrismaService) {}
  private async unique(
    tx: Prisma.TransactionClient,
    dto: CreateSupplierDto | UpdateSupplierDto,
    id?: number,
  ) {
    const duplicate = await tx.supplier.findFirst({
      where: {
        ...(id ? { supplierId: { not: id } } : {}),
        OR: [
          ...(dto.name !== undefined
            ? [{ normalizedName: dto.name.toLowerCase() }]
            : []),
          ...(dto.document ? [{ document: dto.document }] : []),
        ],
      },
    });
    if (duplicate)
      throw new ConflictException(
        'Ya existe un proveedor con ese nombre o documento',
      );
  }
  create(dto: CreateSupplierDto) {
    return this.db.catalogWrite(async (tx) => {
      await this.unique(tx, dto);
      return tx.supplier.create({
        data: { ...dto, normalizedName: dto.name.toLowerCase() },
        omit: { normalizedName: true },
      });
    });
  }
  async get(supplierId: number) {
    const supplier = await this.db.supplier.findUnique({
      where: { supplierId },
      omit: { normalizedName: true },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }
  update(supplierId: number, dto: UpdateSupplierDto) {
    return this.db.catalogWrite(async (tx) => {
      if (!(await tx.supplier.findUnique({ where: { supplierId } })))
        throw new NotFoundException('Proveedor no encontrado');
      await this.unique(tx, dto, supplierId);
      return tx.supplier.update({
        where: { supplierId },
        data: {
          ...dto,
          ...(dto.name !== undefined
            ? { normalizedName: dto.name.toLowerCase() }
            : {}),
        },
        omit: { normalizedName: true },
      });
    });
  }
  async list(dto: ListSuppliersDto) {
    const search = dto.search ? escapeSearchText(dto.search) : undefined;
    const where: Prisma.SupplierWhereInput = {
      ...activeStatusWhere(dto.status),
      ...(search
        ? {
            OR: ['name', 'document', 'contactName', 'email', 'phone'].map(
              (field) => ({
                [field]: { contains: search, mode: 'insensitive' },
              }),
            ),
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.supplier.findMany({
          where,
          orderBy: { supplierId: 'desc' },
          omit: { normalizedName: true },
          skip: (dto.page - 1) * dto.limit,
          take: dto.limit,
        }),
        this.db.supplier.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total, page: dto.page, limit: dto.limit };
  }
}
