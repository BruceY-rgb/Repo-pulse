import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RepositoryService } from './repository.service';
import { CreateRepositoryDto, UpdateRepositoryDto, RepositoryQueryDto } from './dto/repository.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';

@ApiTags('仓库管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('repositories')
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  @Post()
  @ApiOperation({ summary: '添加仓库' })
  async create(@Req() req: Request, @Body() dto: CreateRepositoryDto) {
    const userId = (req.user as { id: string }).id;
    const repository = await this.repositoryService.create(userId, dto);
    return repository;
  }

  @Get()
  @ApiOperation({ summary: '获取仓库列表' })
  async findAll(@Req() req: Request, @Query() query: RepositoryQueryDto) {
    const userId = (req.user as { id: string }).id;
    const repositories = await this.repositoryService.findAll(userId, {
      isActive: query.isActive,
    });
    return repositories;
  }

  @Get(':id')
  @ApiOperation({ summary: '获取仓库详情' })
  async findById(@Param('id') id: string): Promise<any> {
    const repository = await this.repositoryService.findById(id);
    return repository;
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新仓库' })
  async update(@Param('id') id: string, @Body() dto: UpdateRepositoryDto) {
    const repository = await this.repositoryService.update(id, dto);
    return repository;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除仓库' })
  async delete(@Param('id') id: string) {
    await this.repositoryService.delete(id);
    return { success: true };
  }

  @Post(':id/sync')
  @ApiOperation({ summary: '同步仓库事件' })
  async sync(@Param('id') id: string): Promise<any> {
    const repository = await this.repositoryService.sync(id);
    return repository;
  }
}
