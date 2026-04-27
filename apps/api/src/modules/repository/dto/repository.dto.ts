import { IsEnum, IsString, IsOptional, IsBoolean } from 'class-validator';
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
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class RepositorySyncSummaryDto {
  @IsString()
  repositoryId!: string;

  createdCount!: number;

  skippedCount!: number;

  failedSources!: string[];

  lastSyncAt!: string;
}
