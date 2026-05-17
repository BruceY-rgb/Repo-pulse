import { Module } from '@nestjs/common';
import { ImController } from './im.controller';
import { ImService } from './im.service';

@Module({
  controllers: [ImController],
  providers: [ImService],
})
export class ImModule {}
