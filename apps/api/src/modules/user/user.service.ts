import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma, Role, User } from '@repo-pulse/database';
import * as bcrypt from 'bcrypt';
import * as https from 'https';

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
    githubLogin?: string;
    githubAccessToken?: string;
    githubRefreshToken?: string;
    password?: string;
    role?: Role;
    username?: string;
  }): Promise<User> {
    const createData: any = {
      email: data.email,
      name: data.name,
      avatar: data.avatar,
      githubId: data.githubId,
      githubLogin: data.githubLogin,
      githubAccessToken: data.githubAccessToken,
      githubRefreshToken: data.githubRefreshToken,
      role: data.role,
      username: data.username,
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
      githubLogin?: string;
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
    if (data.githubLogin !== undefined) {
      updateData.githubLogin = data.githubLogin;
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

  async updateProfile(userId: string, data: { name?: string; email?: string; avatar?: string; username?: string; company?: string; bio?: string }) {
    const d: Record<string, unknown> = {};
    if (data.name !== undefined) d.name = data.name;
    if (data.email !== undefined && data.email) d.email = data.email;
    if (data.avatar !== undefined) d.avatar = data.avatar || null;
    if (data.username !== undefined) d.username = data.username || null;
    if (data.company !== undefined) d.company = data.company || null;
    if (data.bio !== undefined) d.bio = data.bio || null;

    const user = await prisma.user.update({ where: { id: userId }, data: d });
    return this.excludePassword(user);
  }

  async findGithubCredentials(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        githubId: true,
        githubLogin: true,
        githubAccessToken: true,
        githubRefreshToken: true,
      },
    });
  }

  async fetchGithubAvatar(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { githubAccessToken: true } });
    if (!user?.githubAccessToken) return null;

    return new Promise((resolve) => {
      const req = https.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${user.githubAccessToken}`, 'User-Agent': 'Repo-Pulse' },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data).avatar_url || null); } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(5000, () => { req.destroy(); resolve(null); });
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
    const { passwordHash, githubAccessToken, githubRefreshToken, ...rest } = user;
    return rest;
  }
}
