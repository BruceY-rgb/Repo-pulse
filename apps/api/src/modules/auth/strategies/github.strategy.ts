import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import type { Agent as HttpAgent, ClientRequest, RequestOptions } from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';

const GITHUB_RUNTIME_PLACEHOLDER_CLIENT_ID = '__repo_pulse_runtime_github_client_id__';
const GITHUB_RUNTIME_PLACEHOLDER_CLIENT_SECRET = '__repo_pulse_runtime_github_client_secret__';
const DEFAULT_GITHUB_OAUTH_TIMEOUT_MS = 30_000;

type OAuthCallback = (error: unknown, data?: string, response?: unknown) => void;
type OAuthExecuteRequest = (
  httpLibrary: { request(options: RequestOptions): ClientRequest },
  options: RequestOptions,
  postBody: string | Buffer | null,
  callback: OAuthCallback,
) => void;

type OAuth2Client = {
  _clientId: string;
  _clientSecret: string;
  _executeRequest: OAuthExecuteRequest;
  setAgent(agent: HttpAgent): void;
};

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

    this.configureOAuthTransport(configService);
  }

  hasCredentials() {
    return !this.isPlaceholder(this.clientID, this.clientSecret);
  }

  updateCredentials(clientID: string, clientSecret: string) {
    this.clientID = clientID;
    this.clientSecret = clientSecret;

    // passport-github2 stores credentials in oauth2 internals.
    const oauth2 = this.getOAuth2Client();
    oauth2._clientId = clientID;
    oauth2._clientSecret = clientSecret;

    this.logger.log(`github_oauth_credentials_updated clientIdSuffix=${clientID.slice(-6)}`);
  }

  private configureOAuthTransport(configService: ConfigService) {
    const oauth2 = this.getOAuth2Client();
    const timeoutMs = getPositiveInteger(
      configService.get<string | number>('GITHUB_OAUTH_TIMEOUT_MS'),
      DEFAULT_GITHUB_OAUTH_TIMEOUT_MS,
    );
    const proxyUrl = getGithubOAuthProxyUrl(configService);

    if (proxyUrl) {
      oauth2.setAgent(new HttpsProxyAgent(proxyUrl) as unknown as HttpAgent);
      this.logger.log('github_oauth_proxy_enabled');
    }

    const executeRequest = oauth2._executeRequest.bind(oauth2);
    oauth2._executeRequest = (httpLibrary, options, postBody, callback) => {
      const startedAt = Date.now();
      const requestOptions = {
        ...options,
        timeout: timeoutMs,
      };
      const timedHttpLibrary = {
        request: (options: RequestOptions) => {
          const request = httpLibrary.request(options);
          request.setTimeout(timeoutMs, () => {
            const timeoutError = new Error(
              `GitHub OAuth request timed out after ${timeoutMs}ms`,
            ) as NodeJS.ErrnoException;
            timeoutError.code = 'ETIMEDOUT';
            request.destroy(timeoutError);
          });
          return request;
        },
      };

      executeRequest(timedHttpLibrary, requestOptions, postBody, (error, data, response) => {
        if (error) {
          this.logger.warn(
            `github_oauth_request_failed host=${String(requestOptions.host ?? 'unknown')} code=${getErrorCode(error)} message=${getErrorMessage(error)} durationMs=${Date.now() - startedAt} proxy=${proxyUrl ? 'true' : 'false'}`,
          );
        }

        callback(error, data, response);
      });
    };
  }

  private getOAuth2Client() {
    return (this as unknown as { _oauth2: OAuth2Client })._oauth2;
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

function getGithubOAuthProxyUrl(configService: ConfigService): string | null {
  const explicitProxy = trimToNull(configService.get<string>('GITHUB_OAUTH_PROXY_URL'));

  if (explicitProxy) {
    return explicitProxy;
  }

  if (matchesNoProxy('github.com') || matchesNoProxy('api.github.com')) {
    return null;
  }

  return (
    trimToNull(process.env.HTTPS_PROXY) ??
    trimToNull(process.env.https_proxy) ??
    trimToNull(process.env.ALL_PROXY) ??
    trimToNull(process.env.all_proxy) ??
    trimToNull(process.env.HTTP_PROXY) ??
    trimToNull(process.env.http_proxy)
  );
}

function matchesNoProxy(host: string) {
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
  if (!noProxy) {
    return false;
  }

  return noProxy.split(',').some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) {
      return false;
    }

    if (pattern === '*') {
      return true;
    }

    if (pattern.startsWith('.')) {
      return host.endsWith(pattern);
    }

    return host === pattern || host.endsWith(`.${pattern}`);
  });
}

function getPositiveInteger(value: string | number | undefined, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function trimToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function getErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : 'none';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
