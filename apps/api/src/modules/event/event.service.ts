import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient, EventType, Prisma, Event } from '@repo-pulse/database';
import { PaginationQueryDto } from './dto/event.dto';
import { EventGateway } from './event.gateway';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);
  private prisma: PrismaClient;

  constructor(private readonly eventGateway: EventGateway) {
    this.prisma = new PrismaClient();
  }

  async create(data: {
    repositoryId: string;
    type: EventType;
    action: string;
    title: string;
    body?: string;
    author: string;
    authorAvatar?: string;
    externalId: string;
    externalUrl?: string;
    metadata?: Record<string, unknown>;
    rawPayload?: Record<string, unknown>;
  }): Promise<Event> {
    const event = await this.prisma.event.create({
      data: {
        repositoryId: data.repositoryId,
        type: data.type,
        action: data.action,
        title: data.title,
        body: data.body,
        author: data.author,
        authorAvatar: data.authorAvatar,
        externalId: data.externalId,
        externalUrl: data.externalUrl,
        metadata: (data.metadata || {}) as Prisma.InputJsonValue,
        rawPayload: data.rawPayload as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Event ${event.id} created for repository ${data.repositoryId}`);

    this.broadcastEvent(data.repositoryId, event);

    return event;
  }

  private broadcastEvent(repositoryId: string, event: Event) {
    try {
      this.eventGateway.broadcastNewEvent(repositoryId, {
        id: event.id,
        type: event.type,
        action: event.action,
        title: event.title,
        body: event.body,
        author: event.author,
        authorAvatar: event.authorAvatar,
        externalUrl: event.externalUrl,
        createdAt: event.createdAt,
      });
    } catch (error) {
      this.logger.warn(`Failed to broadcast event ${event.id}: ${error}`);
    }
  }

  async findAll(repositoryId: string, query: PaginationQueryDto): Promise<any> {
    await this.ensureRepositoryExists(repositoryId);

    const { page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where: { repositoryId },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          repository: {
            select: {
              id: true,
              name: true,
              fullName: true,
              platform: true,
            },
          },
          _count: {
            select: {
              analyses: true,
              approvals: true,
            },
          },
        },
      }),
      this.prisma.event.count({
        where: { repositoryId },
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(id: string): Promise<any> {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        repository: {
          select: {
            id: true,
            name: true,
            fullName: true,
            platform: true,
            url: true,
          },
        },
        analyses: true,
        approvals: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async findByExternalId(repositoryId: string, externalId: string): Promise<Event | null> {
    return this.prisma.event.findFirst({
      where: {
        repositoryId,
        externalId,
      },
    });
  }

  async getEventStats(repositoryId: string, dateFrom?: Date, dateTo?: Date) {
    await this.ensureRepositoryExists(repositoryId);

    const where: Record<string, unknown> = { repositoryId };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        (where.createdAt as Record<string, Date>).gte = dateFrom;
      }
      if (dateTo) {
        (where.createdAt as Record<string, Date>).lte = dateTo;
      }
    }

    const [total, byType] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byType: byType.map((item: { type: string; _count: number }) => ({
        type: item.type,
        count: item._count,
      })),
    };
  }

  async deleteOldEvents(repositoryId: string, days: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.prisma.event.deleteMany({
      where: {
        repositoryId,
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(`Deleted ${result.count} old events for repository ${repositoryId}`);
    return result;
  }

  private async ensureRepositoryExists(repositoryId: string) {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      select: { id: true },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }
  }
}
