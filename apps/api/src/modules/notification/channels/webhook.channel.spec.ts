import axios from 'axios';
import { WebhookChannel } from './webhook.channel';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookChannel (unit)', () => {
  let channel: WebhookChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    channel = new WebhookChannel();
  });

  it('未配置 webhookUrl 时直接失败并返回 missing 原因', async () => {
    const result = await channel.send({
      title: 'no url',
      content: 'no url',
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_webhook_missing');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('HTTP 200 → 成功，metadata 带 statusCode', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: { ok: true } } as any);

    const result = await channel.send({
      webhookUrl: 'http://hook.local/x',
      title: 'ok',
      content: 'ok-body',
    });

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({ statusCode: 200 });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, body, options] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('http://hook.local/x');
    expect(body).toEqual({ title: 'ok', content: 'ok-body' });
    expect((options as any).timeout).toBe(5000);
    // axios validateStatus 设为 true，让非 2xx 也走正常返回路径
    expect(typeof (options as any).validateStatus).toBe('function');
    expect((options as any).validateStatus(500)).toBe(true);
  });

  it('HTTP 非 2xx（500） → 失败，failureReason 含状态码', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 500, data: 'oops' } as any);

    const result = await channel.send({
      webhookUrl: 'http://hook.local/fail',
      title: 'oops',
      content: 'oops',
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_webhook_http_500');
    expect(result.metadata).toEqual({ statusCode: 500 });
  });

  it('HTTP 4xx（404） → 失败，failureReason 含状态码', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 404, data: 'not found' } as any);

    const result = await channel.send({
      webhookUrl: 'http://hook.local/missing',
      title: 'x',
      content: 'x',
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_webhook_http_404');
    expect(result.metadata).toEqual({ statusCode: 404 });
  });

  it('网络超时（axios 抛错） → 失败，failureReason 为 request_failed 且 metadata 带 error', async () => {
    const timeoutError = Object.assign(new Error('timeout of 5000ms exceeded'), {
      code: 'ECONNABORTED',
    });
    mockedAxios.post.mockRejectedValueOnce(timeoutError);

    const result = await channel.send({
      webhookUrl: 'http://hook.local/slow',
      title: 'slow',
      content: 'slow',
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_webhook_request_failed');
    expect((result.metadata as Record<string, unknown>).error).toBe(
      'timeout of 5000ms exceeded',
    );
  });
});
