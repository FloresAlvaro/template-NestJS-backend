import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/services/prisma.service';
import { PromotionDto, PromotionListDto } from '../dto/promotions.dto';
import { escapeSearchText } from '../../common/utils/search-filter';
import type { AuthUser } from '../../auth/types/auth.types';
@Injectable()
export class PromotionsService {
  constructor(private readonly db: PrismaService) {}
  async list(dto: PromotionListDto, user: AuthUser) {
    const at = new Date();
    const where =
      user.role === 'ADMIN' && dto.available !== 'true'
        ? {}
        : {
            isActive: true,
            ...(user.role === 'ADMIN' ? {} : { allowSeller: true }),
            startsAt: { lte: at },
            endsAt: { gt: at },
          };
    const filter = {
      ...where,
      ...(dto.search
        ? {
            OR: [
              {
                name: {
                  contains: escapeSearchText(dto.search),
                  mode: 'insensitive' as const,
                },
              },
              {
                code: {
                  contains: escapeSearchText(dto.search),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.promotion.findMany({
        where: filter,
        orderBy: { promotionId: 'desc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
      this.db.promotion.count({ where: filter }),
    ]);
    return {
      items: items.map((p) => ({
        ...p,
        minSubtotal: p.minSubtotal.toFixed(2),
      })),
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }
  async get(promotionId: number, user: AuthUser) {
    const p = await this.db.promotion.findUnique({ where: { promotionId } });
    if (!p) throw new NotFoundException('Promoción no encontrada');
    const at = new Date();
    if (
      user.role !== 'ADMIN' &&
      (!p.allowSeller || !p.isActive || p.startsAt > at || p.endsAt <= at)
    )
      throw new ForbiddenException('Promoción no disponible para vendedores');
    return { ...p, minSubtotal: p.minSubtotal.toFixed(2) };
  }
  save(dto: PromotionDto, promotionId?: number) {
    if (new Date(dto.endsAt) <= new Date(dto.startsAt))
      throw new BadRequestException('El fin debe ser posterior al inicio');
    return this.db.catalogWrite(async (tx) => {
      if (
        promotionId &&
        !(await tx.promotion.findUnique({ where: { promotionId } }))
      )
        throw new NotFoundException('Promoción no encontrada');
      if (
        await tx.promotion.findFirst({
          where: {
            code: dto.code,
            ...(promotionId ? { promotionId: { not: promotionId } } : {}),
          },
        })
      )
        throw new ConflictException('El código ya existe');
      const data = {
        ...dto,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
      };
      const p = promotionId
        ? await tx.promotion.update({
            where: { promotionId },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.promotion.create({ data });
      return { ...p, minSubtotal: p.minSubtotal.toFixed(2) };
    });
  }
}
