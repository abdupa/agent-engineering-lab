import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { AuditModule } from './audit/audit.module';
import { ResearchModule } from './research/research.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: validateEnvironment,
    }),
    ResearchModule,
    AuditModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
