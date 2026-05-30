import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkbenchService } from './workbench.service';
import { ReadConversationDto } from './dto/read-conversation.dto';
import { CreateRepositoryDto } from '../repository/dto/repository.dto';

@Controller('workbench')
@UseGuards(AuthGuard('jwt'))
export class WorkbenchController {
  constructor(private readonly workbenchService: WorkbenchService) {}

  @Get('chat/repositories')
  async getChatRepositories(@CurrentUser() user: { sub: string }): Promise<any> {
    return this.workbenchService.getChatRepositories(user.sub);
  }

  @Get('chat/repositories/:id/messages')
  async getChatRepositoryMessages(
    @CurrentUser() user: { sub: string },
    @Param('id') repositoryId: string,
  ): Promise<any> {
    return this.workbenchService.getConversationMessages(user.sub, repositoryId);
  }

  @Post('chat/repositories/:id/read')
  async markChatRepositoryRead(
    @CurrentUser() user: { sub: string },
    @Param('id') repositoryId: string,
    @Body() body: ReadConversationDto,
  ): Promise<any> {
    return this.workbenchService.markConversationAsRead(user.sub, repositoryId, body);
  }

  @Get('watch-feed')
  async getWatchFeed(
    @CurrentUser() user: { sub: string },
    @Query('type') type?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    console.log(`[WorkbenchController] GET watch-feed user=${JSON.stringify(user)} type=${type}`);
    return this.workbenchService.getWatchFeed(
      user.sub,
      type,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('watch-repositories')
  async getWatchRepositories(@CurrentUser() user: { sub: string }): Promise<any> {
    console.log(`[WorkbenchController] GET watch-repositories user=${JSON.stringify(user)}`);
    return this.workbenchService.getWatchRepositories(user.sub);
  }

  @Post('watch-repositories')
  async addWatchRepository(
    @CurrentUser() user: { sub: string },
    @Body() body: CreateRepositoryDto,
  ): Promise<any> {
    return this.workbenchService.addWatchRepository(user.sub, body);
  }
}
