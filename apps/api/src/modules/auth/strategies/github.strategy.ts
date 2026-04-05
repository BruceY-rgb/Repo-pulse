import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('GITHUB_CLIENT_ID');
    const clientSecret = configService.get<string>('GITHUB_CLIENT_SECRET');
    const callbackURL = configService.get<string>('GITHUB_CALLBACK_URL');

    super({
      // Keep the app bootable in local development when OAuth is not configured.
      clientID: clientID || 'github-oauth-disabled',
      clientSecret: clientSecret || 'github-oauth-disabled',
      callbackURL: callbackURL || 'http://localhost:3001/auth/github/callback',
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
