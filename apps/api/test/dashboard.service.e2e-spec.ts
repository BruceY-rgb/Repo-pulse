import { EventType, prisma } from '@repo-pulse/database';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService();
    (prisma.repository.findMany as unknown) = jest.fn();
    (prisma.event.count as unknown) = jest.fn();
    (prisma.event.findMany as unknown) = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses effective occurredAt date filtering for commitsToday in overview', async () => {
    (prisma.repository.findMany as jest.Mock).mockResolvedValue([{ id: 'repo-1' }]);
    (prisma.event.count as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const branchScopes = JSON.stringify({ 'repo-1': ['feature/login'] });
    const overview = await service.getOverview('user-1', 'repo-1', branchScopes);

    expect(overview).toEqual({
      totalRepositories: 1,
      openPRs: 1,
      commitsToday: 0,
      openIssues: 0,
    });

    expect(prisma.event.count).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          AND: [
            {
              repositoryId: 'repo-1',
              OR: [
                { branch: { in: ['feature/login'] } },
                { sourceBranch: { in: ['feature/login'] } },
                { targetBranch: { in: ['feature/login'] } },
              ],
            },
            { type: EventType.PUSH },
            expect.objectContaining({
              OR: expect.any(Array),
            }),
          ],
        },
      }),
    );
  });

  it('groups activity by occurredAt instead of insertion time', async () => {
    const now = new Date('2026-04-30T12:00:00.000Z');
    const twoDaysAgo = new Date('2026-04-28T09:00:00.000Z');

    jest.useFakeTimers().setSystemTime(now);
    (prisma.repository.findMany as jest.Mock).mockResolvedValue([{ id: 'repo-1' }]);
    (prisma.event.findMany as jest.Mock).mockResolvedValue([
      {
        type: EventType.PUSH,
        occurredAt: twoDaysAgo,
        createdAt: now,
      },
    ]);

    const activity = await service.getActivity('user-1', 7, 'repo-1', undefined);
    const occurredAtKey = twoDaysAgo.toLocaleDateString('en-US', { weekday: 'short' });
    const currentDayKey = now.toLocaleDateString('en-US', { weekday: 'short' });

    expect(activity.find((item) => item.date === occurredAtKey)?.commits).toBe(1);
    expect(activity.find((item) => item.date === currentDayKey)?.commits).toBe(0);

  });
});
