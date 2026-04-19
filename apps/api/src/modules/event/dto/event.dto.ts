import {
  IsOptional,
  IsNumber,
  IsString,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  Length,
  Matches,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EventType } from '@repo-pulse/database';

export class RepositoryIdQueryDto {
  @IsString()
  @IsNotEmpty()
  @Length(25, 25)
  @Matches(/^c[a-z0-9]{24}$/, { message: 'Invalid repositoryId' })
  repositoryId!: string;
}

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
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class EventQueryDto extends PaginationQueryDto {
  @IsString()
  @IsNotEmpty()
  @Length(25, 25)
  @Matches(/^c[a-z0-9]{24}$/, { message: 'Invalid repositoryId' })
  repositoryId!: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;
}

export class EventStatsQueryDto extends RepositoryIdQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
