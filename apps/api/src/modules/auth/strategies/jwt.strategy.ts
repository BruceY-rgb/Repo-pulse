import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { JwtPayload } from '../auth.service';

/**
 * 从请求中提取 JWT Token
 * 优先级：Authorization Header (Bearer) > Cookie (access_token)
 */
function extractJwtFromRequestOrCookie(req: Request): string | null {
  // 1. 尝试从 Authorization Header 提取
  const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (bearerToken) {
    return bearerToken;
  }

  // 2. 回退到 HttpOnly Cookie
  const cookieToken = req.cookies?.access_token as string | undefined;
  return cookieToken ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: extractJwtFromRequestOrCookie,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload) {
    return { sub: payload.sub, email: payload.email, role: payload.role };
  }
}
