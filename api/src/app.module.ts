import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CircleModule } from './circle/circle.module';

@Module({
  imports: [CircleModule],
  controllers: [HealthController],
})
export class AppModule {}
