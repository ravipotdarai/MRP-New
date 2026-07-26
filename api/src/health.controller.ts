import { Controller, Get } from '@nestjs/common';
import { isAdminSdkConfigured } from './firebase/admin';

@Controller('health')
export class HealthController {
  @Get()
  ok() {
    return {
      ok: true,
      service: 'mrp-api',
      firebaseAdmin: isAdminSdkConfigured(),
    };
  }
}
