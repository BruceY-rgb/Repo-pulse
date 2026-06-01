import { DingTalkChannel } from '../../src/modules/notification/channels/dingtalk.channel';
import { EmailChannel } from '../../src/modules/notification/channels/email.channel';
import { FeishuChannel } from '../../src/modules/notification/channels/feishu.channel';

describe('DingTalkChannel', () => {
  const channel = new DingTalkChannel();

  it('returns missing reason when webhookUrl is absent', async () => {
    const result = await channel.send({ title: 'T', content: 'C' });
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_webhook_missing');
  });

  it('returns not_implemented when webhookUrl is provided', async () => {
    const result = await channel.send({ webhookUrl: 'https://oapi.dingtalk.com/xxx', title: 'T', content: 'C' });
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_channel_not_implemented');
  });
});

describe('EmailChannel', () => {
  const channel = new EmailChannel();

  it('returns missing reason when to is absent', async () => {
    const result = await channel.send({ subject: 'S', body: 'B' });
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_email_missing');
  });

  it('returns not_implemented when to is provided', async () => {
    const result = await channel.send({ to: 'user@example.com', subject: 'S', body: 'B' });
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_channel_not_implemented');
  });
});

describe('FeishuChannel', () => {
  const channel = new FeishuChannel();

  it('returns missing reason when webhookUrl is absent', async () => {
    const result = await channel.send({ title: 'T', content: 'C' });
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_webhook_missing');
  });

  it('returns not_implemented when webhookUrl is provided', async () => {
    const result = await channel.send({ webhookUrl: 'https://open.feishu.cn/xxx', title: 'T', content: 'C' });
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('notification_channel_not_implemented');
  });
});
