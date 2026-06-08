import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class BootstrapDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin User' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  verificationCode!: string;

  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional()
  @IsString()
  username?: string;
}
