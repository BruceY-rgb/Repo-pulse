import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

function makeResponse() {
  const res: any = {
    statusCode: 200,
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
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

  it('uses message field from a structured exception response', () => {
    const res = makeResponse();
    const ex = new HttpException({ message: 'structured', code: 'E_CUSTOM' }, 400);
    filter.catch(ex, makeHost(makeRequest(), res));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'structured', code: 'E_CUSTOM' }),
    );
  });
});
