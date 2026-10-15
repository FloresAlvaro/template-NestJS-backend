import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/services/prisma.service';
import { LoginDto, RegisterDto, CustomerProfileDto } from '../dto/auth.dto';
import { hashPassword, verifyPassword, tokenHash } from '../security/password';
import { userSelect } from '../types/auth.types';
import { Prisma, Role } from '../../../generated/prisma/client';

@Injectable()
export class AuthService {
  private readonly dummy = hashPassword('dummy-password-never-valid');
  constructor(private readonly db: PrismaService) {}
  register(dto: RegisterDto) {
    return this.createAccount(dto, Role.CUSTOMER);
  }
  async createAccount(dto: RegisterDto, role: Role) {
    const passwordHash = await hashPassword(dto.password);
    try {
      return await this.db.catalogWrite((tx) =>
        tx.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            passwordHash,
            role,
            ...(role === Role.CUSTOMER
              ? { customer: { create: { name: dto.name } } }
              : {}),
          },
          select: userSelect,
        }),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      )
        throw new ConflictException('Email already registered');
      throw err;
    }
  }
  async login(dto: LoginDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });
    const valid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? (await this.dummy),
    );
    if (!user || !valid || !user.isActive)
      throw new UnauthorizedException('Invalid email or password');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await this.db.catalogWrite(async (tx) => {
      const current = await tx.user.findUnique({
        where: { userId: user.userId },
      });
      if (
        !current?.isActive ||
        current.passwordHash !== user.passwordHash ||
        current.role !== user.role
      )
        throw new UnauthorizedException('Account changed; log in again');
      await tx.session.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      });
      await tx.session.create({
        data: { tokenHash: tokenHash(token), userId: user.userId, expiresAt },
      });
    });
    const safeUser = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
    return { token, expiresAt, user: safeUser };
  }
  async logout(hash: string) {
    await this.db.session.deleteMany({ where: { tokenHash: hash } });
    return { success: true };
  }
  async profile(userId: number, name: string) {
    return this.db.catalogWrite(async (tx) => {
      await tx.customer.updateMany({ where: { userId }, data: { name } });
      return tx.user.update({
        where: { userId },
        data: { name },
        select: userSelect,
      });
    });
  }
  async changePassword(userId: number, current: string, password: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { userId } });
    if (!(await verifyPassword(current, user.passwordHash)))
      throw new UnauthorizedException('Current password is incorrect');
    return this.replacePassword(userId, password, user.passwordHash);
  }
  async replacePassword(
    userId: number,
    password: string,
    expectedHash?: string,
  ) {
    const passwordHash = await hashPassword(password);
    return this.db.catalogWrite(async (tx) => {
      const user = await tx.user.findUnique({ where: { userId } });
      if (!user) throw new NotFoundException('User not found');
      if (expectedHash !== undefined && user.passwordHash !== expectedHash)
        throw new UnauthorizedException('Password changed; try again');
      await this.replacePasswordInTransaction(tx, userId, passwordHash);
      return { success: true };
    });
  }
  updateCustomer(userId: number, dto: CustomerProfileDto) {
    return this.db.customer.update({ where: { userId }, data: dto });
  }
  async replacePasswordInTransaction(
    tx: Prisma.TransactionClient,
    userId: number,
    passwordHash: string,
  ) {
    await tx.user.update({ where: { userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.passwordReset.deleteMany({ where: { userId } });
  }
  async customer(userId: number) {
    const profile = await this.db.customer.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Customer profile not found');
    return profile;
  }
}
