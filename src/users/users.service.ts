import { AuthService } from '../auth/auth.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { userSelect } from '../auth/auth.types';
import { Role } from '../../generated/prisma/client';
@Injectable()
export class UsersService {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
  ) {}
  async list(dto: PaginationDto) {
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        select: userSelect,
        orderBy: { userId: 'asc' },
        take: dto.limit,
        skip: (dto.page - 1) * dto.limit,
      }),
      this.db.user.count(),
    ]);
    return { items, total, page: dto.page, limit: dto.limit };
  }
  create(dto: CreateUserDto) {
    return this.auth.createAccount(dto, dto.role);
  }
  update(id: number, dto: UpdateUserDto, actorId: number) {
    return this.db.catalogWrite(async (tx) => {
      const user = await tx.user.findUnique({ where: { userId: id } });
      if (!user) throw new NotFoundException('User not found');
      if (
        id === actorId &&
        (dto.isActive === false || (dto.role && dto.role !== Role.ADMIN))
      )
        throw new ConflictException(
          'Cannot deactivate or demote your own administrator account',
        );
      if (
        user.role === Role.ADMIN &&
        user.isActive &&
        (dto.isActive === false || (dto.role && dto.role !== Role.ADMIN)) &&
        (await tx.user.count({
          where: { role: Role.ADMIN, isActive: true },
        })) <= 1
      )
        throw new ConflictException(
          'At least one active administrator is required',
        );
      if (dto.role === Role.CUSTOMER)
        await tx.customer.upsert({
          where: { userId: id },
          create: { userId: id, name: dto.name ?? user.name },
          update: { name: dto.name ?? user.name },
        });
      else if (dto.name)
        await tx.customer.updateMany({
          where: { userId: id },
          data: { name: dto.name },
        });
      if (dto.role !== undefined || dto.isActive === false)
        await tx.session.deleteMany({ where: { userId: id } });
      return tx.user.update({
        where: { userId: id },
        data: dto,
        select: userSelect,
      });
    });
  }
  resetPassword(id: number, password: string) {
    return this.auth.replacePassword(id, password);
  }
}
