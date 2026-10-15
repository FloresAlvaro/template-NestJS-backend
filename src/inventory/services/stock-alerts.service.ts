import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/services/prisma.service';
import { escapeSearchText } from '../../common/utils/search-filter';
import { StockAlertsDto } from '../dto/stock-alerts.dto';
type AlertRow = {
  productId: number;
  name: string;
  sku: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  minStock: number;
  category: string;
  subCategory: string;
};
@Injectable()
export class StockAlertsService {
  constructor(private readonly db: PrismaService) {}
  list(dto: StockAlertsDto) {
    const at = new Date();
    const search = '%' + escapeSearchText(dto.search ?? '') + '%';
    const base = Prisma.sql`WITH reservations AS (
  SELECT oi."productId",SUM(oi.quantity)::integer AS reserved FROM "OrderItem" oi JOIN "Order" o ON o."orderId"=oi."orderId" WHERE o.status='PENDING' AND o."expiresAt">${at} GROUP BY oi."productId"
 ), stocks AS (
 SELECT p."productId",p.name,p.sku,COALESCE(i.quantity,0)::integer quantity,COALESCE(i."minStock",0)::integer "minStock",COALESCE(r.reserved,0)::integer "reservedQuantity",
 GREATEST(0,COALESCE(i.quantity,0)-COALESCE(r.reserved,0))::integer "availableQuantity",c.name category,s.name "subCategory"
 FROM "Product" p JOIN "SubCategory" s ON s."subCategoryId"=p."subCategoryId" JOIN "Category" c ON c."categoryId"=s."categoryId"
 LEFT JOIN "Inventory" i ON i."productId"=p."productId" LEFT JOIN reservations r ON r."productId"=p."productId"
 WHERE p."isActive" AND s."isActive" AND c."isActive"
 ), alerts AS (SELECT * FROM stocks WHERE "availableQuantity" <= "minStock")`;
    const filter = Prisma.sql`WHERE (name ILIKE ${search} OR sku ILIKE ${search}) ${dto.severity === 'OUT_OF_STOCK' ? Prisma.sql`AND "availableQuantity"=0` : dto.severity === 'LOW_STOCK' ? Prisma.sql`AND "availableQuantity">0` : Prisma.empty}`;
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<AlertRow[]>(
          Prisma.sql`${base} SELECT * FROM alerts ${filter} ORDER BY "availableQuantity", "productId" LIMIT ${dto.limit} OFFSET ${(dto.page - 1) * dto.limit}`,
        );
        const counts = await tx.$queryRaw<{ total: number }[]>(
          Prisma.sql`${base} SELECT COUNT(*)::integer total FROM alerts ${filter}`,
        );
        const summary = await tx.$queryRaw<
          { total: number; outOfStock: number; lowStock: number }[]
        >(
          Prisma.sql`${base} SELECT COUNT(*)::integer total,COUNT(*) FILTER(WHERE "availableQuantity"=0)::integer "outOfStock",COUNT(*) FILTER(WHERE "availableQuantity">0)::integer "lowStock" FROM alerts`,
        );
        return {
          data: rows.map((row) => ({
            ...row,
            severity:
              row.availableQuantity === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
            suggestedQuantity: row.minStock + 1 - row.availableQuantity,
          })),
          total: counts[0].total,
          page: dto.page,
          limit: dto.limit,
          summary: summary[0],
          asOf: at.toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
