import { IsISO8601, IsOptional } from 'class-validator';

export class ReadConversationDto {
  @IsOptional()
  @IsISO8601()
  readAt?: string;

  @IsOptional()
  @IsISO8601()
  upToMessageAt?: string;
}
