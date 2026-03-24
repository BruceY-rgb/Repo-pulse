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
    password?: string;
  }): Promise<User> {
    const createData: any = {
      email: data.email,
      name: data.name,
      avatar: data.avatar,
      githubId: data.githubId,
    };

    if (data.password) {
      createData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    return prisma.user.create({ data: createData });
  }

  async updatePreferences(userId: string, preferences: Record<string, unknown>): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { preferences: preferences as Prisma.InputJsonValue },
    });
  }

  private excludePassword(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
