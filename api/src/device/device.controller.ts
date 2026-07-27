import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { assertUidAccess } from '../auth/ownership';
import { writeFcmTokenAdmin } from '../push/admin-push.port';
import { DeviceService, DeviceTrackingConfig } from './device.service';

/**
 * Device tracking + config (P6/P8).
 * Requires Firebase ID token; UID path must match token (or admin allowlist).
 */
@Controller('devices')
export class DeviceController {
  constructor(private readonly devices: DeviceService) {}

  @Get(':uid/config/defaults')
  defaults(@Param('uid') uid: string, @CurrentUser() user: AuthUser) {
    assertUidAccess(user, uid);
    return this.devices.defaults();
  }

  @Get(':uid/live')
  live(@Param('uid') uid: string, @CurrentUser() user: AuthUser) {
    assertUidAccess(user, uid);
    return this.devices.liveStub(uid);
  }

  @Patch(':uid/config')
  async patchConfig(
    @Param('uid') uid: string,
    @CurrentUser() user: AuthUser,
    @Body()
    body: Partial<DeviceTrackingConfig> & { source?: 'web' | 'admin' },
  ) {
    assertUidAccess(user, uid);
    const { source, ...patch } = body;
    if (source === 'admin' && !user.isAdmin) {
      throw new ForbiddenException('source=admin requires allowlisted admin');
    }
    return this.devices.patchConfig(
      uid,
      patch,
      source === 'admin' ? 'admin' : 'web',
    );
  }

  /** Register FCM token for Circle invites (P8-4). */
  @Put(':uid/fcm')
  async registerFcm(
    @Param('uid') uid: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { deviceId: string; fcmToken: string },
  ) {
    assertUidAccess(user, uid);
    if (!body?.deviceId?.trim() || !body?.fcmToken?.trim()) {
      throw new BadRequestException('deviceId and fcmToken required');
    }
    const rtdb = await writeFcmTokenAdmin(
      uid,
      body.deviceId.trim(),
      body.fcmToken.trim(),
    );
    return {
      ok: true,
      uid,
      deviceId: body.deviceId.trim(),
      rtdb,
    };
  }
}
