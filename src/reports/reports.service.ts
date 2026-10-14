import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  availableQuantity,
  reservedQuantities,
} from '../inventory/reservations';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  ReportPeriodDto,
  ReportSeriesDto,
  TopProductsReportDto,
} from './reports.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}

  // Same balances for summaries, time series and seller comparisons.
  private saleBalances(from: Date, to: Date) {
    return Prisma.sql`
      SELECT s."saleId", s."userId", s."sellerName", s."createdAt", s.total,
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
    `;
  }

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
      WITH balances AS (${this.saleBalances(from, to)})
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

  async topProducts(dto: ReportPeriodDto & Partial<TopProductsReportDto>) {
    const { from, to } = this.period(dto);
    const ranking =
      dto.metric === 'AMOUNT'
        ? Prisma.sql`sum(i.subtotal - COALESCE(r.subtotal, 0))`
        : Prisma.sql`sum(i.quantity - COALESCE(r.quantity, 0))`;
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
      ORDER BY ${ranking} DESC, i."productId", i.sku, i."productName"
      LIMIT 100
    `);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      limit: 100,
      items,
    };
  }

  async salesSeries(dto: ReportSeriesDto) {
    const { from, to } = this.period(dto);
    const unit = dto.group === 'MONTH' ? 'month' : 'day';
    const interval = dto.group === 'MONTH' ? '1 month' : '1 day';
    const items = await this.db.$queryRaw<
      {
        date: string;
        saleCount: number;
        originalTotal: string;
        adjustedTotal: string;
      }[]
    >(Prisma.sql`
      WITH balances AS (${this.saleBalances(from, to)}),
      buckets AS (
        SELECT generate_series(
          date_trunc(${unit}, ${from}::timestamptz AT TIME ZONE 'America/La_Paz'),
          date_trunc(${unit}, (${to}::timestamptz - interval '1 microsecond') AT TIME ZONE 'America/La_Paz'),
          ${interval}::interval
        ) AS bucket
      ), totals AS (
        SELECT date_trunc(${unit}, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/La_Paz') AS bucket,
          count(*)::integer AS "saleCount", sum(total) AS original, sum(adjusted) AS net
        FROM balances GROUP BY 1
      )
      SELECT to_char(b.bucket, 'YYYY-MM-DD') AS date,
        COALESCE(t."saleCount", 0)::integer AS "saleCount",
        COALESCE(t.original, 0)::numeric(38,2)::text AS "originalTotal",
        COALESCE(t.net, 0)::numeric(38,2)::text AS "adjustedTotal"
      FROM buckets b LEFT JOIN totals t USING (bucket) ORDER BY b.bucket
    `);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      group: dto.group,
      timeZone: 'America/La_Paz',
      items,
    };
  }

  async sellers(dto: ReportPeriodDto) {
    const { from, to } = this.period(dto);
    const rows = await this.db.$queryRaw<
      {
        userId: number;
        sellerName: string;
        saleCount: number;
        adjustedTotal: string;
        originalTotal: string;
        total: number;
      }[]
    >(Prisma.sql`
      WITH balances AS (${this.saleBalances(from, to)})
      SELECT "userId",
        (array_agg("sellerName" ORDER BY "createdAt" DESC, "saleId" DESC))[1] AS "sellerName",
        count(*)::integer AS "saleCount",
        sum(total)::numeric(38,2)::text AS "originalTotal",
        sum(adjusted)::numeric(38,2)::text AS "adjustedTotal",
        count(*) OVER()::integer AS total
      FROM balances GROUP BY "userId"
      ORDER BY sum(adjusted) DESC, "userId" LIMIT 100
    `);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      limit: 100,
      total: rows[0]?.total ?? 0,
      items: rows.map(({ total, ...row }) => {
        void total;
        return row;
      }),
    };
  }

  async paymentMethods(dto: ReportPeriodDto) {
    const { from, to } = this.period(dto);
    const items = await this.db.$queryRaw<
      {
        method: string;
        paymentCount: number;
        amount: string;
      }[]
    >(Prisma.sql`
      SELECT m.method, count(o."operationId")::integer AS "paymentCount",
        COALESCE(sum(o.amount), 0)::numeric(38,2)::text AS amount
      FROM (VALUES ('CASH'), ('CARD'), ('TRANSFER')) AS m(method)
      LEFT JOIN "SaleOperation" o ON o.method::text = m.method
        AND o.kind = 'PAYMENT' AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
      GROUP BY m.method ORDER BY m.method
    `);
    return { from: from.toISOString(), to: to.toISOString(), items };
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
        const reservations = await reservedQuantities(
          tx,
          items.map((item) => item.productId),
        );
        return {
          items: items.map((item) => ({
            ...item,
            reservedQuantity: reservations.get(item.productId) ?? 0,
            availableQuantity: availableQuantity(
              item.inventory?.quantity ?? 0,
              reservations.get(item.productId) ?? 0,
            ),
          })),
          total,
          page: dto.page,
          limit: dto.limit,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
