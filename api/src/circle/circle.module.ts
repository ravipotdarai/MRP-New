import { Module } from '@nestjs/common';
import { CircleController } from './circle.controller';
import { CircleService } from './circle.service';

@Module({
  controllers: [CircleController],
  providers: [CircleService],
})
export class CircleModule {}
