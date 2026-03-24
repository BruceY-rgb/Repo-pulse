import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EventService } from './event.service';
import { EventQueryDto, EventStatsQueryDto } from './dto/event.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('事件管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get()
  @ApiOperation({ summary: '获取事件列表' })
  async findAll(@Query('repositoryId') repositoryId: string, @Query() query: EventQueryDto): Promise<any> {
    const result = await this.eventService.findAll(repositoryId, query);
    return result;
  }

  @Get('stats')
  @ApiOperation({ summary: '获取事件统计' })
  async getStats(
    @Query('repositoryId') repositoryId: string,
    @Query() query: EventStatsQueryDto,
  ) {
    const result = await this.eventService.getEventStats(
      repositoryId,
      query.dateFrom ? new Date(query.dateFrom) : undefined,
      query.dateTo ? new Date(query.dateTo) : undefined,
    );
    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: '获取事件详情' })
  async findById(@Param('id') id: string): Promise<any> {
    const event = await this.eventService.findById(id);
    return event;
  }
}
