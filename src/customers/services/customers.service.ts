import { escapeSearchText } from '../../common/utils/search-filter';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/services/prisma.service';
import { activeStatusWhere } from '../../common/utils/status-filter';
import {
  CreateCustomerDto,
  ListCustomersDto,
  UpdateCustomerDto,
} from '../dto/customers.dto';
@Injectable()
export class CustomersService {
  constructor(private readonly db: PrismaService) {}
  create(dto: CreateCustomerDto) {
    return this.db.catalogWrite((tx) => tx.customer.create({ data: dto }));
  }
  async get(customerId: number) {
    const customer = await this.db.customer.findUnique({
      where: { customerId },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }
  update(customerId: number, dto: UpdateCustomerDto) {
    return this.db.catalogWrite(async (tx) => {
      if (!(await tx.customer.findUnique({ where: { customerId } })))
        throw new NotFoundException('Cliente no encontrado');
      return tx.customer.update({ where: { customerId }, data: dto });
    });
  }
  async list(dto: ListCustomersDto) {
    const search = dto.search ? escapeSearchText(dto.search) : undefined;
    const where: Prisma.CustomerWhereInput = {
      ...activeStatusWhere(dto.status),
      ...(search
        ? {
            OR: ['name', 'document', 'phone'].map((field) => ({
              [field]: { contains: search, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.customer.findMany({
          where,
          orderBy: { customerId: 'desc' },
          take: dto.limit,
          skip: (dto.page - 1) * dto.limit,
        }),
        this.db.customer.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total, page: dto.page, limit: dto.limit };
  }
}
