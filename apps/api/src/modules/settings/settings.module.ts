import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UserModule } from '../user/user.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [UserModule, SyncModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
