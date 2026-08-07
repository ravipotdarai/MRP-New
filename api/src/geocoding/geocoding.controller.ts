import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { GeocodingService } from './geocoding.service';

@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geo: GeocodingService) {}

  @Post('reverse')
  reverse(
    @CurrentUser() user: AuthUser,
    @Body() body: { lat?: number; lng?: number },
  ) {
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('lat and lng required');
    }
    return this.geo.reverse(user.uid, lat, lng);
  }

  @Post('nearby')
  nearby(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      lat?: number;
      lng?: number;
      radiusM?: number;
      categories?: string[];
    },
  ) {
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('lat and lng required');
    }
    return this.geo.nearby(user.uid, lat, lng, body?.radiusM, body?.categories);
  }
}
