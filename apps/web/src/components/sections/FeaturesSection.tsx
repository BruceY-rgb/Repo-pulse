import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Radio, 
  Brain, 
  Filter, 
  CheckCircle, 
  Bell, 
  BarChart3, 
  FileText, 
  GitCompare,
  Zap,
  Shield,
  Clock,
  List,
  Grid3X3
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';

interface FeaturesSectionProps {
  activeSubsection: string;
}

export function FeaturesSection({ activeSubsection }: FeaturesSectionProps) {
  const { language, t } = useLanguage();
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  const renderContent = () => {
    switch (activeSubsection) {
      case 'data-listening':
        return <DataListeningContent language={language} />;
      case 'ai-analysis':
        return <AIAnalysisContent language={language} />;
      case 'filtering':
        return <FilteringContent language={language} />;
      case 'approval':
        return <ApprovalContent language={language} />;
      case 'notification':
        return <NotificationContent language={language} />;
      case 'dashboard':
        return <DashboardContent language={language} />;
      case 'reporting':
        return <ReportingContent language={language} />;
      case 'comparison':
        return <ComparisonContent language={language} />;
      default:
        return <FeaturesOverview viewMode={viewMode} setViewMode={setViewMode} language={language} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('features.title')}</h1>
        <p className="text-muted-foreground">
          {t('features.subtitle')}
        </p>
      </div>
      {renderContent()}
    </div>
  );
}

