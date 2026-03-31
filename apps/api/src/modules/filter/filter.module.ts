import { Module } from '@nestjs/common';
import { FilterController } from './filter.controller';
import { FilterService } from './filter.service';

@Module({
  controllers: [FilterController],
  providers: [FilterService],
  exports: [FilterService],
})
export class FilterModule {}