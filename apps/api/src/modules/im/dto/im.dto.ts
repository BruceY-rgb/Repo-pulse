import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SaveFeishuConnectionDto {
  @IsString()
  @IsNotEmpty()
  appId!: string;

  @IsString()
  @IsNotEmpty()
  appSecret!: string;
}

export class CreatePairingCodeDto {
  @IsString()
  @IsIn(['feishu'])
  provider!: 'feishu';
}

export class ImSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsOptional()
  @IsString()
  chatName?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsArray()
  @IsString({ each: true })
  repositoryIds!: string[];

  @IsArray()
  @IsString({ each: true })
  branches!: string[];

  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @IsBoolean()
  enabled!: boolean;
}

export class SaveSubscriptionsDto {
  @IsString()
  @IsIn(['feishu'])
  provider!: 'feishu';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImSubscriptionDto)
  subscriptions!: ImSubscriptionDto[];
}
