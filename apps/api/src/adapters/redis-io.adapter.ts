import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private static readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(redisUrl: string, db = 1): Promise<void> {
    const pubClient = new Redis(redisUrl, {
      db,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    const subClient = pubClient.duplicate();

    await Promise.all([
      this.waitForReady(pubClient, 'pub'),
      this.waitForReady(subClient, 'sub'),
    ]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    RedisIoAdapter.logger.log(
      `Redis adapter connected (db=${db}) for socket.io cross-instance broadcast`,
    );
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    } else {
      RedisIoAdapter.logger.warn(
        'Redis adapter not connected; socket.io will run in single-instance mode',
      );
    }
    return server;
  }

  private waitForReady(client: Redis, label: 'pub' | 'sub'): Promise<void> {
    return new Promise((resolve, reject) => {
      const onReady = () => {
        client.off('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        client.off('ready', onReady);
        reject(
          new Error(
            `Redis ${label} client failed to connect: ${err.message}`,
          ),
        );
      };
      client.once('ready', onReady);
      client.once('error', onError);
    });
  }
}
