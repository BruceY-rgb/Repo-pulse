import {
  Controller,
  Get,
  Param,
  Query,
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
  async findAll(@Query() query: EventQueryDto): Promise<any> {
    const { repositoryId, ...pagination } = query;
    const result = await this.eventService.findAll(repositoryId, pagination);
    return result;
  }

  @Get('stats')
  @ApiOperation({ summary: '获取事件统计' })
  async getStats(@Query() query: EventStatsQueryDto) {
    const { repositoryId, dateFrom, dateTo } = query;
    const result = await this.eventService.getEventStats(
      repositoryId,
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(dateTo) : undefined,
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
