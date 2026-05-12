import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationChannel } from '@repo-pulse/database';

export class NotificationEventPreferencesDto {
  @IsOptional()
  @IsBoolean()
  highRisk?: boolean;

  @IsOptional()
  @IsBoolean()
  prUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  analysisComplete?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklyReport?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationEventPreferencesDto)
  events?: NotificationEventPreferencesDto;

  @IsOptional()
  @IsUrl({
    require_tld: false,
    require_protocol: true,
  })
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  email?: string;
}

export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  eventId?: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
