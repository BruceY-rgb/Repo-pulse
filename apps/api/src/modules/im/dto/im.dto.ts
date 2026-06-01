import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const IM_PROVIDERS = ['feishu', 'dingtalk', 'wecom', 'wechat'] as const;
export type ImProvider = typeof IM_PROVIDERS[number];

export class SaveFeishuConnectionDto {
  @IsString()
  @IsNotEmpty()
  appId!: string;

  @IsString()
  @IsNotEmpty()
  appSecret!: string;
}

export class SaveDingTalkConnectionDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  clientSecret!: string;

  @IsOptional()
  @IsString()
  botName?: string;
}

export class SaveWecomConnectionDto {
  @IsString()
  @IsNotEmpty()
  botId!: string;

  @IsString()
  @IsNotEmpty()
  secret!: string;

  @IsOptional()
  @IsString()
  botName?: string;
}

export class SaveWechatConnectionDto {
  @IsString()
  @IsNotEmpty()
  botToken!: string;

  @IsString()
  @IsNotEmpty()
  ilinkBotId!: string;

  @IsString()
  @IsNotEmpty()
  ilinkUserId!: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;
}

export class CreatePairingCodeDto {
  @IsString()
  @IsIn(IM_PROVIDERS)
  provider!: ImProvider;
}

export class ImSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsOptional()
  @IsString()
  @IsIn(IM_PROVIDERS)
  provider?: ImProvider;

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

  @IsOptional()
  @IsObject()
  repositoryBranchScopes?: Record<string, string[]>;

  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @IsBoolean()
  enabled!: boolean;
}

export class SaveSubscriptionsDto {
  @IsString()
  @IsIn(IM_PROVIDERS)
  provider!: ImProvider;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImSubscriptionDto)
  subscriptions!: ImSubscriptionDto[];
}
