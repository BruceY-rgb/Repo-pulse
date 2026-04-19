import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private clientID: string;
  private clientSecret: string;
  private callbackURL: string;

  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('GITHUB_CLIENT_ID') || '';
    const clientSecret = configService.get<string>('GITHUB_CLIENT_SECRET') || '';
    const callbackURL = configService.get<string>('GITHUB_CALLBACK_URL') || '';

    super({
      clientID: clientID || 'disabled-github-client-id',
      clientSecret: clientSecret || 'disabled-github-client-secret',
      callbackURL: callbackURL || 'http://localhost:3001/auth/github/callback',
      scope: ['user:email', 'repo'],
    });

    this.clientID = clientID;
    this.clientSecret = clientSecret;
    this.callbackURL = callbackURL;
  }

  updateCredentials(clientID: string, clientSecret: string) {
    this.clientID = clientID;
    this.clientSecret = clientSecret;

    // passport-github2 stores credentials in oauth2 internals.
    (this as unknown as { _oauth2: { _clientId: string; _clientSecret: string } })._oauth2._clientId = clientID;
    (this as unknown as { _oauth2: { _clientId: string; _clientSecret: string } })._oauth2._clientSecret = clientSecret;
  }

  isConfigured() {
    return Boolean(this.clientID && this.clientSecret && this.callbackURL);
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
