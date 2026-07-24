import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CircleService } from './circle.service';

/**
 * Control plane stubs — live lat/lng stays on Firebase RTDB (see CIRCLE_LIVE.md).
 * Wire Firebase Auth JWT guard in P6.
 */
@Controller('circles')
export class CircleController {
  constructor(private readonly circles: CircleService) {}

  @Get()
  list() {
    return this.circles.list();
  }

  @Post()
  create(@Body() body: { name: string; category: string; ownerUid: string }) {
    return this.circles.create(body);
  }

  @Post(':id/join')
  join(
    @Param('id') id: string,
    @Body() body: { inviteCode: string; uid: string; displayName: string },
  ) {
    return this.circles.join(id, body);
  }

  @Post(':id/consent')
  consent(
    @Param('id') id: string,
    @Body() body: { uid: string; consentLive: boolean },
  ) {
    return this.circles.setConsent(id, body);
  }

  @Post(':id/invite/push')
  invitePush(@Param('id') id: string, @Body() body: { targetUid?: string }) {
    return this.circles.invitePushStub(id, body.targetUid);
  }
}
