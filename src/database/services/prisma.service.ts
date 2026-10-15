import { auditContext } from '../../audit/context/audit-context';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Serialize catalog writes across instances so parent activation and uniqueness
  // checks cannot race with category deactivation or subcategory moves.
  catalogWrite<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7140321)`;
        const actor = auditContext.getStore();
        await tx.$executeRaw`SELECT set_config('app.audit_actor', ${JSON.stringify(actor ? { userId: actor.userId, name: actor.name } : null)},true)`;
        return operation(tx);
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }
}
