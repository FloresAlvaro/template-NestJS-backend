import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/services/prisma.service';

// Throttle state now outlives application instances. Each test starts with its
// own window; multiple apps created inside one test still share the real counter.
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Dedicated TEST_DATABASE_URL required');
const db = new PrismaService(new ConfigService({ DATABASE_URL: url }));
beforeEach(async () => {
  await db.authRateLimit.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});
