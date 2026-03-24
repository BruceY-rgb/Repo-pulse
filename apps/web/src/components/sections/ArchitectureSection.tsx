import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Server, 
  Database, 
  Cpu, 
  Layers,
  ArrowRight
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ArchitectureSectionProps {
  activeSubsection: string;
}

export function ArchitectureSection({ activeSubsection }: ArchitectureSectionProps) {
  const { language, t } = useLanguage();

  const renderContent = () => {
    switch (activeSubsection) {
      case 'system-design':
        return <SystemDesignContent language={language} />;
      case 'tech-stack':
        return <TechStackContent language={language} />;
      case 'data-flow':
        return <DataFlowContent language={language} />;
      default:
        return <SystemDesignContent language={language} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('architecture.title')}</h1>
        <p className="text-muted-foreground">
          {t('architecture.subtitle')}
        </p>
      </div>
      {renderContent()}
    </div>
  );
}

function SystemDesignContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '系统设计' : 'System Design'}</h2>
            <p className="text-muted-foreground">{isZh ? '高级架构概述' : 'High-level architecture overview'}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? '架构图' : 'Architecture Diagram'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-6 rounded-lg font-mono text-sm space-y-4">
            {/* External Services */}
            <div className="flex justify-center gap-4">
              <div className="px-4 py-2 bg-blue-100 border border-blue-300 rounded text-center">
                <p className="font-semibold text-blue-800">GitHub/GitLab</p>
              </div>
            </div>
            
            <div className="flex justify-center">
              <ArrowRight className="rotate-90 text-muted-foreground" />
            </div>
            
            {/* API Gateway */}
            <div className="flex justify-center">
              <div className="px-6 py-3 bg-purple-100 border border-purple-300 rounded text-center">
                <p className="font-semibold text-purple-800">API Gateway</p>
                <p className="text-xs text-purple-600">{isZh ? '认证与限流' : 'Auth & Rate Limiting'}</p>
              </div>
            </div>
            
            <div className="flex justify-center">
              <ArrowRight className="rotate-90 text-muted-foreground" />
            </div>
            
            {/* Event Parser */}
            <div className="flex justify-center">
              <div className="px-6 py-3 bg-yellow-100 border border-yellow-300 rounded text-center">
                <p className="font-semibold text-yellow-800">Event Parser</p>
                <p className="text-xs text-yellow-600">{isZh ? '标准化' : 'Standardization'}</p>
              </div>
            </div>
            
            <div className="flex justify-center">
              <ArrowRight className="rotate-90 text-muted-foreground" />
            </div>
            
            {/* Message Queue */}
            <div className="flex justify-center">
              <div className="px-6 py-3 bg-red-100 border border-red-300 rounded text-center">
                <p className="font-semibold text-red-800">Redis Queue</p>
                <p className="text-xs text-red-600">{isZh ? '异步处理' : 'Async Processing'}</p>
              </div>
            </div>
            
            <div className="flex justify-center">
              <ArrowRight className="rotate-90 text-muted-foreground" />
            </div>
            
            {/* Workers */}
            <div className="flex justify-center gap-4">
              <div className="px-4 py-2 bg-green-100 border border-green-300 rounded text-center">
                <p className="font-semibold text-green-800">Worker 1</p>
              </div>
              <div className="px-4 py-2 bg-green-100 border border-green-300 rounded text-center">
                <p className="font-semibold text-green-800">Worker 2</p>
              </div>
              <div className="px-4 py-2 bg-green-100 border border-green-300 rounded text-center">
                <p className="font-semibold text-green-800">Worker N</p>
              </div>
            </div>
            
            <div className="flex justify-center">
              <ArrowRight className="rotate-90 text-muted-foreground" />
            </div>
            
            {/* AI Engine */}
            <div className="flex justify-center">
              <div className="px-6 py-3 bg-indigo-100 border border-indigo-300 rounded text-center">
                <p className="font-semibold text-indigo-800">AI Engine</p>
                <p className="text-xs text-indigo-600">{isZh ? 'LLM 分析' : 'LLM Analysis'}</p>
              </div>
            </div>
            
            <div className="flex justify-center">
              <ArrowRight className="rotate-90 text-muted-foreground" />
            </div>
            
            {/* Database & Storage */}
            <div className="flex justify-center gap-4">
              <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded text-center">
                <p className="font-semibold text-gray-800">MySQL</p>
                <p className="text-xs text-gray-600">{isZh ? '主数据' : 'Primary Data'}</p>
              </div>
              <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded text-center">
                <p className="font-semibold text-gray-800">Redis</p>
                <p className="text-xs text-gray-600">{isZh ? '缓存' : 'Cache'}</p>
              </div>
            </div>
            
            <div className="flex justify-center">
              <ArrowRight className="rotate-90 text-muted-foreground" />
            </div>
            
            {/* Frontend */}
            <div className="flex justify-center gap-4">
              <div className="px-4 py-2 bg-cyan-100 border border-cyan-300 rounded text-center">
                <p className="font-semibold text-cyan-800">{isZh ? 'Web 仪表板' : 'Web Dashboard'}</p>
              </div>
              <div className="px-4 py-2 bg-cyan-100 border border-cyan-300 rounded text-center">
                <p className="font-semibold text-cyan-800">{isZh ? '通知' : 'Notifications'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">{isZh ? '事件驱动' : 'Event-Driven'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {isZh ? '基于 Webhook 的事件摄取，支持异步处理以实现可扩展性' : 'Webhook-based event ingestion with async processing for scalability'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-green-500" />
              <CardTitle className="text-lg">{isZh ? '解耦' : 'Decoupled'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {isZh ? '消息队列将事件摄取与 AI 处理解耦' : 'Message queue decouples event ingestion from AI processing'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-lg">{isZh ? '可扩展' : 'Extensible'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {isZh ? '插件架构支持多种 AI 模型和通知渠道' : 'Plugin architecture supports multiple AI models and notification channels'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TechStackContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  
  const techStack = [
    {
      layer: isZh ? '前端' : 'Frontend',
      technologies: [
        { name: 'React 18', purpose: isZh ? 'UI 框架' : 'UI Framework' },
        { name: 'TypeScript', purpose: isZh ? '类型安全' : 'Type Safety' },
        { name: 'Tailwind CSS', purpose: isZh ? '样式' : 'Styling' },
        { name: 'shadcn/ui', purpose: isZh ? '组件库' : 'Component Library' },
        { name: 'ECharts', purpose: isZh ? '数据可视化' : 'Data Visualization' },
      ],
    },
    {
      layer: isZh ? '后端' : 'Backend',
      technologies: [
        { name: 'Spring Boot', purpose: isZh ? '主框架' : 'Main Framework' },
        { name: 'Java 21', purpose: isZh ? '编程语言' : 'Programming Language' },
        { name: 'WebFlux', purpose: isZh ? '响应式编程' : 'Reactive Programming' },
        { name: 'JWT', purpose: isZh ? '认证' : 'Authentication' },
      ],
    },
    {
      layer: isZh ? 'AI 服务' : 'AI Service',
      technologies: [
        { name: 'Python', purpose: isZh ? 'AI 处理' : 'AI Processing' },
        { name: 'FastAPI', purpose: isZh ? 'API 框架' : 'API Framework' },
        { name: 'LangChain', purpose: isZh ? 'LLM 编排' : 'LLM Orchestration' },
        { name: 'OpenAI/Claude', purpose: isZh ? 'LLM 提供商' : 'LLM Providers' },
      ],
    },
    {
      layer: isZh ? '数据' : 'Data',
      technologies: [
        { name: 'MySQL 8.0', purpose: isZh ? '主数据库' : 'Primary Database' },
        { name: 'Redis', purpose: isZh ? '缓存与队列' : 'Cache & Queue' },
        { name: 'Elasticsearch', purpose: isZh ? '搜索与分析' : 'Search & Analytics' },
      ],
    },
    {
      layer: isZh ? '基础设施' : 'Infrastructure',
      technologies: [
        { name: 'Docker', purpose: isZh ? '容器化' : 'Containerization' },
        { name: 'Kubernetes', purpose: isZh ? '编排' : 'Orchestration' },
        { name: 'Nginx', purpose: isZh ? '反向代理' : 'Reverse Proxy' },
        { name: 'Prometheus', purpose: isZh ? '监控' : 'Monitoring' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '技术栈' : 'Technology Stack'}</h2>
            <p className="text-muted-foreground">{isZh ? '技术选择和理由' : 'Technology choices and rationale'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {techStack.map((layer) => (
          <Card key={layer.layer}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{layer.layer}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {layer.technologies.map((tech) => (
                  <div key={tech.name} className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                    <span className="font-medium text-sm">{tech.name}</span>
                    <Badge variant="secondary" className="text-xs">{tech.purpose}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">{isZh ? '技术选择理由' : 'Technology Rationale'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="font-medium">{isZh ? '为什么选择 Spring Boot？' : 'Why Spring Boot?'}</p>
            <p className="text-sm text-muted-foreground">
              {isZh 
                ? '成熟的生态系统，非常适合企业应用，强大的社区支持，与云原生技术无缝集成。'
                : 'Mature ecosystem, excellent for enterprise applications, strong community support, and seamless integration with cloud-native technologies.'}
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">{isZh ? '为什么选择 React + TypeScript？' : 'Why React + TypeScript?'}</p>
            <p className="text-sm text-muted-foreground">
              {isZh 
                ? '基于组件的架构支持可复用的 UI 元素。TypeScript 为大型应用提供类型安全和更好的开发者体验。'
                : 'Component-based architecture enables reusable UI elements. TypeScript provides type safety and better developer experience for large applications.'}
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium">{isZh ? '为什么选择 Redis？' : 'Why Redis?'}</p>
            <p className="text-sm text-muted-foreground">
              {isZh 
                ? '内存数据存储提供快速缓存和消息队列能力，对异步处理和速率限制至关重要。'
                : 'In-memory data store provides fast caching and message queue capabilities, essential for async processing and rate limiting.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DataFlowContent({ language }: { language: string }) {
  const isZh = language === 'zh';
  
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{isZh ? '数据流' : 'Data Flow'}</h2>
            <p className="text-muted-foreground">{isZh ? '数据如何在系统中流动' : 'How data moves through the system'}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? '事件处理流程' : 'Event Processing Flow'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">1</div>
              <div>
                <p className="font-medium">{isZh ? '事件摄取' : 'Event Ingestion'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? 'GitHub/GitLab 发送 webhook 负载到 API Gateway。Gateway 验证签名、检查速率限制并转发到 Event Parser。'
                    : 'GitHub/GitLab sends webhook payload to API Gateway. Gateway validates signature, checks rate limits, and forwards to Event Parser.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">2</div>
              <div>
                <p className="font-medium">{isZh ? '事件标准化' : 'Event Standardization'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? 'Event Parser 将不同平台格式规范化为统一的内部模式。提取元数据、作者信息和变更摘要。'
                    : 'Event Parser normalizes different platform formats into unified internal schema. Extracts metadata, author info, and change summary.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">3</div>
              <div>
                <p className="font-medium">{isZh ? '队列缓冲' : 'Queue Buffering'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '标准化事件被推送到 Redis 队列。在流量高峰期间提供缓冲，并为失败处理启用重试逻辑。'
                    : 'Standardized events are pushed to Redis queue. Provides buffering during traffic spikes and enables retry logic for failed processing.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">4</div>
              <div>
                <p className="font-medium">{isZh ? 'Worker 处理' : 'Worker Processing'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? 'Worker 池从队列消费事件。从 Git 平台获取额外上下文（diff、评论）。为 AI 分析准备数据。'
                    : 'Worker pool consumes events from queue. Fetches additional context (diff, comments) from Git platform. Prepares data for AI analysis.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">5</div>
              <div>
                <p className="font-medium">{isZh ? 'AI 分析' : 'AI Analysis'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? 'AI 引擎执行语义分析：摘要、风险评估、分类。结果与原始事件一起存储在数据库中。'
                    : 'AI Engine performs semantic analysis: summarization, risk assessment, classification. Results stored in database with original event.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">6</div>
              <div>
                <p className="font-medium">{isZh ? '分发' : 'Distribution'}</p>
                <p className="text-sm text-muted-foreground">
                  {isZh 
                    ? '基于过滤规则和用户偏好，通知被路由到适当的渠道。仪表板实时更新。'
                    : 'Based on filtering rules and user preferences, notifications are routed to appropriate channels. Dashboard updated in real-time.'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '数据保留' : 'Data Retention'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '原始事件：90 天' : 'Raw events: 90 days'}</li>
              <li>• {isZh ? 'AI 分析结果：1 年' : 'AI analysis results: 1 year'}</li>
              <li>• {isZh ? '聚合指标：永久' : 'Aggregated metrics: Indefinite'}</li>
              <li>• {isZh ? '用户活动日志：180 天' : 'User activity logs: 180 days'}</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isZh ? '隐私与安全' : 'Privacy & Security'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• {isZh ? '代码永不永久存储' : 'Code never stored permanently'}</li>
              <li>• {isZh ? '敏感数据脱敏' : 'Sensitive data redaction'}</li>
              <li>• {isZh ? '静态和传输加密' : 'Encryption at rest and in transit'}</li>
              <li>• {isZh ? 'SOC 2 合规准备' : 'SOC 2 compliance ready'}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
