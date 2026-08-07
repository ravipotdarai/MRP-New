import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { CircleModule } from './circle/circle.module';
import { DeviceModule } from './device/device.module';
import { CircleLiveAdminController } from './admin/circle-live-admin.controller';

import { GeocodingModule } from './geocoding/geocoding.module';

@Module({
  imports: [AuthModule, CircleModule, DeviceModule, GeocodingModule],
  controllers: [HealthController, CircleLiveAdminController],
})
export class AppModule {}