// Feature Checklist Data
const featureChecklistData = {
  en: [
    {
      category: 'User & Authentication',
      features: [
        { name: 'User Registration/Login', desc: 'Email registration and login, GitHub OAuth third-party login', value: 'Lower barrier to entry for developers' },
        { name: 'Role Management', desc: 'Developer, Reviewer, Admin roles with different permissions', value: 'Support both personal and team modes' },
        { name: 'Personal Settings', desc: 'Notification preferences, repository list, keyword filters', value: 'Personalized information delivery' },
      ],
    },
    {
      category: 'Repository Integration',
      features: [
        { name: 'Repository Binding', desc: 'Support GitHub/GitLab repository connection', value: 'One-time configuration for continuous monitoring' },
        { name: 'Webhook Configuration', desc: 'Configure webhooks to receive PR, Issue, Commit events', value: 'Real-time event synchronization' },
        { name: 'Event Standardization', desc: 'Parse different platform events into unified format', value: 'Simplify multi-platform adaptation' },
      ],
    },
    {
      category: 'Async Processing',
      features: [
        { name: 'Redis Queue', desc: 'Buffer high-frequency webhook requests', value: 'Prevent system blocking during traffic spikes' },
        { name: 'Worker Pool', desc: 'Parallel processing of AI analysis and notifications', value: 'Improved stability and scalability' },
        { name: 'Retry Mechanism', desc: 'Automatic retry for failed processing', value: 'Ensure no events are lost' },
      ],
    },
    {
      category: 'AI Analysis Engine',
      features: [
        { name: 'PR/Issue Summary', desc: 'Auto-extract purpose, changes, discussion focus', value: 'Quick understanding without reading all content' },
        { name: 'Diff Analysis', desc: 'Semantic summary of code changes', value: 'Understand business meaning of changes' },
        { name: 'Risk Assessment', desc: 'High/Medium/Low risk labels with sensitive area marking', value: 'Prioritize high-risk changes' },
        { name: 'Sensitive Info Detection', desc: 'Detect secrets, config leaks, sensitive path changes', value: 'Reduce security risks' },
        { name: 'Semantic Classification', desc: 'Auto-identify Bug fix, Feature, Refactor, Docs', value: 'Filter by type and track change structure' },
        { name: 'Version Suggestion', desc: 'Recommend SemVer based on change scope', value: 'Standardize version management' },
      ],
    },
    {
      category: 'Filtering & Subscription',
      features: [
        { name: 'Keyword Filtering', desc: 'Set focus areas like "performance" or "security"', value: 'Only receive relevant information' },
        { name: 'Noise Filtering', desc: 'Auto-ignore docs, formatting, comment changes', value: 'Reduce meaningless notifications' },
        { name: 'Repository Subscription', desc: 'Subscribe by repo, org, or tag', value: 'Clear scope management' },
      ],
    },
    {
      category: 'Approval Workflow',
      features: [
        { name: 'Pending Review Queue', desc: 'AI results enter review queue before distribution', value: 'Prevent AI errors from spreading' },
        { name: 'Approve/Reject', desc: 'Reviewer can approve or reject AI results', value: 'Human verification for accuracy' },
        { name: 'Content Editing', desc: 'Reviewer can modify summary, risk level, tags', value: 'AI generates, human confirms' },
      ],
    },
    {
      category: 'Notification System',
      features: [
        { name: 'Multi-channel Support', desc: 'DingTalk, Feishu, Email, Slack, Teams', value: 'Deliver via team-preferred channels' },
        { name: 'Smart Routing', desc: 'High-risk to DingTalk, normal to email, weekly digest', value: 'Reduce interruptions, improve quality' },
      ],
    },
    {
      category: 'Dashboard & Analytics',
      features: [
        { name: 'Activity Metrics', desc: 'Commit, PR, Issue count trends', value: 'Quickly perceive project activity' },
        { name: 'Risk Trends', desc: 'High-risk change statistics over time', value: 'Identify quality fluctuations' },
        { name: 'Issue Efficiency', desc: 'Issue open/close ratio, average resolution time', value: 'Evaluate problem handling efficiency' },
        { name: 'PR Cycle Time', desc: 'Time from PR creation to merge', value: 'Identify review bottlenecks' },
      ],
    },
    {
      category: 'Reporting',
      features: [
        { name: 'Auto Weekly Report', desc: 'Weekly summary of changes, risks, active modules', value: 'Save manual report writing time' },
        { name: 'Export Formats', desc: 'Markdown and PDF export support', value: 'Easy sharing and presentation' },
      ],
    },
    {
      category: 'Repository Comparison',
      features: [
        { name: 'Repo Comparison', desc: 'Compare activity, issues, tech trends across repos', value: 'Assist technology research and selection' },
      ],
    },
    {
      category: 'SaaS Backend',
      features: [
        { name: 'Multi-tenant Isolation', desc: 'Data isolation between teams and projects', value: 'SaaS platform data security' },
        { name: 'Org & Project Management', desc: 'Manage team, project, repo relationships', value: 'Clear resource management at scale' },
        { name: 'Approval Rules Config', desc: 'Enable/disable approval workflow per project', value: 'Flexibility for personal vs team modes' },
        { name: 'Push Rules Config', desc: 'Configure which events to push and where', value: 'Adapt to team collaboration habits' },
      ],
    },
  ],
  zh: [
    {
      category: '用户与认证',
      features: [
        { name: '用户注册登录', desc: '支持邮箱注册登录，GitHub OAuth第三方登录', value: '降低使用门槛，让开发者快速接入' },
        { name: '角色管理', desc: '支持开发者、Reviewer、管理员等角色，不同角色拥有不同权限', value: '适配个人和团队两种使用模式' },
        { name: '个人设置', desc: '支持设置通知偏好、关注仓库列表、关键词过滤规则', value: '让每个用户接收到的信息更符合需求' },
      ],
    },
    {
      category: '仓库接入',
      features: [
        { name: '仓库绑定', desc: '支持绑定 GitHub/GitLab 仓库', value: '用户只需配置一次，后续持续接收动态' },
        { name: 'Webhook 配置', desc: '配置 Webhook 接收 PR、Issue、Commit 等事件', value: '实现仓库事件实时同步' },
        { name: '事件标准化', desc: '将不同平台、不同类型的原始事件解析成统一数据格式', value: '方便后续 AI 分析和看板统计' },
      ],
    },
    {
      category: '异步处理',
      features: [
        { name: 'Redis 队列', desc: '使用 Redis 队列缓冲高频 Webhook 请求', value: '防止事件突发时系统阻塞' },
        { name: 'Worker 池', desc: '并行处理 AI 分析和通知推送任务', value: '提升稳定性和可扩展性' },
        { name: '重试机制', desc: '处理失败时自动重试', value: '确保事件不丢失' },
      ],
    },
    {
      category: 'AI 分析引擎',
      features: [
        { name: 'PR / Issue 摘要', desc: '自动提炼 PR 目的、主要改动、讨论焦点和结论', value: '用户不必逐条阅读就能快速理解核心内容' },
        { name: 'Diff 纵向总结', desc: '对代码差异进行语义化归纳', value: '帮助用户跳过低层次代码细节，直接理解变更业务含义' },
        { name: '风险评估', desc: '对变更打上高/中/低风险标签，标记潜在敏感区域', value: '让团队优先关注高风险改动' },
        { name: '敏感信息检测', desc: '检测是否存在密钥、配置泄露、敏感路径修改等', value: '降低潜在安全问题被忽略的风险' },
        { name: '语义分类', desc: '自动识别变更是 Bug 修复、功能新增、重构优化、文档修改等', value: '帮助用户按类型筛选信息' },
        { name: '版本建议', desc: '基于变更规模和影响范围推荐语义化版本号', value: '帮助团队规范版本管理' },
      ],
    },
    {
      category: '过滤与订阅',
      features: [
        { name: '关键词过滤', desc: '用户可设置"只看性能优化""只看安全修复"等关注方向', value: '让用户只接收自己真正关心的信息' },
        { name: '噪音过滤', desc: '自动忽略纯文档、格式调整、注释补充等低价值变更', value: '减少无意义通知' },
        { name: '仓库订阅', desc: '支持按仓库、组织、标签进行订阅管理', value: '用户可以清晰管理关注范围' },
      ],
    },
    {
      category: '审批流系统',
      features: [
        { name: '待审核队列', desc: '团队模式下，AI 生成的总结先进入待审核列表', value: '防止 AI 误判直接传播' },
        { name: '审核通过 / 驳回', desc: 'Reviewer 可以对 AI 结果进行通过、拒绝操作', value: '让重要内容在发出前有人工把关' },
        { name: '内容编辑', desc: 'Reviewer 可修改 AI 摘要、风险等级和标签后再发布', value: '实现"AI 先生成，人来最终确认"' },
      ],
    },
    {
      category: '通知系统',
      features: [
        { name: '消息推送', desc: '支持钉钉、飞书、邮件、Slack、Teams 等通知方式', value: '让重要信息能以团队习惯的方式触达' },
        { name: '路由分发', desc: '高风险变更发钉钉，普通更新发邮件，周报集中推送', value: '减少打扰，提升通知质量' },
      ],
    },
    {
      category: 'Dashboard 看板',
      features: [
        { name: '项目活跃度', desc: '展示 Commit、PR、Issue 的数量变化和时间趋势', value: '帮助用户快速感知项目是否活跃' },
        { name: '风险趋势', desc: '按时间统计高风险改动数量、风险分布', value: '便于团队判断近期是否存在质量波动' },
        { name: 'Issue 处理效率', desc: '展示 Issue 打开、关闭、平均处理时长等指标', value: '帮助管理者评估问题处理效率' },
        { name: 'PR 处理周期', desc: '统计 PR 从创建到合并的时间', value: '可以直观看出评审流程是否顺畅' },
      ],
    },
    {
      category: '报告系统',
      features: [
        { name: '自动周报', desc: '自动生成本周项目变化摘要、重点风险、活跃模块等内容', value: '节省手工写周报的时间' },
        { name: '导出格式', desc: '支持 Markdown / PDF 导出', value: '方便提交给导师、领导、团队或用于答辩展示' },
      ],
    },
    {
      category: '项目对比',
      features: [
        { name: 'Repo 对比分析', desc: '支持对比两个相似仓库的活跃度、问题分布、技术话题趋势', value: '帮助开发者进行技术调研与框架选型' },
      ],
    },
    {
      category: 'SaaS 后台',
      features: [
        { name: '多租户隔离', desc: '不同团队、不同项目的数据相互隔离', value: '满足 SaaS 平台场景，保证数据安全' },
        { name: '组织与项目管理', desc: '支持团队、项目、仓库之间的管理关系配置', value: '便于团队规模扩大时仍能清晰管理资源' },
        { name: '审批规则配置', desc: '可按项目开启或关闭审批流，配置审核角色', value: '适配个人模式与团队模式' },
        { name: '推送规则配置', desc: '可配置哪些事件需要推送，推送到哪里，谁来接收', value: '让系统真正贴近团队协作习惯' },
      ],
    },
  ],
};

