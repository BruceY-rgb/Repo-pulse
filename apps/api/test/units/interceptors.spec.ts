import { of, throwError } from 'rxjs';
import { TimeoutError } from 'rxjs';
import { RequestTimeoutException } from '@nestjs/common';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { TimeoutInterceptor } from '../../src/common/interceptors/timeout.interceptor';

// ── TransformInterceptor ──────────────────────────────────────────────────
describe('TransformInterceptor', () => {
  function makeReflector(shouldSkip: boolean) {
    return { getAllAndOverride: jest.fn().mockReturnValue(shouldSkip) } as any;
  }

  function makeContext(statusCode = 200) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getResponse: () => ({ statusCode }) }),
    } as any;
  }

  function makeNext(value: any) {
    return { handle: () => of(value) } as any;
  }

  it('wraps response in ApiResponse envelope when not skipped', (done) => {
    const interceptor = new TransformInterceptor(makeReflector(false));
    const ctx = makeContext(200);
    interceptor.intercept(ctx, makeNext({ id: 1 })).subscribe((result) => {
      expect(result).toMatchObject({ code: 200, data: { id: 1 }, message: 'success' });
      expect(typeof result.timestamp).toBe('string');
      done();
    });
  });

  it('passes through raw value when skip=true', (done) => {
    const interceptor = new TransformInterceptor(makeReflector(true));
    const ctx = makeContext(200);
    interceptor.intercept(ctx, makeNext('raw')).subscribe((result) => {
      expect(result).toBe('raw');
      done();
    });
  });

  it('uses the response statusCode from context', (done) => {
    const interceptor = new TransformInterceptor(makeReflector(false));
    const ctx = makeContext(201);
    interceptor.intercept(ctx, makeNext(null)).subscribe((result) => {
      expect(result.code).toBe(201);
      done();
    });
  });

  it('wraps null data correctly', (done) => {
    const interceptor = new TransformInterceptor(makeReflector(false));
    const ctx = makeContext(200);
    interceptor.intercept(ctx, makeNext(null)).subscribe((result) => {
      expect(result.data).toBeNull();
      done();
    });
  });
});

// ── TimeoutInterceptor ─────────────────────────────────────────────────────
describe('TimeoutInterceptor', () => {
  const mockReflector = {
    getAllAndOverride: jest.fn().mockReturnValue(undefined),
  };
  const interceptor = new TimeoutInterceptor(mockReflector as any);
  const mockContext = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as any;

  function makeNext(value: any) {
    return { handle: () => of(value) } as any;
  }

  it('passes through values normally', (done) => {
    interceptor.intercept(mockContext, makeNext('ok')).subscribe((val) => {
      expect(val).toBe('ok');
      done();
    });
  });

  it('converts TimeoutError to RequestTimeoutException', (done) => {
    const next = { handle: () => throwError(() => new TimeoutError()) } as any;
    interceptor.intercept(mockContext, next).subscribe({
      error: (err) => {
        expect(err).toBeInstanceOf(RequestTimeoutException);
        done();
      },
    });
  });

  it('passes non-TimeoutError through unchanged', (done) => {
    const original = new Error('db failure');
    const next = { handle: () => throwError(() => original) } as any;
    interceptor.intercept(mockContext, next).subscribe({
      error: (err) => {
        expect(err).toBe(original);
        done();
      },
    });
  });
});
