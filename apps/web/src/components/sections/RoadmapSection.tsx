import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Circle, 
  Clock,
  Target
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export function RoadmapSection() {
  const { language, t } = useLanguage();
  const isZh = language === 'zh';

  const phases = [
    {
      phase: isZh ? '第一阶段：MVP' : 'Phase 1: MVP',
      status: 'planned',
      timeframe: 'Q2 2025',
      description: isZh ? '个人和小团队使用的核心功能' : 'Core functionality for personal and small team use',
      items: [
        { name: isZh ? 'GitHub/GitLab 集成' : 'GitHub/GitLab integration', status: 'planned' },
        { name: isZh ? '基础 AI 摘要' : 'Basic AI summarization', status: 'planned' },
        { name: isZh ? '邮件通知' : 'Email notifications', status: 'planned' },
        { name: isZh ? '简单仪表板' : 'Simple dashboard', status: 'planned' },
        { name: isZh ? '关键词过滤' : 'Keyword filtering', status: 'planned' },
      ],
    },
    {
      phase: isZh ? '第二阶段：团队功能' : 'Phase 2: Team Features',
      status: 'planned',
      timeframe: 'Q3 2025',
      description: isZh ? '增强的协作和工作流功能' : 'Enhanced collaboration and workflow features',
      items: [
        { name: isZh ? '审批工作流' : 'Approval workflow', status: 'planned' },
        { name: isZh ? '基于角色的访问控制' : 'Role-based access control', status: 'planned' },
        { name: isZh ? '钉钉/飞书集成' : 'DingTalk/Feishu integration', status: 'planned' },
        { name: isZh ? '高级分析' : 'Advanced analytics', status: 'planned' },
        { name: isZh ? '周报' : 'Weekly reports', status: 'planned' },
      ],
    },
    {
      phase: isZh ? '第三阶段：企业版' : 'Phase 3: Enterprise',
      status: 'planned',
      timeframe: 'Q4 2025',
      description: isZh ? '企业级功能和可扩展性' : 'Enterprise-grade features and scalability',
      items: [
        { name: isZh ? 'SSO/SAML 支持' : 'SSO/SAML support', status: 'planned' },
        { name: isZh ? '本地部署' : 'On-premise deployment', status: 'planned' },
        { name: isZh ? '高级 DORA 指标' : 'Advanced DORA metrics', status: 'planned' },
        { name: isZh ? '自定义 AI 模型' : 'Custom AI models', status: 'planned' },
        { name: isZh ? '审计日志' : 'Audit logs', status: 'planned' },
      ],
    },
    {
      phase: isZh ? '第四阶段：AI 增强' : 'Phase 4: AI Enhancement',
      status: 'planned',
      timeframe: 'Q1 2026',
      description: isZh ? '高级 AI 能力和自动化' : 'Advanced AI capabilities and automation',
      items: [
        { name: isZh ? '预测分析' : 'Predictive analytics', status: 'planned' },
        { name: isZh ? '自动修复建议' : 'Auto-fix suggestions', status: 'planned' },
        { name: isZh ? '自然语言查询' : 'Natural language queries', status: 'planned' },
        { name: isZh ? '智能推荐' : 'Smart recommendations', status: 'planned' },
        { name: isZh ? 'AI 驱动洞察' : 'AI-powered insights', status: 'planned' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('roadmap.title')}</h1>
        <p className="text-muted-foreground">
          {t('roadmap.subtitle')}
        </p>
      </div>

      <div className="space-y-6">
        {phases.map((phase) => (
          <Card key={phase.phase}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    phase.status === 'completed' 
                      ? 'bg-green-100' 
                      : phase.status === 'in-progress'
                      ? 'bg-blue-100'
                      : 'bg-muted'
                  }`}>
                    {phase.status === 'completed' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : phase.status === 'in-progress' ? (
                      <Clock className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{phase.phase}</CardTitle>
                    <p className="text-sm text-muted-foreground">{phase.description}</p>
                  </div>
                </div>
                <Badge variant={phase.status === 'completed' ? 'default' : 'secondary'}>
                  {phase.timeframe}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {phase.items.map((item) => (
                  <div 
                    key={item.name} 
                    className="flex items-center gap-2 p-2 rounded-md bg-muted"
                  >
                    {item.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={`text-sm ${item.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                      {item.name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{isZh ? '长期愿景' : 'Long-term Vision'}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {isZh 
              ? '我们的目标是成为软件开发团队的中央智能中心，提供 AI 驱动的洞察，帮助团队更快交付更好的代码，同时保持高质量和安全标准。'
              : 'Our goal is to become the central intelligence hub for software development teams, providing AI-powered insights that help teams ship better code faster while maintaining high quality and security standards.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">AI-Native</Badge>
            <Badge variant="secondary">{isZh ? '开发者优先' : 'Developer-First'}</Badge>
            <Badge variant="secondary">{isZh ? '企业就绪' : 'Enterprise-Ready'}</Badge>
            <Badge variant="secondary">{isZh ? '隐私优先' : 'Privacy-Focused'}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
