import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('GITHUB_CLIENT_ID') || '',
      clientSecret: configService.get<string>('GITHUB_CLIENT_SECRET') || '',
      callbackURL: configService.get<string>('GITHUB_CALLBACK_URL') || '',
      scope: ['user:email', 'repo'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: {
      id: string;
      emails: { value: string }[];
      displayName: string;
      photos: { value: string }[];
    },
  ) {
    return {
      id: profile.id,
      email: profile.emails[0]?.value,
      displayName: profile.displayName,
      avatar: profile.photos[0]?.value,
      githubAccessToken: accessToken,
      githubRefreshToken: refreshToken,
    };
  }
}
