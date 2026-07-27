import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { assertActorUid } from '../auth/ownership';
import { CircleService } from './circle.service';

/**
 * Control plane — live lat/lng stays on Firebase RTDB.
 * Firebase JWT required (P8-3).
 */
@Controller('circles')
export class CircleController {
  constructor(private readonly circles: CircleService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.circles.listForUid(user.uid, user.isAdmin);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; category: string; ownerUid?: string },
  ) {
    const ownerUid = assertActorUid(
      user,
      body.ownerUid ?? user.uid,
      'ownerUid',
    );
    return this.circles.create({
      name: body.name,
      category: body.category,
      ownerUid,
    });
  }

  @Post(':id/join')
  join(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { inviteCode: string; uid?: string; displayName: string },
  ) {
    const uid = assertActorUid(user, body.uid ?? user.uid);
    return this.circles.join(id, {
      inviteCode: body.inviteCode,
      uid,
      displayName: body.displayName,
    });
  }

  @Post(':id/consent')
  consent(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { uid?: string; consentLive: boolean },
  ) {
    const uid = assertActorUid(user, body.uid ?? user.uid);
    return this.circles.setConsent(id, { uid, consentLive: body.consentLive });
  }

  @Post(':id/invite/push')
  invitePush(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { targetUid?: string; targetFcmToken?: string },
  ) {
    return this.circles.invitePush(id, user.uid, body);
  }
}
