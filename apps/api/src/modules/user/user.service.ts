import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma, User } from '@repo-pulse/database';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  async findById(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return this.excludePassword(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findByGithubId(githubId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { githubId } });
  }

  async create(data: {
    email: string;
    name: string;
    avatar?: string;
    githubId?: string;
    githubAccessToken?: string;
    githubRefreshToken?: string;
    password?: string;
  }): Promise<User> {
    const createData: any = {
      email: data.email,
      name: data.name,
      avatar: data.avatar,
      githubId: data.githubId,
      githubAccessToken: data.githubAccessToken,
      githubRefreshToken: data.githubRefreshToken,
    };

    if (data.password) {
      createData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    return prisma.user.create({ data: createData });
  }

  async update(
    id: string,
    data: {
      githubId?: string;
      githubAccessToken?: string;
      githubRefreshToken?: string;
      name?: string;
      avatar?: string;
    },
  ): Promise<User> {
    const updateData: any = {};
    if (data.githubId !== undefined) {
      updateData.githubId = data.githubId;
    }
    if (data.githubAccessToken !== undefined) {
      updateData.githubAccessToken = data.githubAccessToken;
    }
    if (data.githubRefreshToken !== undefined) {
      updateData.githubRefreshToken = data.githubRefreshToken;
    }
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.avatar !== undefined) {
      updateData.avatar = data.avatar;
    }

    return prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  async updatePreferences(userId: string, preferences: Record<string, unknown>): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const currentPreferences = (user?.preferences as Record<string, unknown>) || {};
    const mergedPreferences = this.deepMerge(currentPreferences, preferences);

    return prisma.user.update({
      where: { id: userId },
      data: { preferences: mergedPreferences as Prisma.InputJsonValue },
    });
  }

  private deepMerge(
    current: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...current };

    for (const [key, value] of Object.entries(incoming)) {
      const currentValue = merged[key];

      if (this.isPlainObject(currentValue) && this.isPlainObject(value)) {
        merged[key] = this.deepMerge(
          currentValue as Record<string, unknown>,
          value as Record<string, unknown>,
        );
        continue;
      }

      merged[key] = value;
    }

    return merged;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private excludePassword(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
