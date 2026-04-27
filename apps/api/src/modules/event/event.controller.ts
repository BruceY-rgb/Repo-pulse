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

@ApiTags('Event Management')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get()
  @ApiOperation({ summary: 'List events' })
  async findAll(@Query() query: EventQueryDto): Promise<any> {
    return this.eventService.findAll(query.repositoryId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get event stats' })
  async getStats(@Query() query: EventStatsQueryDto) {
    return this.eventService.getEventStats(
      query.repositoryId,
      query.dateFrom ? new Date(query.dateFrom) : undefined,
      query.dateTo ? new Date(query.dateTo) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event details' })
  async findById(@Param('id') id: string): Promise<any> {
    return this.eventService.findById(id);
  }
}
