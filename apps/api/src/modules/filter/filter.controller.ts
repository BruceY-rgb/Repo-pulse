import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  FilterService,
  CreateFilterRuleDto,
  UpdateFilterRuleDto,
  TestFilterDto,
} from './filter.service';
import type { FilterRule } from '@repo-pulse/database';

@Controller('filters')
@UseGuards(AuthGuard('jwt'))
export class FilterController {
  constructor(private readonly filterService: FilterService) {}

  /**
   * 获取用户的所有过滤规则
   */
  @Get()
  async getRules(@CurrentUser() user: { sub: string }): Promise<FilterRule[]> {
    return this.filterService.getRules(user.sub);
  }

  /**
   * 创建过滤规则
   */
  @Post()
  async createRule(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateFilterRuleDto,
  ): Promise<FilterRule> {
    return this.filterService.createRule(user.sub, dto);
  }

  /**
   * 更新过滤规则
   */
  @Put(':id')
  async updateRule(
    @CurrentUser() user: { sub: string },
    @Param('id') ruleId: string,
    @Body() dto: UpdateFilterRuleDto,
  ): Promise<FilterRule> {
    return this.filterService.updateRule(user.sub, ruleId, dto);
  }

  /**
   * 删除过滤规则
   */
  @Delete(':id')
  async deleteRule(
    @CurrentUser() user: { sub: string },
    @Param('id') ruleId: string,
  ): Promise<{ success: boolean }> {
    await this.filterService.deleteRule(user.sub, ruleId);
    return { success: true };
  }

  /**
   * 测试规则匹配
   */
  @Post('test')
  async testRule(
    @Body() dto: TestFilterDto,
  ): Promise<{ matched: boolean; action: string | null }> {
    return this.filterService.testRule(dto);
  }
}
