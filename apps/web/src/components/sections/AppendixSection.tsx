import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BookOpen, 
  Link as LinkIcon,
  ExternalLink
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface AppendixSectionProps {
  activeSubsection: string;
}

export function AppendixSection({ activeSubsection }: AppendixSectionProps) {
  const { language, t } = useLanguage();

  const renderContent = () => {
    switch (activeSubsection) {
      case 'glossary':
        return <GlossaryContent language={language} />;
      case 'references':
        return <ReferencesContent language={language} />;
      default:
        return <GlossaryContent language={language} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('appendix.title')}</h1>
        <p className="text-muted-foreground">
          {t('appendix.subtitle')}
        </p>
      </div>
      {renderContent()}
    </div>
  );
}

function GlossaryContent({ language }: { language: string }) {
  const { t } = useLanguage();
  const isZh = language === 'zh';
  
  const terms = isZh ? [
    {
      term: 'DORA 指标',
      definition: 'DevOps 研究与评估指标：部署频率、变更前置时间、变更失败率和恢复时间。衡量软件交付绩效的行业标准指标。',
    },
    {
      term: 'Webhook',
      definition: '当源系统中发生某些事情时的 HTTP 回调。GitHub/GitLab 使用 webhook 通知外部系统仓库事件。',
    },
    {
      term: 'Diff',
      definition: '显示代码两个版本之间差异的文件比较。显示添加、删除或修改的行。',
    },
    {
      term: 'LLM',
      definition: '大语言模型。在大量文本数据上训练的 AI 模型，可以理解和生成类似人类的文本。示例包括 GPT-4 和 Claude。',
    },
    {
      term: '语义分析',
      definition: '理解代码变更的含义和上下文，超越简单的模式匹配。包括识别业务逻辑、风险因素和影响。',
    },
    {
      term: 'PR (Pull Request)',
      definition: '向项目提交贡献的方法。开发者创建 PR 来提议变更，然后在合并前进行审查。',
    },
    {
      term: 'Issue',
      definition: 'Git 平台中的工作单位或问题跟踪。可以代表 bug、功能请求或任务。',
    },
    {
      term: 'Commit',
      definition: '带有描述性消息的代码库变更快照。版本控制的基本单位。',
    },
    {
      term: '异步处理',
      definition: '在后台处理任务而不阻塞主应用流程。使用消息队列将事件摄取与处理解耦。',
    },
    {
      term: '风险评估',
      definition: '评估与代码变更相关的潜在影响和问题可能性。考虑安全、稳定性和范围等因素。',
    },
    {
      term: 'SaaS',
      definition: '软件即服务。基于云的软件交付模式，应用程序由供应商/提供商托管并通过互联网提供给客户。',
    },
    {
      term: 'RBAC',
      definition: '基于角色的访问控制。一种根据组织内个人用户的角色限制访问的方法。',
    },
  ] : [
    {
      term: 'DORA Metrics',
      definition: 'DevOps Research and Assessment metrics: Deployment Frequency, Lead Time for Changes, Change Failure Rate, and Time to Recovery. Industry-standard metrics for measuring software delivery performance.',
    },
    {
      term: 'Webhook',
      definition: 'An HTTP callback that occurs when something happens in the source system. GitHub/GitLab use webhooks to notify external systems about repository events.',
    },
    {
      term: 'Diff',
      definition: 'A file comparison showing the differences between two versions of code. Shows lines added, removed, or modified.',
    },
    {
      term: 'LLM',
      definition: 'Large Language Model. AI models trained on vast amounts of text data that can understand and generate human-like text. Examples include GPT-4 and Claude.',
    },
    {
      term: 'Semantic Analysis',
      definition: 'Understanding the meaning and context of code changes beyond simple pattern matching. Includes identifying business logic, risk factors, and impact.',
    },
    {
      term: 'PR (Pull Request)',
      definition: 'A method of submitting contributions to a project. Developers create a PR to propose changes, which are then reviewed before merging.',
    },
    {
      term: 'Issue',
      definition: 'A unit of work or problem tracking in Git platforms. Can represent bugs, feature requests, or tasks.',
    },
    {
      term: 'Commit',
      definition: 'A snapshot of changes to the codebase with a descriptive message. The fundamental unit of version control.',
    },
    {
      term: 'Async Processing',
      definition: 'Handling tasks in the background without blocking the main application flow. Uses message queues to decouple event ingestion from processing.',
    },
    {
      term: 'Risk Assessment',
      definition: 'Evaluating the potential impact and likelihood of problems associated with code changes. Considers factors like security, stability, and scope.',
    },
    {
      term: 'SaaS',
      definition: 'Software as a Service. Cloud-based software delivery model where applications are hosted by the vendor/provider and made available to customers over the internet.',
    },
    {
      term: 'RBAC',
      definition: 'Role-Based Access Control. A method of restricting access based on the roles of individual users within an organization.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{t('nav.glossary')}</h2>
            <p className="text-muted-foreground">{isZh ? '关键术语和定义' : 'Key terms and definitions'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {terms.map((item) => (
          <Card key={item.term}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{item.term}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.definition}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ReferencesContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  const { t } = useLanguage();
  
  const references = [
    {
      category: isZh ? 'AI 代码审查工具' : 'AI Code Review Tools',
      links: [
        { name: 'GitHub Copilot', url: 'https://github.com/features/copilot', description: isZh ? 'AI 结对程序员' : 'AI pair programmer' },
        { name: 'CodeRabbit', url: 'https://coderabbit.ai', description: isZh ? 'AI 驱动的 PR 审查' : 'AI-powered PR reviews' },
        { name: 'GitLab Duo', url: 'https://about.gitlab.com/duo/', description: isZh ? 'AI 辅助 DevSecOps' : 'AI-assisted DevSecOps' },
        { name: 'Sourcery AI', url: 'https://sourcery.ai', description: isZh ? '自动化代码审查' : 'Automated code review' },
      ],
    },
    {
      category: isZh ? '开发者生产力' : 'Developer Productivity',
      links: [
        { name: 'DORA Research', url: 'https://dora.dev', description: isZh ? 'DevOps 研究与评估' : 'DevOps Research and Assessment' },
        { name: 'SPACE Framework', url: 'https://queue.acm.org/detail.cfm?id=3454124', description: isZh ? '开发者生产力框架' : 'Developer productivity framework' },
        { name: 'Faros AI', url: 'https://www.faros.ai', description: isZh ? '工程智能平台' : 'Engineering intelligence platform' },
        { name: 'Waydev', url: 'https://waydev.co', description: isZh ? '软件工程智能' : 'Software engineering intelligence' },
      ],
    },
    {
      category: isZh ? '开发平台' : 'Development Platforms',
      links: [
        { name: 'GitHub', url: 'https://github.com', description: isZh ? '代码托管平台' : 'Code hosting platform' },
        { name: 'GitLab', url: 'https://gitlab.com', description: isZh ? 'DevOps 平台' : 'DevOps platform' },
        { name: 'Graphite', url: 'https://graphite.dev', description: isZh ? '堆叠 PR 和代码审查' : 'Stacked PRs and code review' },
      ],
    },
    {
      category: isZh ? '技术资源' : 'Technical Resources',
      links: [
        { name: 'React', url: 'https://react.dev', description: isZh ? 'UI 库' : 'UI library' },
        { name: 'Spring Boot', url: 'https://spring.io/projects/spring-boot', description: isZh ? 'Java 框架' : 'Java framework' },
        { name: 'Tailwind CSS', url: 'https://tailwindcss.com', description: isZh ? 'CSS 框架' : 'CSS framework' },
        { name: 'shadcn/ui', url: 'https://ui.shadcn.com', description: isZh ? 'UI 组件库' : 'UI component library' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <LinkIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{t('nav.references')}</h2>
            <p className="text-muted-foreground">{isZh ? '外部资源和相关工具' : 'External resources and related tools'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {references.map((category) => (
          <Card key={category.category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{category.category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {category.links.map((link) => (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{link.name}</p>
                      <p className="text-xs text-muted-foreground">{link.description}</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">{isZh ? '市场调研来源' : 'Market Research Sources'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {isZh 
              ? '本文档基于广泛的市场调研编制，包括：'
              : 'This documentation was compiled based on extensive market research including:'}
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• 2025 Stack Overflow {isZh ? '开发者调查' : 'Developer Survey'}</li>
            <li>• Gartner {isZh ? '软件工程智能平台市场指南' : 'Market Guide to Software Engineering Intelligence Platforms'}</li>
            <li>• DORA {isZh ? 'DevOps 状态报告 2024' : 'State of DevOps Report 2024'}</li>
            <li>• {isZh ? 'AI 代码审查工具行业分析' : 'Industry analysis of AI code review tools'}</li>
            <li>• 15+ {isZh ? '开发者生产力平台的竞争分析' : 'competitive analysis of developer productivity platforms'}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
