import { IsOptional, IsString, MinLength } from 'class-validator';

export class DesktopSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
