import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiProperty({ example: { theme: 'dark', language: 'zh' } })
  @IsObject()
  preferences!: Record<string, unknown>;
}