function FeaturesOverview({ viewMode, setViewMode, language }: { viewMode: 'card' | 'list'; setViewMode: (mode: 'card' | 'list') => void; language: string }) {
  const { t } = useLanguage();
  
  const features = [
    {
      id: 'data-listening',
      title: t('nav.dataListening') as string,
      icon: Radio,
      description: language === 'zh' ? '实时仓库监控与Webhook集成和异步处理' : 'Real-time repository monitoring with Webhook integration and async processing',
      highlights: language === 'zh' ? ['GitHub/GitLab 支持', 'Redis 队列缓冲', '事件标准化'] : ['GitHub/GitLab support', 'Redis queue buffering', 'Event standardization'],
    },
    {
      id: 'ai-analysis',
      title: t('nav.aiAnalysis') as string,
      icon: Brain,
      description: language === 'zh' ? '智能代码分析，包括摘要生成、风险评估和分类' : 'Intelligent code analysis with summarization, risk assessment, and classification',
      highlights: language === 'zh' ? ['PR/Issue 摘要', '风险评估', '语义分类'] : ['PR/Issue summarization', 'Risk evaluation', 'Semantic classification'],
    },
    {
      id: 'filtering',
      title: t('nav.filtering') as string,
      icon: Filter,
      description: language === 'zh' ? '可定制的内容过滤和订阅管理' : 'Customizable content filtering and subscription management',
      highlights: language === 'zh' ? ['关键词过滤', '噪音过滤', '智能订阅'] : ['Keyword filtering', 'Noise reduction', 'Smart subscription'],
    },
    {
      id: 'approval',
      title: t('nav.approval') as string,
      icon: CheckCircle,
      description: language === 'zh' ? '团队审核和审批流程，用于AI生成内容' : 'Team review and approval process for AI-generated content',
      highlights: language === 'zh' ? ['待审核队列', '编辑与批准', '基于角色的访问'] : ['Pending review queue', 'Edit & approve', 'Role-based access'],
    },
    {
      id: 'notification',
      title: t('nav.notification') as string,
      icon: Bell,
      description: language === 'zh' ? '跨多个渠道的智能通知路由' : 'Intelligent notification routing across multiple channels',
      highlights: language === 'zh' ? ['多渠道支持', '智能路由', '基于优先级的投递'] : ['Multi-channel support', 'Smart routing', 'Priority-based delivery'],
    },
    {
      id: 'dashboard',
      title: t('nav.dashboard') as string,
      icon: BarChart3,
      description: language === 'zh' ? '项目健康、团队生产力和趋势的可视化洞察' : 'Visual insights into project health, team productivity, and trends',
      highlights: language === 'zh' ? ['活跃度指标', '风险趋势', 'DORA 指标'] : ['Activity metrics', 'Risk trends', 'DORA metrics'],
    },
    {
      id: 'reporting',
      title: t('nav.reporting') as string,
      icon: FileText,
      description: language === 'zh' ? '自动生成周报和月报' : 'Automated generation of weekly and monthly reports',
      highlights: language === 'zh' ? ['周报摘要', 'Markdown/PDF 导出', '自定义模板'] : ['Weekly summaries', 'Markdown/PDF export', 'Custom templates'],
    },
    {
      id: 'comparison',
      title: t('nav.comparison') as string,
      icon: GitCompare,
      description: language === 'zh' ? '跨多个仓库比较活动、问题和趋势' : 'Compare activity, issues, and trends across multiple repositories',
      highlights: language === 'zh' ? ['多仓库分析', '趋势对比', '技术洞察'] : ['Multi-repo analysis', 'Trend comparison', 'Technology insights'],
    },
  ];

  const checklistData = featureChecklistData[language as 'en' | 'zh'] || featureChecklistData.zh;

  return (
    <div className="space-y-6">
      {/* Features Overview Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t('features.overview.title')}</h2>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'card' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('card')}
            >
              <Grid3X3 className="h-4 w-4 mr-1" />
              Card
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
          </div>
        </div>
        
        {viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature) => (
              <Card key={feature.id} className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <feature.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {feature.highlights.map((highlight, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {highlight}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {features.map((feature) => (
              <div key={feature.id} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
                <div className="flex gap-1">
                  {feature.highlights.slice(0, 2).map((highlight, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {highlight}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Complete Feature Checklist */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t('features.checklist.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('features.checklist.subtitle')}</p>
        
        <div className="space-y-6">
          {checklistData.map((category) => (
            <Card key={category.category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{category.category}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/4">{language === 'zh' ? '功能' : 'Feature'}</TableHead>
                      <TableHead className="w-2/5">{language === 'zh' ? '详细描述' : 'Description'}</TableHead>
                      <TableHead>{language === 'zh' ? '用户价值' : 'User Value'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {category.features.map((feature, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{feature.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{feature.desc}</TableCell>
                        <TableCell className="text-sm">{feature.value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// Sub-section components... (keeping the existing implementations)
function DataListeningContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Radio className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '数据监听与处理' : 'Data Listening & Processing'}</h2>
            <p className="text-muted-foreground">{isZh ? '实时仓库监控基础设施' : 'Real-time repository monitoring infrastructure'}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? '系统架构' : 'System Architecture'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-blue-500">GitHub/GitLab</span>
              <span>→</span>
              <span className="text-green-500">Webhook</span>
              <span>→</span>
              <span className="text-purple-500">API Gateway</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-purple-500">API Gateway</span>
              <span>→</span>
              <span className="text-orange-500">Event Parser</span>
              <span>→</span>
              <span className="text-red-500">Redis Queue</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-500">Redis Queue</span>
              <span>→</span>
              <span className="text-yellow-500">Worker</span>
              <span>→</span>
              <span className="text-blue-500">AI Engine</span>
              <span>→</span>
              <span className="text-green-500">Database</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              <CardTitle className="text-lg">{isZh ? '实时事件' : 'Real-time Events'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? 'Pull Request 事件（打开、更新、合并、关闭）' : 'Pull Request events (opened, updated, merged, closed)'}</li>
              <li>• {isZh ? 'Issue 事件（创建、更新、关闭、评论）' : 'Issue events (created, updated, closed, commented)'}</li>
              <li>• {isZh ? 'Commit 事件（推送、打标签）' : 'Commit events (pushed, tagged)'}</li>
              <li>• {isZh ? 'Review 事件（提交、驳回）' : 'Review events (submitted, dismissed)'}</li>
              <li>• {isZh ? 'Release 事件（发布、预发布）' : 'Release events (published, prereleased)'}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">{isZh ? '异步处理' : 'Async Processing'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? 'Redis 队列用于事件缓冲' : 'Redis queue for event buffering'}</li>
              <li>• {isZh ? 'Worker 池并行处理' : 'Worker pool for parallel processing'}</li>
              <li>• {isZh ? '失败时自动重试' : 'Automatic retry on failure'}</li>
              <li>• {isZh ? '死信队列处理问题事件' : 'Dead letter queue for problematic events'}</li>
              <li>• {isZh ? '速率限制和节流' : 'Rate limiting and throttling'}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AIAnalysisContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? 'AI 分析引擎' : 'AI Analysis Engine'}</h2>
            <p className="text-muted-foreground">{isZh ? '智能代码理解和摘要' : 'Intelligent code understanding and summarization'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? 'PR/Issue 摘要' : 'PR/Issue Summarization'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isZh ? '自动从 PR 描述和 Issue 讨论中提取关键信息' : 'Automatically extract key information from PR descriptions and issue discussions'}
            </p>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '目的和动机' : 'Purpose and motivation'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '主要变更和修改' : 'Main changes and modifications'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '讨论要点' : 'Discussion highlights'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '结论和决策' : 'Conclusions and decisions'}</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? 'Diff 分析' : 'Diff Analysis'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isZh ? '超越简单 diff 查看的代码变更语义理解' : 'Semantic understanding of code changes beyond simple diff viewing'}
            </p>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '业务逻辑变更' : 'Business logic changes'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '架构修改' : 'Architecture modifications'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? 'API 契约变更' : 'API contract changes'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '依赖更新' : 'Dependency updates'}</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              <CardTitle className="text-lg">{isZh ? '风险评估' : 'Risk Assessment'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isZh ? '自动识别和标记高风险变更' : 'Automatically identify and flag high-risk changes'}
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">{isZh ? '高' : 'High'}</Badge>
                <span className="text-sm">{isZh ? '认证、授权、安全关键代码' : 'Authentication, authorization, security-critical code'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-yellow-500">{isZh ? '中' : 'Medium'}</Badge>
                <span className="text-sm">{isZh ? '数据库架构、API 变更、配置' : 'Database schema, API changes, configuration'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{isZh ? '低' : 'Low'}</Badge>
                <span className="text-sm">{isZh ? '文档、注释、格式' : 'Documentation, comments, formatting'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '语义分类' : 'Semantic Classification'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isZh ? '按类型和影响自动分类变更' : 'Automatically categorize changes by type and impact'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{isZh ? 'Bug 修复' : 'Bug Fix'}</Badge>
              <Badge variant="secondary">{isZh ? '功能' : 'Feature'}</Badge>
              <Badge variant="secondary">{isZh ? '重构' : 'Refactor'}</Badge>
              <Badge variant="secondary">{isZh ? '文档' : 'Documentation'}</Badge>
              <Badge variant="secondary">{isZh ? '性能' : 'Performance'}</Badge>
              <Badge variant="secondary">{isZh ? '安全' : 'Security'}</Badge>
              <Badge variant="secondary">{isZh ? '测试' : 'Test'}</Badge>
              <Badge variant="secondary">{isZh ? '杂项' : 'Chore'}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FilteringContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Filter className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '过滤与订阅' : 'Filtering & Subscription'}</h2>
            <p className="text-muted-foreground">{isZh ? '智能内容过滤和订阅管理' : 'Intelligent content filtering and subscription management'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '关键词过滤' : 'Keyword Filtering'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '包含/排除特定关键词' : 'Include/exclude specific keywords'}</li>
              <li>• {isZh ? '正则表达式支持' : 'Regular expression support'}</li>
              <li>• {isZh ? '文件路径模式' : 'File path patterns'}</li>
              <li>• {isZh ? '基于作者的过滤' : 'Author-based filtering'}</li>
              <li>• {isZh ? '基于标签的过滤' : 'Label-based filtering'}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '噪音过滤' : 'Noise Reduction'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '自动忽略仅文档变更' : 'Auto-ignore documentation-only changes'}</li>
              <li>• {isZh ? '过滤格式和样式变更' : 'Filter formatting and style changes'}</li>
              <li>• {isZh ? '跳过依赖锁文件更新' : 'Skip dependency lock file updates'}</li>
              <li>• {isZh ? '忽略机器人生成的变更' : 'Ignore bot-generated changes'}</li>
              <li>• {isZh ? '可配置的噪音模式' : 'Configurable noise patterns'}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ApprovalContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CheckCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '审批工作流' : 'Approval Workflow'}</h2>
            <p className="text-muted-foreground">{isZh ? '团队审核和审批流程' : 'Team review and approval process'}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? '工作流程' : 'Workflow Process'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">1</div>
              <div>
                <p className="font-medium">{isZh ? 'AI 分析' : 'AI Analysis'}</p>
                <p className="text-xs text-muted-foreground">{isZh ? '生成摘要' : 'Generate summary'}</p>
              </div>
            </div>
            <div className="hidden md:block text-muted-foreground">→</div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white text-sm font-bold">2</div>
              <div>
                <p className="font-medium">{isZh ? '待审核' : 'Pending Review'}</p>
                <p className="text-xs text-muted-foreground">{isZh ? '进入审核队列' : 'Queue for approval'}</p>
              </div>
            </div>
            <div className="hidden md:block text-muted-foreground">→</div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">3</div>
              <div>
                <p className="font-medium">{isZh ? '审核操作' : 'Reviewer Action'}</p>
                <p className="text-xs text-muted-foreground">{isZh ? '批准/编辑/拒绝' : 'Approve/Edit/Reject'}</p>
              </div>
            </div>
            <div className="hidden md:block text-muted-foreground">→</div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">4</div>
              <div>
                <p className="font-medium">{isZh ? '已发布' : 'Published'}</p>
                <p className="text-xs text-muted-foreground">{isZh ? '发送通知' : 'Send notifications'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '智能通知' : 'Smart Notification'}</h2>
            <p className="text-muted-foreground">{isZh ? '智能通知路由和投递' : 'Intelligent notification routing and delivery'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '支持的渠道' : 'Supported Channels'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• DingTalk ({isZh ? '钉钉' : 'DingTalk'})</li>
              <li>• Feishu/Lark ({isZh ? '飞书' : 'Feishu'})</li>
              <li>• Email (SMTP)</li>
              <li>• Slack</li>
              <li>• Microsoft Teams</li>
              <li>• Webhook ({isZh ? '自定义' : 'custom'})</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '智能路由' : 'Smart Routing'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '基于优先级的路由' : 'Priority-based routing'}</li>
              <li>• {isZh ? '按事件类型选择渠道' : 'Channel per event type'}</li>
              <li>• {isZh ? '基于时间的规则' : 'Time-based rules'}</li>
              <li>• {isZh ? '尊重用户偏好' : 'User preference respect'}</li>
              <li>• {isZh ? '批量和摘要' : 'Batch and digest'}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '仪表板与分析' : 'Dashboard & Analytics'}</h2>
            <p className="text-muted-foreground">{isZh ? '项目健康、团队生产力和趋势的可视化洞察' : 'Visual insights for project health'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '活跃度指标' : 'Activity Metrics'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '提交频率' : 'Commit frequency'}</li>
              <li>• {isZh ? 'PR 开闭率' : 'PR open/close rate'}</li>
              <li>• {isZh ? 'Issue 解决时间' : 'Issue resolution time'}</li>
              <li>• {isZh ? '活跃贡献者' : 'Active contributors'}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">DORA {isZh ? '指标' : 'Metrics'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '部署频率' : 'Deployment frequency'}</li>
              <li>• {isZh ? '变更前置时间' : 'Lead time for changes'}</li>
              <li>• {isZh ? '变更失败率' : 'Change failure rate'}</li>
              <li>• {isZh ? '恢复时间' : 'Time to recovery'}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '风险分析' : 'Risk Analysis'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '高风险变更趋势' : 'High-risk change trends'}</li>
              <li>• {isZh ? '安全问题跟踪' : 'Security issue tracking'}</li>
              <li>• {isZh ? '代码质量指标' : 'Code quality metrics'}</li>
              <li>• {isZh ? '技术债务指标' : 'Technical debt indicators'}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReportingContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '自动报告' : 'Auto Reporting'}</h2>
            <p className="text-muted-foreground">{isZh ? '自动生成和分发报告' : 'Automated report generation and distribution'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '报告类型' : 'Report Types'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Badge variant="secondary">{isZh ? '周报' : 'Weekly'}</Badge>
                <span className="text-muted-foreground">{isZh ? '变更、风险和亮点摘要' : 'Summary of changes, risks, and highlights'}</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary">{isZh ? '月报' : 'Monthly'}</Badge>
                <span className="text-muted-foreground">{isZh ? '趋势、指标和团队绩效' : 'Trends, metrics, and team performance'}</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary">{isZh ? '发布' : 'Release'}</Badge>
                <span className="text-muted-foreground">{isZh ? '变更日志和发布说明' : 'Changelog and release notes'}</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary">{isZh ? '自定义' : 'Custom'}</Badge>
                <span className="text-muted-foreground">{isZh ? '用户自定义报告' : 'User-defined reports'}</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '导出格式' : 'Export Formats'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Markdown (.md)</li>
              <li>• PDF {isZh ? '文档' : 'document'}</li>
              <li>• HTML {isZh ? '页面' : 'page'}</li>
              <li>• JSON {isZh ? '数据' : 'data'}</li>
              <li>• Email {isZh ? '内联' : 'inline'}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ComparisonContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <GitCompare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '仓库对比' : 'Repository Comparison'}</h2>
            <p className="text-muted-foreground">{isZh ? '比较和分析多个仓库' : 'Compare and analyze multiple repositories'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '对比维度' : 'Comparison Dimensions'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '活跃度（提交、PR、Issue）' : 'Activity level (commits, PRs, issues)'}</li>
              <li>• {isZh ? 'Issue 分布（开闭比）' : 'Issue distribution (open/closed ratio)'}</li>
              <li>• {isZh ? '技术趋势（语言使用）' : 'Technology trends (language usage)'}</li>
              <li>• {isZh ? '贡献者参与度' : 'Contributor engagement'}</li>
              <li>• {isZh ? '发布频率' : 'Release frequency'}</li>
              <li>• {isZh ? '响应时间指标' : 'Response time metrics'}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '使用场景' : 'Use Cases'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '技术栈评估' : 'Technology stack evaluation'}</li>
              <li>• {isZh ? '开源项目选择' : 'Open source project selection'}</li>
              <li>• {isZh ? '竞品分析' : 'Competitor analysis'}</li>
              <li>• {isZh ? '内部项目基准测试' : 'Internal project benchmarking'}</li>
              <li>• {isZh ? '团队绩效比较' : 'Team performance comparison'}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
