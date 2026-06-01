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

  @IsOptional()
  @IsString()
  appSecret?: string;

  @IsOptional()
  @IsString()
  botName?: string;
}

export class SaveDingTalkConnectionDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsString()
  botName?: string;
}

export class SaveWecomConnectionDto {
  @IsString()
  @IsNotEmpty()
  botId!: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsString()
  botName?: string;
}

export class SaveWechatConnectionDto {
  @IsOptional()
  @IsString()
  botToken?: string;

  @IsString()
  @IsNotEmpty()
  ilinkBotId!: string;

  @IsOptional()
  @IsString()
  ilinkUserId?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  botName?: string;
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

  @IsOptional()
  @IsString()
  robotId?: string;

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
