import { RequestLoggerMiddleware } from './request-logger.middleware';

describe('request log privacy', () => {
  it('logs a route template and server-generated request ID without request data', () => {
    const log = jest.spyOn(console, 'info').mockImplementation(() => {});
    let finish!: () => void;
    const req = {method: 'GET', originalUrl: '/users/private-id?search=secret', route: {path: '/users/:id'}, headers: {'x-request-id': 'private-injected-id'}, body: {note: 'private note'}};
    const res = {locals: {} as Record<string, string>, statusCode: 200, setHeader: jest.fn(), on: jest.fn((_: string, callback: () => void) => {finish = callback;})};
    const next = jest.fn();
    try {
      new RequestLoggerMiddleware().use(req as any, res as any, next);
      finish();
      const data = JSON.parse(log.mock.calls[0][0]);
      expect(data.route).toBe('/users/:id');
      expect(data.requestId).toBe(res.locals.requestId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', data.requestId);
      expect(JSON.stringify(data)).not.toMatch(/private|secret/);
      expect(next).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });
});
