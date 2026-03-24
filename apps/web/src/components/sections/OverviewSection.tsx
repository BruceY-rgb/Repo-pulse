import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Zap, 
  Brain, 
  Shield, 
  BarChart3, 
  Bell, 
  GitCompare,
  FileText,
  Radio,
  Filter,
  CheckCircle
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export function OverviewSection() {
  const { t } = useLanguage();

  const features = [
    {
      id: 'data-listening',
      title: t('nav.dataListening') as string,
      icon: Radio,
      description: t('overview.features.dataListening.desc') as string || 'Real-time repository monitoring with Webhook integration and async processing',
      highlights: ['GitHub/GitLab support', 'Redis queue buffering', 'Event standardization'],
    },
    {
      id: 'ai-analysis',
      title: t('nav.aiAnalysis') as string,
      icon: Brain,
      description: t('overview.features.aiAnalysis.desc') as string || 'Intelligent code analysis with summarization, risk assessment, and classification',
      highlights: ['PR/Issue summarization', 'Risk evaluation', 'Semantic classification'],
    },
    {
      id: 'filtering',
      title: t('nav.filtering') as string,
      icon: Filter,
      description: t('overview.features.filtering.desc') as string || 'Customizable content filtering and subscription management',
      highlights: ['Keyword filtering', 'Noise reduction', 'Smart subscription'],
    },
    {
      id: 'approval',
      title: t('nav.approval') as string,
      icon: CheckCircle,
      description: t('overview.features.approval.desc') as string || 'Team review and approval process for AI-generated content',
      highlights: ['Pending review queue', 'Edit & approve', 'Role-based access'],
    },
    {
      id: 'notification',
      title: t('nav.notification') as string,
      icon: Bell,
      description: t('overview.features.notification.desc') as string || 'Intelligent notification routing across multiple channels',
      highlights: ['Multi-channel support', 'Smart routing', 'Priority-based delivery'],
    },
    {
      id: 'dashboard',
      title: t('nav.dashboard') as string,
      icon: BarChart3,
      description: t('overview.features.dashboard.desc') as string || 'Visual insights into project health, team productivity, and trends',
      highlights: ['Activity metrics', 'Risk trends', 'DORA metrics'],
    },
    {
      id: 'reporting',
      title: t('nav.reporting') as string,
      icon: FileText,
      description: t('overview.features.reporting.desc') as string || 'Automated generation of weekly and monthly reports',
      highlights: ['Weekly summaries', 'Markdown/PDF export', 'Custom templates'],
    },
    {
      id: 'comparison',
      title: t('nav.comparison') as string,
      icon: GitCompare,
      description: t('overview.features.comparison.desc') as string || 'Compare activity, issues, and trends across multiple repositories',
      highlights: ['Multi-repo analysis', 'Trend comparison', 'Technology insights'],
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">v1.0 MVP</Badge>
          <Badge variant="outline" className="text-xs">Documentation</Badge>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          {t('overview.title')}
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          {t('overview.subtitle')}
        </p>
      </div>

      {/* What is Repo-Pulse */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">{t('overview.whatIs.title')}</h2>
        <p className="text-muted-foreground leading-relaxed">
          {t('overview.whatIs.description1')}
        </p>
        <p className="text-muted-foreground leading-relaxed">
          {t('overview.whatIs.description2')}
        </p>
      </div>

      {/* Core Value Proposition */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">{t('overview.value.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <Zap className="h-8 w-8 text-yellow-500 mb-2" />
              <CardTitle className="text-lg">{t('overview.value.reduce')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('overview.value.reduce.desc')}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <Brain className="h-8 w-8 text-blue-500 mb-2" />
              <CardTitle className="text-lg">{t('overview.value.intelligent')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('overview.value.intelligent.desc')}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <Shield className="h-8 w-8 text-green-500 mb-2" />
              <CardTitle className="text-lg">{t('overview.value.risk')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('overview.value.risk.desc')}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Key Features Overview */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">{t('overview.features.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature) => (
            <div key={feature.id} className="flex items-start gap-3 p-4 rounded-lg border bg-card">
              <feature.icon className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-medium">{feature.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Start */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">{t('overview.quickStart.title')}</h2>
        <div className="bg-muted rounded-lg p-4 space-y-3">
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
              <span>{t('overview.quickStart.step1')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
              <span>{t('overview.quickStart.step2')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
              <span>{t('overview.quickStart.step3')}</span>
            </li>
          </ol>
        </div>
      </div>

      {/* Target Users */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">{t('overview.users.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border">
            <h3 className="font-medium mb-2">{t('overview.users.individual')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('overview.users.individual.desc')}
            </p>
          </div>
          <div className="p-4 rounded-lg border">
            <h3 className="font-medium mb-2">{t('overview.users.team')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('overview.users.team.desc')}
            </p>
          </div>
          <div className="p-4 rounded-lg border">
            <h3 className="font-medium mb-2">{t('overview.users.manager')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('overview.users.manager.desc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
