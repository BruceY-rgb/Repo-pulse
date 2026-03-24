import { IsOptional, IsNumber, IsString, IsDateString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { EventType } from '@repo-pulse/database';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class EventQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;
}

export class EventStatsQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
