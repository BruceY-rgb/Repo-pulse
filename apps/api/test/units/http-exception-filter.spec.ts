import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

function makeResponse() {
  const res: any = {
    statusCode: 200,
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
  };
  return res;
}

function makeRequest(overrides: Partial<{ method: string; path: string }> = {}) {
  return { method: 'GET', path: '/some/path', ...overrides };
}

function makeHost(req: any, res: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as any;
}

function makeFilter() {
  const mockConfig = { get: jest.fn().mockReturnValue('http://localhost:5173') };
  return new HttpExceptionFilter(mockConfig as any);
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = makeFilter();
  });

  // ── status codes ─────────────────────────────────────────────────────────
  it('uses HttpException status when exception is HttpException', () => {
    const res = makeResponse();
    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), makeHost(makeRequest(), res));
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('uses 500 for non-HttpException', () => {
    const res = makeResponse();
    filter.catch(new Error('boom'), makeHost(makeRequest(), res));
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns message from HttpException', () => {
    const res = makeResponse();
    filter.catch(new HttpException('custom message', 422), makeHost(makeRequest(), res));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'custom message' }));
  });

  it('returns "Internal server error" for generic Error', () => {
    const res = makeResponse();
    filter.catch(new Error('db crash'), makeHost(makeRequest(), res));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' }));
  });

  it('response json includes code, data, timestamp', () => {
    const res = makeResponse();
    filter.catch(new HttpException('bad request', 400), makeHost(makeRequest(), res));
    const arg = res.json.mock.calls[0][0];
    expect(arg).toMatchObject({ code: 400, data: null });
    expect(typeof arg.timestamp).toBe('string');
  });

  // ── GitHub OAuth callback redirect ────────────────────────────────────────
  it('redirects to /login?error=oauth_failed on GitHub callback error', () => {
    const res = makeResponse();
    const req = makeRequest({ method: 'GET', path: '/auth/github/callback' });
    filter.catch(new Error('oauth error'), makeHost(req, res));
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:5173/login?error=oauth_failed'),
    );
    expect(res.json).not.toHaveBeenCalled();
  });

  it('includes oauthError reason in redirect when present', () => {
    const res = makeResponse();
    const req = makeRequest({ method: 'GET', path: '/auth/github/callback' });
    const ex: any = new Error('oauth');
    ex.oauthError = { data: 'error=access_denied&error_description=User+denied+access' };
    filter.catch(ex, makeHost(req, res));
    const url: string = res.redirect.mock.calls[0][0];
    expect(url).toContain('reason=');
    expect(url).toContain('access_denied');
  });

  it('does not redirect if headersSent', () => {
    const res = makeResponse();
    res.headersSent = true;
    const req = makeRequest({ method: 'GET', path: '/auth/github/callback' });
    filter.catch(new Error('x'), makeHost(req, res));
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('does not redirect for non-GET callback', () => {
    const res = makeResponse();
    const req = makeRequest({ method: 'POST', path: '/auth/github/callback' });
    filter.catch(new Error('x'), makeHost(req, res));
    expect(res.redirect).not.toHaveBeenCalled();
  });

  // ── configService fallback ─────────────────────────────────────────────
  it('uses fallback localhost:5173 when FRONTEND_URL not set', () => {
    const configNoUrl = { get: jest.fn().mockReturnValue(undefined) };
    const f = new HttpExceptionFilter(configNoUrl as any);
    const res = makeResponse();
    const req = makeRequest({ method: 'GET', path: '/auth/github/callback' });
    f.catch(new Error('x'), makeHost(req, res));
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5173'));
  });

  // ── oauthError detail logging ──────────────────────────────────────────
  it('does not throw when exception has oauthError with statusCode', () => {
    const res = makeResponse();
    const req = makeRequest();
    const ex: any = new Error('oauth');
    ex.oauthError = { statusCode: 401, data: 'some data', message: 'unauthorized' };
    expect(() => filter.catch(ex, makeHost(req, res))).not.toThrow();
  });

  it('handles oauthError with object data', () => {
    const res = makeResponse();
    const req = makeRequest();
    const ex: any = new Error('oauth');
    ex.oauthError = { data: { code: 'bad_request' } };
    expect(() => filter.catch(ex, makeHost(req, res))).not.toThrow();
  });

  it('handles oauthError with only message field', () => {
    const res = makeResponse();
    const req = makeRequest();
    const ex: any = new Error('oauth');
    ex.oauthError = { message: 'token expired' };
    expect(() => filter.catch(ex, makeHost(req, res))).not.toThrow();
  });

  it('handles exception with oauthError=null', () => {
    const res = makeResponse();
    const ex: any = new Error('x');
    ex.oauthError = null;
    expect(() => filter.catch(ex, makeHost(makeRequest(), res))).not.toThrow();
  });
});
