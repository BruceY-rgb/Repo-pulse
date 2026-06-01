import { SetMetadata } from '@nestjs/common';

export const REQUEST_TIMEOUT_MS_KEY = 'requestTimeoutMs';

export const RequestTimeoutMs = (timeoutMs: number) =>
  SetMetadata(REQUEST_TIMEOUT_MS_KEY, timeoutMs);
