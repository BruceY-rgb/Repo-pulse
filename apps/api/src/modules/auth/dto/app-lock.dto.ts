import { IsString, MinLength } from 'class-validator';

export class EnableAppLockDto {
  @IsString()
  @MinLength(6)
  password!: string;
}

export class ChangeAppLockPasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class DisableAppLockDto {
  @IsString()
  @MinLength(6)
  password!: string;
}
