import { Module } from '@nestjs/common';
import { HealthService } from './services/health.service';
import { HealthController } from './controllers/health.controller';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
