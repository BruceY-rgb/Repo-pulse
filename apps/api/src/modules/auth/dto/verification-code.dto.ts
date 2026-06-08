import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn } from 'class-validator';

export type VerificationCodePurpose = 'LOGIN' | 'BOOTSTRAP';

export class SendVerificationCodeDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ['LOGIN', 'BOOTSTRAP'], example: 'LOGIN' })
  @IsIn(['LOGIN', 'BOOTSTRAP'])
  purpose!: VerificationCodePurpose;
}
