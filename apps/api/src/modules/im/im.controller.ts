import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ImService } from './im.service';
import {
  CreatePairingCodeDto,
  SaveFeishuConnectionDto,
  SaveSubscriptionsDto,
} from './dto/im.dto';

@ApiTags('IM 集成')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('im')
export class ImController {
  constructor(private readonly imService: ImService) {}

  @Get('status')
  @ApiOperation({ summary: '获取 IM 集成状态' })
  async getStatus(@CurrentUser() user: { sub: string }) {
    return this.imService.getStatus(user.sub);
  }

  @Post('feishu/connections')
  @ApiOperation({ summary: '保存飞书机器人配置' })
  async saveFeishuConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: SaveFeishuConnectionDto,
  ) {
    return this.imService.saveFeishuConnection(user.sub, body);
  }

  @Post('feishu/test')
  @ApiOperation({ summary: '测试飞书机器人配置' })
  async testFeishuConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: SaveFeishuConnectionDto,
  ) {
    return this.imService.testFeishuConnection(user.sub, body);
  }

  @Post('feishu/test-notification')
  @ApiOperation({ summary: '发送飞书测试推送' })
  async sendFeishuTestNotification(@CurrentUser() user: { sub: string }) {
    return this.imService.sendFeishuTestNotification(user.sub);
  }

  @Public()
  @Post('feishu/events')
  @HttpCode(200)
  @SkipTransform()
  @ApiOperation({ summary: '飞书事件回调' })
  async handleFeishuEvent(@Body() body: Record<string, any>) {
    return this.imService.handleFeishuEvent(body);
  }

  @Post('pairing-codes')
  @ApiOperation({ summary: '生成 IM 配对码' })
  async createPairingCode(
    @CurrentUser() user: { sub: string },
    @Body() _body: CreatePairingCodeDto,
  ) {
    return this.imService.createPairingCode(user.sub);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: '获取 IM 群订阅' })
  async listSubscriptions(
    @CurrentUser() user: { sub: string },
    @Query('provider') _provider?: 'feishu',
  ) {
    return this.imService.listSubscriptions(user.sub);
  }

  @Post('subscriptions')
  @ApiOperation({ summary: '保存 IM 群订阅' })
  async saveSubscriptions(
    @CurrentUser() user: { sub: string },
    @Body() body: SaveSubscriptionsDto,
  ) {
    return this.imService.saveSubscriptions(user.sub, body.subscriptions);
  }
}
