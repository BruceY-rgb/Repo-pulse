import { IsEnum, IsString, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { Platform } from '@repo-pulse/database';

export class CreateRepositoryDto {
  @IsEnum(Platform)
  platform!: Platform;

  @IsString()
  owner!: string;

  @IsString()
  repo!: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export class UpdateRepositoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class RepositoryQueryDto {
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class RepositorySyncSummaryDto {
  @IsString()
  repositoryId!: string;

  createdCount!: number;

  skippedCount!: number;

  updatedCount!: number;

  failedSources!: string[];

  lastSyncAt!: string;
}
