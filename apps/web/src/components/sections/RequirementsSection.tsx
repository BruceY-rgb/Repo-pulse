import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  TrendingUp, 
  Search,
  CheckCircle,
  XCircle,
  MinusCircle
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/contexts/LanguageContext';

interface RequirementsSectionProps {
  activeSubsection: string;
}

export function RequirementsSection({ activeSubsection }: RequirementsSectionProps) {
  const { language, t } = useLanguage();

  const renderContent = () => {
    switch (activeSubsection) {
      case 'user-personas':
        return <UserPersonasContent language={language} />;
      case 'pain-points':
        return <PainPointsContent language={language} />;
      case 'market-research':
        return <MarketResearchContent language={language} />;
      default:
        return <UserPersonasContent language={language} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('requirements.title')}</h1>
        <p className="text-muted-foreground">
          {t('requirements.subtitle')}
        </p>
      </div>
      {renderContent()}
    </div>
  );
}

function UserPersonasContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  
  const personas = isZh ? [
    {
      name: '陈明',
      role: '高级开发工程师',
      avatar: 'CM',
      color: 'bg-blue-500',
      description: '全栈开发者，参与多个项目，为开源项目做贡献',
      goals: [
        '关注自己贡献的项目动态',
        '快速理解 PR 变更而无需阅读所有代码',
        '早期识别安全风险',
        '跟踪有趣的开源项目',
      ],
      frustrations: [
        'GitHub 通知太多',
        'PR 描述冗长但没有清晰的摘要',
        '缺少变更原因的上下文',
        '难以跟踪多个项目',
      ],
    },
    {
      name: '李雪',
      role: '技术负责人',
      avatar: 'LX',
      color: 'bg-purple-500',
      description: '带领 8 人开发团队，负责代码质量和交付',
      goals: [
        '确保代码审查质量和速度',
        '早期识别高风险变更',
        '跟踪团队生产力指标',
        '减少手动审查时间',
      ],
      frustrations: [
        '审查积压不断增长',
        '审查质量不一致',
        '缺少跨团队变更的上下文',
        '无法看到审查瓶颈',
      ],
    },
    {
      name: '王强',
      role: '工程经理',
      avatar: 'WQ',
      color: 'bg-green-500',
      description: '管理 3 个工程团队，向 CTO 汇报工程生产力',
      goals: [
        '客观衡量团队生产力',
        '识别流程瓶颈',
        '跟踪 DORA 指标和趋势',
        '为领导层生成报告',
      ],
      frustrations: [
        '缺乏团队绩效可见性',
        '手动报告生成耗时太长',
        '没有历史趋势分析',
        '难以比较团队绩效',
      ],
    },
  ] : [
    {
      name: 'Alex Chen',
      role: 'Senior Developer',
      avatar: 'AC',
      color: 'bg-blue-500',
      description: 'Full-stack developer working on multiple projects, contributes to open source',
      goals: [
        'Stay updated on projects I contribute to',
        'Quickly understand PR changes without reading all code',
        'Identify security risks early',
        'Track interesting open source projects',
      ],
      frustrations: [
        'Too many GitHub notifications',
        'Long PR descriptions without clear summaries',
        'Missing context on why changes were made',
        'Difficulty tracking multiple projects',
      ],
    },
    {
      name: 'Sarah Johnson',
      role: 'Tech Lead',
      avatar: 'SJ',
      color: 'bg-purple-500',
      description: 'Leads a team of 8 developers, responsible for code quality and delivery',
      goals: [
        'Ensure code review quality and speed',
        'Identify high-risk changes early',
        'Track team productivity metrics',
        'Reduce time spent on manual reviews',
      ],
      frustrations: [
        'Review backlog growing constantly',
        'Inconsistent review quality',
        'Missing context on cross-team changes',
        'No visibility into review bottlenecks',
      ],
    },
    {
      name: 'Michael Wang',
      role: 'Engineering Manager',
      avatar: 'MW',
      color: 'bg-green-500',
      description: 'Manages 3 engineering teams, reports to CTO on engineering productivity',
      goals: [
        'Measure team productivity objectively',
        'Identify process bottlenecks',
        'Track DORA metrics and trends',
        'Generate reports for leadership',
      ],
      frustrations: [
        'Lack of visibility into team performance',
        'Manual report generation takes too long',
        'No historical trend analysis',
        'Difficulty comparing team performance',
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">{isZh ? '用户画像' : 'User Personas'}</h2>
        <p className="text-muted-foreground">
          {isZh ? '将从 Repo-Pulse 受益的三种主要用户类型' : 'Three primary user types who will benefit from Repo-Pulse'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {personas.map((persona) => (
          <Card key={persona.name}>
            <CardHeader>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 ${persona.color} rounded-full flex items-center justify-center text-white font-semibold`}>
                  {persona.avatar}
                </div>
                <div>
                  <CardTitle className="text-xl">{persona.name}</CardTitle>
                  <Badge variant="secondary" className="mt-1">{persona.role}</Badge>
                  <p className="text-sm text-muted-foreground mt-2">{persona.description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    {isZh ? '目标' : 'Goals'}
                  </h4>
                  <ul className="space-y-2">
                    {persona.goals.map((goal, index) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-green-500 mt-1">•</span>
                        {goal}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    {isZh ? '痛点' : 'Pain Points'}
                  </h4>
                  <ul className="space-y-2">
                    {persona.frustrations.map((frustration, index) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        {frustration}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PainPointsContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  
  const painPoints = isZh ? [
    {
      category: '信息过载',
      icon: AlertTriangle,
      problems: [
        'Issue/PR 更新频繁难以手动跟踪',
        '文档和格式变更产生太多噪音',
        '难以识别哪些变更真正重要',
        '通知缺乏优先级和上下文',
      ],
      impact: '高',
    },
    {
      category: '理解成本高',
      icon: Search,
      problems: [
        'PR diff 难以快速阅读和理解',
        'Issue 讨论冗长没有清晰摘要',
        '缺少变更原因的上下文',
        '没有对代码变更的语义理解',
      ],
      impact: '高',
    },
    {
      category: '通知无效',
      icon: MinusCircle,
      problems: [
        '通知太多或没有重点',
        '无法根据兴趣个性化过滤',
        '没有基于内容的智能路由',
        '相同信息推送给所有人',
      ],
      impact: '中',
    },
    {
      category: '团队管理困难',
      icon: TrendingUp,
      problems: [
        '无法客观量化研发效率',
        '缺乏风险预警机制',
        '没有跨项目的统一数据视图',
        '手动报告生成耗时',
      ],
      impact: '高',
    },
  ] : [
    {
      category: 'Information Overload',
      icon: AlertTriangle,
      problems: [
        'Issue/PR updates are too frequent to track manually',
        'Too much noise from documentation and formatting changes',
        'Difficult to identify which changes are truly important',
        'Notifications lack prioritization and context',
      ],
      impact: 'High',
    },
    {
      category: 'High Understanding Cost',
      icon: Search,
      problems: [
        'PR diffs are hard to read and understand quickly',
        'Issue discussions are lengthy without clear summaries',
        'Lack of context about why changes were made',
        'No semantic understanding of code changes',
      ],
      impact: 'High',
    },
    {
      category: 'Ineffective Notifications',
      icon: MinusCircle,
      problems: [
        'Too many notifications or notifications without focus',
        'Cannot personalize filtering based on interests',
        'No intelligent routing based on content type',
        'Same information pushed to everyone regardless of role',
      ],
      impact: 'Medium',
    },
    {
      category: 'Team Management Difficulties',
      icon: TrendingUp,
      problems: [
        'Cannot quantify R&D efficiency objectively',
        'Lack of risk warning mechanisms',
        'No unified data view across projects',
        'Manual report generation is time-consuming',
      ],
      impact: 'High',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">{isZh ? '痛点分析' : 'Pain Points Analysis'}</h2>
        <p className="text-muted-foreground">
          {isZh ? '开发者和团队在当前工作流中面临的关键挑战' : 'Key challenges faced by developers and teams in the current workflow'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {painPoints.map((point) => (
          <Card key={point.category}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <point.icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{point.category}</CardTitle>
                </div>
                <Badge variant={point.impact === 'High' || point.impact === '高' ? 'destructive' : 'secondary'}>
                  {point.impact} {isZh ? '影响' : 'Impact'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {point.problems.map((problem, index) => (
                  <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    {problem}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">{isZh ? '总结' : 'Summary'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isZh 
              ? '核心问题是代码变更量与人类理解能力之间的差距。开发者需要能够智能过滤、摘要和优先处理信息的工具，让他们专注于真正重要的事情。'
              : 'The core problem is the gap between the volume of code changes and the human capacity to understand them. Developers need tools that can intelligently filter, summarize, and prioritize information, allowing them to focus on what truly matters.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function MarketResearchContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  
  const competitors = isZh ? [
    {
      name: 'GitHub Copilot Code Review',
      type: 'AI 代码审查',
      strengths: ['深度 GitHub 集成', '上下文感知建议', '庞大用户群'],
      weaknesses: ['仅支持 GitHub', '仅限于代码建议', '无团队工作流功能'],
      ourAdvantage: '多平台支持、团队工作流、综合分析',
    },
    {
      name: 'CodeRabbit',
      type: 'AI PR 助手',
      strengths: ['多平台（GitHub、GitLab、Bitbucket）', '自然语言 PR 摘要', 'PR 交互式问答'],
      weaknesses: '仅专注于 PR 审查，无通知管理，分析有限',
      ourAdvantage: '从监控到报告的端到端工作流',
    },
    {
      name: 'GitLab Duo',
      type: '平台原生 AI',
      strengths: ['原生 GitLab 集成', '安全扫描集成', '建议审查者'],
      weaknesses: ['仅支持 GitLab', '跨仓库上下文有限', '企业版昂贵'],
      ourAdvantage: '平台无关，更好的跨仓库分析',
    },
    {
      name: 'Sourcery AI',
      type: '代码审查机器人',
      strengths: ['实时 IDE 反馈', '安全扫描', '自定义规则支持'],
      weaknesses: ['专注于 Python/JavaScript', '团队功能有限', '无通知路由'],
      ourAdvantage: '语言无关，全面的团队协作',
    },
  ] : [
    {
      name: 'GitHub Copilot Code Review',
      type: 'AI Code Review',
      strengths: ['Deep GitHub integration', 'Context-aware suggestions', 'Large user base'],
      weaknesses: ['GitHub only', 'Limited to code suggestions', 'No team workflow features'],
      ourAdvantage: 'Multi-platform support, team workflows, comprehensive analytics',
    },
    {
      name: 'CodeRabbit',
      type: 'AI PR Assistant',
      strengths: ['Multi-platform (GitHub, GitLab, Bitbucket)', 'Natural language PR summaries', 'Interactive Q&A on PRs'],
      weaknesses: ['Focus only on PR review', 'No notification management', 'Limited analytics'],
      ourAdvantage: 'End-to-end workflow from monitoring to reporting',
    },
    {
      name: 'GitLab Duo',
      type: 'Platform-Native AI',
      strengths: ['Native GitLab integration', 'Security scanning integration', 'Suggested reviewers'],
      weaknesses: ['GitLab only', 'Limited cross-repo context', 'Expensive for enterprise'],
      ourAdvantage: 'Platform agnostic, better cross-repo analysis',
    },
    {
      name: 'Sourcery AI',
      type: 'Code Review Bot',
      strengths: ['Real-time IDE feedback', 'Security scanning', 'Custom rules support'],
      weaknesses: ['Python/JavaScript focused', 'Limited team features', 'No notification routing'],
      ourAdvantage: 'Language agnostic, comprehensive team collaboration',
    },
  ];

  const marketTrends = isZh ? [
    {
      trend: 'AI 在开发中的采用',
      statistic: '84% 的开发者使用 AI 工具（2025 Stack Overflow 调查）',
      implication: 'AI 驱动的开发工具有强劲的市场需求',
    },
    {
      trend: '代码审查瓶颈',
      statistic: 'AI 工具可减少 40-50% 的手动审查时间',
      implication: '团队积极寻求加速审查的解决方案',
    },
    {
      trend: 'DORA 指标采用',
      statistic: '到 2027 年 50% 的组织将使用开发者生产力平台（Gartner）',
      implication: '工程智能平台需求不断增长',
    },
    {
      trend: '信息过载',
      statistic: '开发者平均查看 10+ 个仓库',
      implication: '需要智能信息聚合和过滤',
    },
  ] : [
    {
      trend: 'AI Adoption in Development',
      statistic: '84% of developers use AI tools (2025 Stack Overflow Survey)',
      implication: 'Strong market demand for AI-powered development tools',
    },
    {
      trend: 'Code Review Bottlenecks',
      statistic: '40-50% reduction in manual review time with AI tools',
      implication: 'Teams actively seeking solutions to accelerate reviews',
    },
    {
      trend: 'DORA Metrics Adoption',
      statistic: '50% of orgs will use developer productivity platforms by 2027 (Gartner)',
      implication: 'Growing demand for engineering intelligence platforms',
    },
    {
      trend: 'Information Overload',
      statistic: 'Developers check 10+ repositories on average',
      implication: 'Need for intelligent information aggregation and filtering',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">{isZh ? '市场调研' : 'Market Research'}</h2>
        <p className="text-muted-foreground">
          {isZh ? '竞争格局和市场趋势分析' : 'Competitive landscape and market trends analysis'}
        </p>
      </div>

      {/* Competitor Analysis */}
      <div className="space-y-4">
        <h3 className="text-xl font-medium">{isZh ? '竞争分析' : 'Competitive Analysis'}</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isZh ? '工具' : 'Tool'}</TableHead>
                <TableHead>{isZh ? '类型' : 'Type'}</TableHead>
                <TableHead>{isZh ? '优势' : 'Strengths'}</TableHead>
                <TableHead>{isZh ? '劣势' : 'Weaknesses'}</TableHead>
                <TableHead>{isZh ? '我们的优势' : 'Our Advantage'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {competitors.map((comp) => (
                <TableRow key={comp.name}>
                  <TableCell className="font-medium">{comp.name}</TableCell>
                  <TableCell>{comp.type}</TableCell>
                  <TableCell>
                    <ul className="space-y-1">
                      {comp.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-muted-foreground">• {s}</li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell>
                    <ul className="space-y-1">
                      {Array.isArray(comp.weaknesses) ? comp.weaknesses.map((w, i) => (
                        <li key={i} className="text-xs text-muted-foreground">• {w}</li>
                      )) : <li className="text-xs text-muted-foreground">• {comp.weaknesses}</li>}
                    </ul>
                  </TableCell>
                  <TableCell className="text-sm text-primary">{comp.ourAdvantage}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Market Trends */}
      <div className="space-y-4">
        <h3 className="text-xl font-medium">{isZh ? '市场趋势' : 'Market Trends'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {marketTrends.map((trend) => (
            <Card key={trend.trend}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{trend.trend}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm font-medium text-primary">{trend.statistic}</p>
                <p className="text-sm text-muted-foreground">{trend.implication}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Market Gap */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">{isZh ? '市场空白与机会' : 'Market Gap & Opportunity'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {isZh 
              ? '当前工具专注于开发工作流的孤立方面：'
              : 'Current tools focus on isolated aspects of the development workflow:'}
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span><strong>{isZh ? '代码审查工具：' : 'Code Review Tools:'}</strong> {isZh 
                ? '仅专注于 PR 分析，忽略项目健康和团队工作流的更广泛上下文'
                : 'Focus only on PR analysis, ignoring the broader context of project health and team workflows'}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span><strong>{isZh ? '分析平台：' : 'Analytics Platforms:'}</strong> {isZh 
                ? '提供指标但缺乏可操作的洞察和与日常工作流的集成'
                : 'Provide metrics but lack actionable insights and integration with daily workflows'}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span><strong>{isZh ? '通知工具：' : 'Notification Tools:'}</strong> {isZh 
                ? '聚合通知但不提供智能过滤和摘要'
                : 'Aggregate notifications but don\'t provide intelligent filtering and summarization'}</span>
            </li>
          </ul>
          <p className="text-sm font-medium mt-4">
            {isZh 
              ? 'Repo-Pulse 通过提供端到端解决方案填补这一空白，将智能监控、AI 分析、团队协作和可操作的洞察结合在一个平台中。'
              : 'Repo-Pulse fills this gap by providing an end-to-end solution that combines intelligent monitoring, AI analysis, team collaboration, and actionable insights in a single platform.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
