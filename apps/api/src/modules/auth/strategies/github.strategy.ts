import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

const GITHUB_RUNTIME_PLACEHOLDER_CLIENT_ID = '__repo_pulse_runtime_github_client_id__';
const GITHUB_RUNTIME_PLACEHOLDER_CLIENT_SECRET = '__repo_pulse_runtime_github_client_secret__';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GithubStrategy.name);
  private clientID: string;
  private clientSecret: string;

  constructor(configService: ConfigService) {
    const clientID =
      configService.get<string>('GITHUB_CLIENT_ID') || GITHUB_RUNTIME_PLACEHOLDER_CLIENT_ID;
    const clientSecret =
      configService.get<string>('GITHUB_CLIENT_SECRET') || GITHUB_RUNTIME_PLACEHOLDER_CLIENT_SECRET;

    super({
      clientID,
      clientSecret,
      callbackURL: configService.get<string>('GITHUB_CALLBACK_URL') || '',
      scope: ['user:email', 'repo'],
    });

    this.clientID = clientID;
    this.clientSecret = clientSecret;
  }

  hasCredentials() {
    return !this.isPlaceholder(this.clientID, this.clientSecret);
  }

  updateCredentials(clientID: string, clientSecret: string) {
    this.clientID = clientID;
    this.clientSecret = clientSecret;

    (this as unknown as { _oauth2: { _clientId: string; _clientSecret: string } })._oauth2._clientId = clientID;
    (this as unknown as { _oauth2: { _clientId: string; _clientSecret: string } })._oauth2._clientSecret = clientSecret;

    this.logger.log(`github_oauth_credentials_updated clientIdSuffix=${clientID.slice(-6)}`);
  }

  private isPlaceholder(clientID: string, clientSecret: string) {
    return (
      !clientID ||
      !clientSecret ||
      clientID === GITHUB_RUNTIME_PLACEHOLDER_CLIENT_ID ||
      clientSecret === GITHUB_RUNTIME_PLACEHOLDER_CLIENT_SECRET
    );
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
    this.logger.log(
      `github_oauth_validate_success githubId=${profile.id} email=${profile.emails[0]?.value ?? 'missing'} accessTokenPresent=${accessToken ? 'true' : 'false'}`,
    );

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
