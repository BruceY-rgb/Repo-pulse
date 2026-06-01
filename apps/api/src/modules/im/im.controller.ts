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
import { Throttle } from '@nestjs/throttler';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ImService } from './im.service';
import {
  CreatePairingCodeDto,
  SaveDingTalkConnectionDto,
  SaveFeishuConnectionDto,
  SaveWecomConnectionDto,
  SaveWechatConnectionDto,
  SaveSubscriptionsDto,
  ImProvider,
} from './dto/im.dto';

@ApiTags('IM 集成')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('im')
export class ImController {
  constructor(private readonly imService: ImService) {}

  @Get('status')
  @Throttle({ default: { limit: 300, ttl: 60000 } })
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

  @Post('dingtalk/connections')
  @ApiOperation({ summary: '保存钉钉机器人配置' })
  async saveDingTalkConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: SaveDingTalkConnectionDto,
  ) {
    return this.imService.saveDingTalkConnection(user.sub, body);
  }

  @Post('dingtalk/test')
  @ApiOperation({ summary: '测试钉钉机器人配置' })
  async testDingTalkConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: SaveDingTalkConnectionDto,
  ) {
    return this.imService.testDingTalkConnection(user.sub, body);
  }

  @Post('dingtalk/test-notification')
  @ApiOperation({ summary: '发送钉钉测试推送' })
  async sendDingTalkTestNotification(
    @CurrentUser() user: { sub: string },
    @Body() body: { robotId?: string },
  ) {
    return this.imService.sendDingTalkTestNotification(user.sub, body?.robotId);
  }

  @Post('wecom/connections')
  @ApiOperation({ summary: '保存企业微信机器人配置' })
  async saveWecomConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: SaveWecomConnectionDto,
  ) {
    return this.imService.saveWecomConnection(user.sub, body);
  }

  @Post('wecom/qr-codes')
  @ApiOperation({ summary: '生成企业微信机器人授权二维码' })
  async generateWecomQrCode() {
    return this.imService.generateWecomQrCode();
  }

  @Get('wecom/qr-codes')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: '查询企业微信机器人授权二维码状态' })
  async checkWecomQrCode(
    @CurrentUser() user: { sub: string },
    @Query('scode') scode: string,
  ) {
    return this.imService.checkWecomQrCode(user.sub, scode);
  }

  @Post('wecom/test-notification')
  @ApiOperation({ summary: '发送企业微信测试推送' })
  async sendWecomTestNotification(
    @CurrentUser() user: { sub: string },
    @Body() body: { robotId?: string },
  ) {
    return this.imService.sendWecomTestNotification(user.sub, body?.robotId);
  }

  @Post('wecom/start')
  @ApiOperation({ summary: '启动企业微信 Bot WebSocket 长连接' })
  async startWecom(@CurrentUser() user: { sub: string }) {
    return this.imService.startWecom(user.sub);
  }

  @Post('wechat/login')
  @ApiOperation({ summary: '启动微信扫码登录' })
  async startWechatLogin(@CurrentUser() user: { sub: string }) {
    return this.imService.startWechatLogin(user.sub);
  }

  @Post('wechat/connections')
  @ApiOperation({ summary: '保存微信 iLink 凭证' })
  async saveWechatConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: SaveWechatConnectionDto,
  ) {
    return this.imService.saveWechatConnection(user.sub, body);
  }

  @Post('wechat/start')
  @ApiOperation({ summary: '启动微信长轮询' })
  async startWechat(@CurrentUser() user: { sub: string }) {
    return this.imService.startWechat(user.sub);
  }

  @Post('wechat/stop')
  @ApiOperation({ summary: '停止微信长轮询' })
  async stopWechat(@CurrentUser() user: { sub: string }) {
    return this.imService.stopWechat(user.sub);
  }

  @Post('wechat/logout')
  @ApiOperation({ summary: '退出微信登录' })
  async logoutWechat(@CurrentUser() user: { sub: string }) {
    return this.imService.logoutWechat(user.sub);
  }

  @Post('wechat/test-notification')
  @ApiOperation({ summary: '发送微信测试推送' })
  async sendWechatTestNotification(
    @CurrentUser() user: { sub: string },
    @Body() body: { robotId?: string },
  ) {
    return this.imService.sendWechatTestNotification(user.sub, body?.robotId);
  }

  @Post('feishu/connections/delete')
  @ApiOperation({ summary: '删除飞书机器人配置' })
  async deleteFeishuConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: { appId: string },
  ) {
    return this.imService.deleteFeishuConnection(user.sub, body.appId);
  }

  @Post('dingtalk/connections/delete')
  @ApiOperation({ summary: '删除钉钉机器人配置' })
  async deleteDingTalkConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: { clientId: string },
  ) {
    return this.imService.deleteDingTalkConnection(user.sub, body.clientId);
  }

  @Post('wecom/connections/delete')
  @ApiOperation({ summary: '删除企业微信机器人配置' })
  async deleteWecomConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: { botId: string },
  ) {
    return this.imService.deleteWecomConnection(user.sub, body.botId);
  }

  @Post('wechat/connections/delete')
  @ApiOperation({ summary: '删除微信机器人配置' })
  async deleteWechatConnection(
    @CurrentUser() user: { sub: string },
    @Body() body: { ilinkBotId: string },
  ) {
    return this.imService.deleteWechatConnection(user.sub, body.ilinkBotId);
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
    @Body() body: CreatePairingCodeDto,
  ) {
    return this.imService.createPairingCode(user.sub, body.provider);
  }

  @Get('subscriptions')
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @ApiOperation({ summary: '获取 IM 群订阅' })
  async listSubscriptions(
    @CurrentUser() user: { sub: string },
    @Query('provider') provider?: ImProvider,
    @Query('robotId') robotId?: string,
  ) {
    return this.imService.listSubscriptions(user.sub, provider || 'feishu', robotId);
  }

  @Post('subscriptions')
  @ApiOperation({ summary: '保存 IM 群订阅' })
  async saveSubscriptions(
    @CurrentUser() user: { sub: string },
    @Body() body: SaveSubscriptionsDto & { robotId?: string },
  ) {
    return this.imService.saveSubscriptions(user.sub, body.provider, body.subscriptions, body.robotId);
  }
}
