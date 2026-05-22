import {
  prisma,
  RepositoryAccessLevel,
  RepositoryAccessMode,
} from '@repo-pulse/database';
import { NotFoundException } from '@nestjs/common';
import { RepositoryOperationForbiddenException } from '../exceptions/repository-operation-forbidden.exception';

const EDITABLE_ACCESS_LEVELS: RepositoryAccessLevel[] = [
  RepositoryAccessLevel.OWNER,
  RepositoryAccessLevel.ADMIN,
  RepositoryAccessLevel.MAINTAIN,
  RepositoryAccessLevel.WRITE,
];

export interface RepositoryAccessMembership {
  repositoryId: string;
  accessLevel: RepositoryAccessLevel;
  accessMode: RepositoryAccessMode;
  role: string;
}

export function isEditableRepositoryAccessLevel(
  accessLevel: RepositoryAccessLevel | null | undefined,
): boolean {
  return Boolean(accessLevel && EDITABLE_ACCESS_LEVELS.includes(accessLevel));
}

export async function getUserRepositoryMembership(
  userId: string,
  repositoryId: string,
): Promise<RepositoryAccessMembership | null> {
  return prisma.userRepository.findUnique({
    where: {
      userId_repositoryId: {
        userId,
        repositoryId,
      },
    },
    select: {
      repositoryId: true,
      accessLevel: true,
      accessMode: true,
      role: true,
    },
  });
}

export async function getAccessibleRepositoryIds(
  userId: string,
  options?: { editableOnly?: boolean },
): Promise<string[]> {
  const memberships = await prisma.userRepository.findMany({
    where: {
      userId,
      ...(options?.editableOnly
        ? { accessLevel: { in: EDITABLE_ACCESS_LEVELS } }
        : {}),
    },
    select: { repositoryId: true },
  });

  return memberships.map((membership) => membership.repositoryId);
}

export async function getUserMonitoredRepositoryIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });

  const preferences = (user?.preferences as Record<string, unknown>) || {};
  const monitoringScope = (preferences.monitoringScope as Record<string, unknown>) || {};
  return Array.isArray(monitoringScope.repositoryIds)
    ? monitoringScope.repositoryIds.filter(
        (repositoryId): repositoryId is string => typeof repositoryId === 'string' && repositoryId.length > 0,
      )
    : [];
}

export async function assertUserCanAccessRepository(
  userId: string,
  repositoryId: string,
): Promise<RepositoryAccessMembership> {
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    select: { id: true },
  });

  if (!repository) {
    throw new NotFoundException('Repository not found');
  }

  const membership = await getUserRepositoryMembership(userId, repositoryId);
  if (!membership || membership.accessLevel === RepositoryAccessLevel.NONE) {
    throw new RepositoryOperationForbiddenException();
  }

  return membership;
}

export async function assertUserCanEditRepository(
  userId: string,
  repositoryId: string,
): Promise<RepositoryAccessMembership> {
  const membership = await assertUserCanAccessRepository(userId, repositoryId);

  if (!isEditableRepositoryAccessLevel(membership.accessLevel)) {
    throw new RepositoryOperationForbiddenException();
  }

  return membership;
}
