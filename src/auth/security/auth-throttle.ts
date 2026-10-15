import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { PrismaService } from '../../database/services/prisma.service';

export async function consumeAuthAttempt(db: PrismaService, identity: string) {
  const key = createHash('sha256').update(identity).digest('hex');
  // Atomic across processes, using the database clock. Bound expired-row cleanup
  // so a login never waits for an unbounded maintenance operation.
  const [bucket] = await db.$queryRaw<{ attempts: number }[]>`
    WITH cleanup AS (
      DELETE FROM "AuthRateLimit" WHERE "key" IN (
        SELECT "key" FROM "AuthRateLimit"
        WHERE "expiresAt" < CURRENT_TIMESTAMP - interval '5 minutes'
          AND "key" <> ${key}
        ORDER BY "expiresAt" LIMIT 100
      )
    )
    INSERT INTO "AuthRateLimit" ("key", attempts, "expiresAt")
    VALUES (${key}, 1, CURRENT_TIMESTAMP + interval '1 minute')
    ON CONFLICT ("key") DO UPDATE SET
      attempts = CASE WHEN "AuthRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
        THEN 1 ELSE LEAST("AuthRateLimit".attempts + 1, 11) END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
        THEN CURRENT_TIMESTAMP + interval '1 minute' ELSE "AuthRateLimit"."expiresAt" END
    RETURNING attempts
  `;
  if (bucket.attempts > 10)
    throw new HttpException('Too many attempts. Try again later.', 429);
}
