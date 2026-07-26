import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { DeviceService, DeviceTrackingConfig } from './device.service';

/**
 * Device tracking + config stubs for web/admin (P6).
 * Auth JWT guard TBD — do not expose without Firebase Auth middleware.
 */
@Controller('devices')
export class DeviceController {
  constructor(private readonly devices: DeviceService) {}

  @Get(':uid/config/defaults')
  defaults() {
    return this.devices.defaults();
  }

  @Get(':uid/live')
  live(@Param('uid') uid: string) {
    return this.devices.liveStub(uid);
  }

  @Patch(':uid/config')
  async patchConfig(
    @Param('uid') uid: string,
    @Body()
    body: Partial<DeviceTrackingConfig> & { source?: 'web' | 'admin' },
  ) {
    const { source, ...patch } = body;
    return this.devices.patchConfig(uid, patch, source === 'admin' ? 'admin' : 'web');
  }
}
