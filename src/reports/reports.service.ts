import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ReportPeriodDto } from './reports.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}

  private period(dto: ReportPeriodDto) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (
      ![dto.from, dto.to].every((value) =>
        /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value),
      ) ||
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to <= from ||
      to.getTime() - from.getTime() > 366 * 86400000
    ) {
      throw new BadRequestException(
        'Use timestamps with timezone and a period of at most 366 days',
      );
    }
    return { from, to };
  }

  async sales(dto: ReportPeriodDto) {
    const { from, to } = this.period(dto);
    const [summary] = await this.db.$queryRaw<
      {
        saleCount: number;
        originalTotal: string;
        adjustedTotal: string;
        paid: string;
        refunded: string;
        balanceDue: string;
        refundDue: string;
      }[]
    >(Prisma.sql`
      WITH balances AS (
        SELECT s.total,
          CASE WHEN COALESCE(o.cancelled, false) THEN 0
            ELSE s.total - COALESCE(o.returned, 0) END AS adjusted,
          COALESCE(o.paid, 0) AS paid, COALESCE(o.refunded, 0) AS refunded
        FROM "Sale" s
        LEFT JOIN LATERAL (
          SELECT bool_or(kind = 'CANCEL') AS cancelled,
            sum(amount) FILTER (WHERE kind IN ('RETURN', 'CANCEL')) AS returned,
            sum(amount) FILTER (WHERE kind = 'PAYMENT') AS paid,
            sum(amount) FILTER (WHERE kind = 'REFUND') AS refunded
          FROM "SaleOperation" WHERE "saleId" = s."saleId"
        ) o ON true
        WHERE s."createdAt" >= ${from} AND s."createdAt" < ${to}
      )
      SELECT count(*)::integer AS "saleCount",
        COALESCE(sum(total), 0)::numeric(38,2)::text AS "originalTotal",
        COALESCE(sum(adjusted), 0)::numeric(38,2)::text AS "adjustedTotal",
        COALESCE(sum(paid), 0)::numeric(38,2)::text AS paid,
        COALESCE(sum(refunded), 0)::numeric(38,2)::text AS refunded,
        COALESCE(sum(greatest(0, adjusted - paid + refunded)), 0)::numeric(38,2)::text AS "balanceDue",
        COALESCE(sum(greatest(0, paid - refunded - adjusted)), 0)::numeric(38,2)::text AS "refundDue"
      FROM balances
    `);
    return { from: from.toISOString(), to: to.toISOString(), ...summary };
  }

  async topProducts(dto: ReportPeriodDto) {
    const { from, to } = this.period(dto);
    const items = await this.db.$queryRaw<
      {
        productId: number;
        sku: string;
        productName: string;
        quantity: string;
        netTotal: string;
      }[]
    >(Prisma.sql`
      SELECT i."productId", i.sku, i."productName",
        sum(i.quantity - COALESCE(r.quantity, 0))::text AS quantity,
        sum(i.subtotal - COALESCE(r.subtotal, 0))::numeric(38,2)::text AS "netTotal"
      FROM "SaleItem" i JOIN "Sale" s ON s."saleId" = i."saleId"
      LEFT JOIN LATERAL (
        SELECT sum(quantity) AS quantity, sum(subtotal) AS subtotal
        FROM "SaleOperationItem" WHERE "saleItemId" = i."saleItemId"
      ) r ON true
      WHERE s."createdAt" >= ${from} AND s."createdAt" < ${to}
      GROUP BY i."productId", i.sku, i."productName"
      HAVING sum(i.quantity - COALESCE(r.quantity, 0)) > 0
      ORDER BY sum(i.quantity - COALESCE(r.quantity, 0)) DESC, i."productId", i.sku, i."productName"
      LIMIT 100
    `);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      limit: 100,
      items,
    };
  }

  async inventory() {
    const [summary] = await this.db.$queryRaw<
      {
        productCount: number;
        outOfStock: number;
        lowStock: number;
        available: number;
        quantity: string;
      }[]
    >(Prisma.sql`
      SELECT count(*)::integer AS "productCount",
        count(*) FILTER (WHERE COALESCE(i.quantity, 0) = 0)::integer AS "outOfStock",
        count(*) FILTER (WHERE i.quantity > 0 AND i.quantity <= i."minStock")::integer AS "lowStock",
        count(*) FILTER (WHERE i.quantity > i."minStock")::integer AS available,
        COALESCE(sum(i.quantity), 0)::text AS quantity
      FROM "Product" p LEFT JOIN "Inventory" i ON i."productId" = p."productId"
      JOIN "SubCategory" sc ON sc."subCategoryId" = p."subCategoryId"
      JOIN "Category" c ON c."categoryId" = sc."categoryId"
      WHERE p."isActive" AND sc."isActive" AND c."isActive"
    `);
    return summary;
  }

  lowStock(dto: PaginationDto) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      subCategory: { isActive: true, category: { isActive: true } },
      OR: [
        { inventory: { is: null } },
        {
          inventory: {
            is: { quantity: { lte: this.db.inventory.fields.minStock } },
          },
        },
      ],
    };
    return this.db.$transaction(
      async (tx) => {
        const [items, total] = await Promise.all([
          tx.product.findMany({
            where,
            select: {
              productId: true,
              name: true,
              sku: true,
              inventory: { select: { quantity: true, minStock: true } },
            },
            orderBy: { productId: 'asc' },
            skip: (dto.page - 1) * dto.limit,
            take: dto.limit,
          }),
          tx.product.count({ where }),
        ]);
        return { items, total, page: dto.page, limit: dto.limit };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
