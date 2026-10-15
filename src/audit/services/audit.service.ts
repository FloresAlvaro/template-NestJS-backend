import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/services/prisma.service';
import { AuditListDto } from '../dto/audit.dto';
@Injectable()
export class AuditService {
  constructor(private readonly db: PrismaService) {}
  async list(dto: AuditListDto) {
    const where = {
      entity: dto.entity,
      entityId: dto.entityId,
      actorId: dto.actorId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        orderBy: { auditId: 'desc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total, page: dto.page, limit: dto.limit };
  }
}
