import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CircleModule } from './circle/circle.module';
import { DeviceModule } from './device/device.module';

@Module({
  imports: [CircleModule, DeviceModule],
  controllers: [HealthController],
})
export class AppModule {}
