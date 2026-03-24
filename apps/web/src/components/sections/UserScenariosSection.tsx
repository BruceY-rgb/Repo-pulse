import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Users, 
  BarChart3,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface UserScenariosSectionProps {
  activeSubsection: string;
}

export function UserScenariosSection({ activeSubsection }: UserScenariosSectionProps) {
  const { language, t } = useLanguage();

  const renderContent = () => {
    switch (activeSubsection) {
      case 'personal-mode':
        return <PersonalModeContent language={language} />;
      case 'team-mode':
        return <TeamModeContent language={language} />;
      case 'manager-mode':
        return <ManagerModeContent language={language} />;
      default:
        return <ScenariosOverview language={language} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('scenarios.title')}</h1>
        <p className="text-muted-foreground">
          {t('scenarios.subtitle')}
        </p>
      </div>
      {renderContent()}
    </div>
  );
}

function ScenariosOverview({ language }: { language: string }) {
  const isZh = language === 'zh';
  const { t } = useLanguage();
  
  const scenarios = [
    {
      id: 'personal-mode',
      title: t('nav.personalMode') as string,
      icon: User,
      description: isZh ? '适合跟踪多个项目的个人开发者' : 'For individual developers tracking multiple projects',
      highlights: isZh ? ['快速设置', '自定义过滤', '每日摘要'] : ['Quick setup', 'Custom filters', 'Daily digest'],
    },
    {
      id: 'team-mode',
      title: t('nav.teamMode') as string,
      icon: Users,
      description: isZh ? '适合具有审查工作流的开发团队' : 'For development teams with review workflows',
      highlights: isZh ? ['审批工作流', '角色管理', '团队仪表板'] : ['Approval workflow', 'Role management', 'Team dashboard'],
    },
    {
      id: 'manager-mode',
      title: t('nav.managerMode') as string,
      icon: BarChart3,
      description: isZh ? '适合跟踪团队绩效的工程管理者' : 'For engineering managers tracking team performance',
      highlights: isZh ? ['DORA 指标', '自动报告', '趋势分析'] : ['DORA metrics', 'Auto reports', 'Trend analysis'],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        {scenarios.map((scenario) => (
          <Card key={scenario.id} className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <scenario.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{scenario.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{scenario.description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {scenario.highlights.map((highlight, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {highlight}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PersonalModeContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '个人模式' : 'Personal Mode'}</h2>
            <p className="text-muted-foreground">{isZh ? '适合个人开发者和开源爱好者' : 'For individual developers and open source enthusiasts'}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? '工作流程' : 'Workflow'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">1</div>
              <div>
                <p className="font-medium">{isZh ? '连接仓库' : 'Connect Repositories'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '链接 GitHub/GitLab 账户并选择要监控的仓库。可以是个人仓库或任何感兴趣的公共仓库。'
                    : 'Link GitHub/GitLab accounts and select repositories to monitor. Can be personal repos or any public repos of interest.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">2</div>
              <div>
                <p className="font-medium">{isZh ? '配置过滤器' : 'Configure Filters'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '设置关键词过滤器、噪音减少规则和通知偏好。专注于对你重要的事情。'
                    : 'Set up keyword filters, noise reduction rules, and notification preferences. Focus on what matters to you.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">3</div>
              <div>
                <p className="font-medium">{isZh ? '接收摘要' : 'Receive Summaries'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '通过邮件或每日摘要获取 AI 生成的变更摘要。不再有通知过载。'
                    : 'Get AI-generated summaries of changes via email or daily digest. No more notification overload.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">4</div>
              <div>
                <p className="font-medium">{isZh ? '探索仪表板' : 'Explore Dashboard'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '一目了然地查看项目活动、热门话题和仓库健康度。'
                    : 'Check project activity, trending topics, and repository health at a glance.'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '使用场景' : 'Use Cases'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '跟踪喜欢的开源项目' : 'Track favorite open source projects'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '监控依赖项的安全更新' : 'Monitor dependencies for security updates'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '及时了解框架变更' : 'Stay updated on framework changes'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '关注有趣的技术趋势' : 'Follow interesting technology trends'}</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '主要优势' : 'Key Benefits'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '每天在 GitHub 浏览上节省 30+ 分钟' : 'Save 30+ minutes daily on GitHub browsing'}</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '从不错过重要的安全更新' : 'Never miss important security updates'}</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '无需阅读所有代码即可理解变更' : 'Understand changes without reading all code'}</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '将通知噪音减少 80%' : 'Reduce notification noise by 80%'}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TeamModeContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '团队模式' : 'Team Mode'}</h2>
            <p className="text-muted-foreground">{isZh ? '适合具有协作工作流的开发团队' : 'For development teams with collaborative workflows'}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? '工作流程' : 'Workflow'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">1</div>
              <div>
                <p className="font-medium">{isZh ? '团队设置' : 'Team Setup'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '管理员创建团队，邀请成员，分配角色（管理员、审查者、开发者）。连接团队仓库。'
                    : 'Admin creates team, invites members, assigns roles (Admin, Reviewer, Developer). Connects team repositories.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">2</div>
              <div>
                <p className="font-medium">{isZh ? '配置工作流' : 'Configure Workflow'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '设置审批工作流、通知渠道（钉钉/飞书/Slack）和每个项目的过滤规则。'
                    : 'Set up approval workflow, notification channels (DingTalk/Feishu/Slack), and filtering rules per project.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">3</div>
              <div>
                <p className="font-medium">{isZh ? 'AI 分析与审查' : 'AI Analysis & Review'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? 'AI 生成摘要和风险评估。审查者在分发前批准、编辑或拒绝。'
                    : 'AI generates summaries and risk assessments. Reviewers approve, edit, or reject before distribution.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">4</div>
              <div>
                <p className="font-medium">{isZh ? '智能分发' : 'Smart Distribution'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '批准的内容根据优先级和团队偏好路由到适当的渠道。'
                    : 'Approved content is routed to appropriate channels based on priority and team preferences.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">5</div>
              <div>
                <p className="font-medium">{isZh ? '跟踪与改进' : 'Track & Improve'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '通过仪表板监控团队指标、审查周期时间和代码质量趋势。'
                    : 'Monitor team metrics, review cycle time, and code quality trends through dashboard.'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '团队角色' : 'Team Roles'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="default">{isZh ? '管理员' : 'Admin'}</Badge>
                <span className="text-sm text-muted-foreground">{isZh ? '完全控制，管理团队和设置' : 'Full control, manage team and settings'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{isZh ? '审查者' : 'Reviewer'}</Badge>
                <span className="text-sm text-muted-foreground">{isZh ? '审查和批准 AI 生成的内容' : 'Review and approve AI-generated content'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{isZh ? '开发者' : 'Developer'}</Badge>
                <span className="text-sm text-muted-foreground">{isZh ? '查看摘要和仪表板' : 'View summaries and dashboard'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '主要优势' : 'Key Benefits'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '将代码审查时间减少 40%' : 'Reduce code review time by 40%'}</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '早期捕获高风险变更' : 'Catch high-risk changes early'}</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '提高审查一致性' : 'Improve review consistency'}</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '集中团队沟通' : 'Centralize team communication'}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ManagerModeContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '管理者模式' : 'Manager Mode'}</h2>
            <p className="text-muted-foreground">{isZh ? '适合跟踪团队绩效的工程管理者' : 'For engineering managers tracking team performance'}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? '工作流程' : 'Workflow'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">1</div>
              <div>
                <p className="font-medium">{isZh ? '组织设置' : 'Organization Setup'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '创建组织，添加团队，配置访问权限。连接所有相关仓库。'
                    : 'Create organization, add teams, configure access permissions. Connect all relevant repositories.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">2</div>
              <div>
                <p className="font-medium">{isZh ? '配置指标' : 'Configure Metrics'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '设置 DORA 指标跟踪、自定义仪表板和自动报告生成计划。'
                    : 'Set up DORA metrics tracking, custom dashboards, and automated report generation schedules.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">3</div>
              <div>
                <p className="font-medium">{isZh ? '监控仪表板' : 'Monitor Dashboard'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '通过全面的仪表板跟踪团队生产力、代码质量趋势和项目健康度。'
                    : 'Track team productivity, code quality trends, and project health through comprehensive dashboards.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">4</div>
              <div>
                <p className="font-medium">{isZh ? '审查报告' : 'Review Reports'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '接收自动周报/月报。导出用于领导层演示和利益相关者更新。'
                    : 'Receive automated weekly/monthly reports. Export for leadership presentations and stakeholder updates.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">5</div>
              <div>
                <p className="font-medium">{isZh ? '识别改进点' : 'Identify Improvements'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '使用数据洞察识别瓶颈、优化流程并提高团队绩效。'
                    : 'Use data insights to identify bottlenecks, optimize processes, and improve team performance.'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '关键指标' : 'Key Metrics'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '部署频率' : 'Deployment frequency'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '变更前置时间' : 'Lead time for changes'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '变更失败率' : 'Change failure rate'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '恢复时间' : 'Time to recovery'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? 'PR 审查周期时间' : 'PR review cycle time'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                <span>{isZh ? '贡献者活动' : 'Contributor activity'}</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '主要优势' : 'Key Benefits'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '数据驱动的决策制定' : 'Data-driven decision making'}</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '客观的绩效跟踪' : 'Objective performance tracking'}</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '自动生成报告' : 'Automated report generation'}</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-primary mt-0.5" />
                <span>{isZh ? '早期识别问题' : 'Early identification of issues'}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
