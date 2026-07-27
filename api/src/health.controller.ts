import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.decorators';
import { isAdminSdkConfigured } from './firebase/admin';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  ok() {
    return {
      ok: true,
      service: 'mrp-api',
      firebaseAdmin: isAdminSdkConfigured(),
      auth: 'firebase-jwt',
    };
  }
}
