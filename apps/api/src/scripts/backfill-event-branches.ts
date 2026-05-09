import { ConfigService } from '@nestjs/config';
import { EventType, Platform, Prisma, PrismaClient } from '@repo-pulse/database';
import { GithubService } from '../modules/repository/services/github.service';
import { GitlabService } from '../modules/repository/services/gitlab.service';

const prisma = new PrismaClient();
const configService = new ConfigService();
const githubService = new GithubService(configService);
const gitlabService = new GitlabService(configService);

const APPLY = process.argv.includes('--apply');
const PROVIDER_REFRESH = process.argv.includes('--provider-refresh');
const DAYS = Number(
  process.argv.find((arg) => arg.startsWith('--days='))?.split('=')[1] ?? 30,
);

type EventBranchRow = Prisma.EventGetPayload<{
  select: {
    id: true;
    repositoryId: true;
    externalId: true;
    type: true;
    branch: true;
    sourceBranch: true;
    targetBranch: true;
    branches: true;
  };
}>;

type RepositoryRow = Prisma.RepositoryGetPayload<{
  include: {
    users: {
      include: {
        user: {
          select: {
            githubAccessToken: true;
          };
        };
      };
    };
  };
}>;

interface Summary {
  mode: 'dry-run' | 'apply';
  legacyCandidates: number;
  legacyUpdated: number;
  providerRefreshEnabled: boolean;
  providerEventsScanned: number;
  providerEventsUpdated: number;
  repositoriesMissingToken: string[];
  providerFailures: string[];
}

function parseRepositoryPath(fullName: string): [string, string] {
  const separatorIndex = fullName.lastIndexOf('/');
  if (separatorIndex === -1) {
    return [fullName, fullName];
  }

  return [fullName.slice(0, separatorIndex), fullName.slice(separatorIndex + 1)];
}

function normalizeBranches(branches: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      branches
        .filter((branch): branch is string => typeof branch === 'string')
        .map((branch) => branch.trim())
        .filter(Boolean),
    ),
  );
}

function mergeBranches(existingBranches: string[], incomingBranches: string[]): string[] {
  return normalizeBranches([...existingBranches, ...incomingBranches]);
}

async function maybeUpdateEventBranches(
  event: EventBranchRow,
  incomingBranches: string[],
): Promise<boolean> {
  const nextBranches = mergeBranches(event.branches ?? [], incomingBranches);
  if (nextBranches.length === event.branches.length) {
    return false;
  }

  if (APPLY) {
    await prisma.event.update({
      where: { id: event.id },
      data: { branches: nextBranches },
    });
  }

  return true;
}

async function backfillLegacyFields(summary: Summary) {
  const events = await prisma.event.findMany({
    where: {
      branches: { isEmpty: true },
      OR: [
        { branch: { not: null } },
        { sourceBranch: { not: null } },
        { targetBranch: { not: null } },
      ],
    },
    select: {
      id: true,
      repositoryId: true,
      externalId: true,
      type: true,
      branch: true,
      sourceBranch: true,
      targetBranch: true,
      branches: true,
    },
  });

  summary.legacyCandidates = events.length;

  for (const event of events) {
    const branches = normalizeBranches([
      event.branch,
      event.sourceBranch,
      event.targetBranch,
    ]);
    if (branches.length > 0 && await maybeUpdateEventBranches(event, branches)) {
      summary.legacyUpdated += 1;
    }
  }
}

function extractCommitSha(commit: unknown): string | null {
  if (!commit || typeof commit !== 'object') {
    return null;
  }

  const record = commit as { sha?: unknown; id?: unknown };
  if (typeof record.sha === 'string' && record.sha.trim()) {
    return record.sha.trim();
  }
  if (typeof record.id === 'string' && record.id.trim()) {
    return record.id.trim();
  }
  return null;
}

async function fetchRepositoryBranches(repository: RepositoryRow) {
  const [owner, repo] = parseRepositoryPath(repository.fullName);

  if (repository.platform === Platform.GITHUB) {
    const token = repository.users.find((entry) => entry.user.githubAccessToken)
      ?.user.githubAccessToken;
    if (!token) {
      return { branches: [], owner, repo, missingToken: true };
    }

    return {
      branches: await githubService.getBranches(owner, repo, token),
      owner,
      repo,
      missingToken: false,
      token,
    };
  }

  return {
    branches: await gitlabService.getBranches(owner, repo),
    owner,
    repo,
    missingToken: false,
  };
}

async function fetchBranchCommits(
  repository: RepositoryRow,
  owner: string,
  repo: string,
  branchName: string,
  since: string,
  githubToken?: string,
) {
  if (repository.platform === Platform.GITHUB) {
    return githubService.getCommits(
      owner,
      repo,
      { branch: branchName, since },
      githubToken,
    );
  }

  return gitlabService.getCommits(owner, repo, {
    branch: branchName,
    since,
  });
}

async function refreshProviderBranches(summary: Summary) {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const repositories = await prisma.repository.findMany({
    where: { isActive: true },
    include: {
      users: {
        include: {
          user: {
            select: {
              githubAccessToken: true,
            },
          },
        },
      },
    },
  });

  for (const repository of repositories) {
    const providerContext = await fetchRepositoryBranches(repository);

    if (providerContext.missingToken) {
      summary.repositoriesMissingToken.push(repository.fullName);
      continue;
    }

    if (providerContext.branches.length === 0) {
      summary.providerFailures.push(`${repository.fullName}: no branches returned`);
      continue;
    }

    for (const branch of providerContext.branches) {
      try {
        const commits = await fetchBranchCommits(
          repository,
          providerContext.owner,
          providerContext.repo,
          branch.name,
          since,
          providerContext.token,
        );

        for (const commit of commits) {
          const externalId = extractCommitSha(commit);
          if (!externalId) {
            continue;
          }

          const event = await prisma.event.findFirst({
            where: {
              repositoryId: repository.id,
              externalId,
              type: EventType.PUSH,
            },
            select: {
              id: true,
              repositoryId: true,
              externalId: true,
              type: true,
              branch: true,
              sourceBranch: true,
              targetBranch: true,
              branches: true,
            },
          });

          if (!event) {
            continue;
          }

          summary.providerEventsScanned += 1;
          if (await maybeUpdateEventBranches(event, [branch.name])) {
            summary.providerEventsUpdated += 1;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        summary.providerFailures.push(`${repository.fullName}:${branch.name}: ${message}`);
      }
    }
  }
}

async function main() {
  const summary: Summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    legacyCandidates: 0,
    legacyUpdated: 0,
    providerRefreshEnabled: PROVIDER_REFRESH,
    providerEventsScanned: 0,
    providerEventsUpdated: 0,
    repositoriesMissingToken: [],
    providerFailures: [],
  };

  await backfillLegacyFields(summary);

  if (PROVIDER_REFRESH) {
    await refreshProviderBranches(summary);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
