import { createContext, useContext, useState, type ReactNode } from 'react';

type Language = 'en' | 'zh';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Header
    'search.placeholder': 'Search documentation...',
    'search.short': 'Search...',
    
    // Navigation
    'nav.overview': 'Overview',
    'nav.requirements': 'Requirements Analysis',
    'nav.features': 'Core Features',
    'nav.architecture': 'Architecture',
    'nav.userScenarios': 'User Scenarios',
    'nav.roadmap': 'Roadmap',
    'nav.appendix': 'Appendix',
    
    // Sub-nav
    'nav.userPersonas': 'User Personas',
    'nav.painPoints': 'Pain Points',
    'nav.marketResearch': 'Market Research',
    'nav.dataListening': 'Data Listening',
    'nav.aiAnalysis': 'AI Analysis Engine',
    'nav.filtering': 'Filtering & Subscription',
    'nav.approval': 'Approval Workflow',
    'nav.notification': 'Smart Notification',
    'nav.dashboard': 'Dashboard & Analytics',
    'nav.reporting': 'Auto Reporting',
    'nav.comparison': 'Repo Comparison',
    'nav.systemDesign': 'System Design',
    'nav.techStack': 'Tech Stack',
    'nav.dataFlow': 'Data Flow',
    'nav.personalMode': 'Personal Mode',
    'nav.teamMode': 'Team Mode',
    'nav.managerMode': 'Manager Mode',
    'nav.glossary': 'Glossary',
    'nav.references': 'References',
    
    // Overview
    'overview.title': 'Repo-Pulse Documentation',
    'overview.subtitle': 'AI-Powered R&D Efficiency Platform — Transforming scattered repository information into structured, understandable, and actionable insights.',
    'overview.whatIs.title': 'What is Repo-Pulse?',
    'overview.whatIs.description1': 'Repo-Pulse is an AI-driven SaaS platform designed for software development teams. It listens to Git repository activities (Issues, Pull Requests, Commits), performs semantic analysis and risk assessment on the information, and presents it through visualization and intelligent notifications — helping developers and teams efficiently track project progress.',
    'overview.whatIs.description2': 'Unlike traditional code review tools, Repo-Pulse doesn\'t just analyze code quality. It transforms fragmented, redundant code information into structured, understandable, and decision-ready data, enabling teams to move from "reading code updates" to "understanding key information and making decisions."',
    'overview.value.title': 'Core Value Proposition',
    'overview.value.reduce': 'Reduce Information Overload',
    'overview.value.reduce.desc': 'AI automatically filters noise and highlights critical changes, reducing information processing costs by 70%.',
    'overview.value.intelligent': 'Intelligent Understanding',
    'overview.value.intelligent.desc': 'Semantic analysis of code changes, not just keyword matching. Understand the business meaning behind modifications.',
    'overview.value.risk': 'Risk Prevention',
    'overview.value.risk.desc': 'Automatically identify high-risk changes, security vulnerabilities, and potential issues before they reach production.',
    'overview.features.title': 'Key Features Overview',
    'overview.quickStart.title': 'Quick Start',
    'overview.quickStart.step1': 'Connect your GitHub or GitLab repositories',
    'overview.quickStart.step2': 'Configure AI analysis preferences and notification rules',
    'overview.quickStart.step3': 'Start receiving intelligent summaries and insights',
    'overview.users.title': 'Who is it for?',
    'overview.users.individual': 'Individual Developers',
    'overview.users.individual.desc': 'Track multiple open-source projects efficiently without being overwhelmed by notifications',
    'overview.users.team': 'Development Teams',
    'overview.users.team.desc': 'Improve code review efficiency and reduce risk with AI-assisted analysis',
    'overview.users.manager': 'Engineering Managers',
    'overview.users.manager.desc': 'Data-driven insights into team productivity, code quality trends, and project health',
    
    // Features
    'features.title': 'Core Features',
    'features.subtitle': 'Comprehensive feature set for intelligent R&D efficiency management',
    'features.overview.title': 'Features Overview',
    'features.checklist.title': 'Complete Feature Checklist',
    'features.checklist.subtitle': 'Detailed feature list for development reference',
    
    // Requirements
    'requirements.title': 'Requirements Analysis',
    'requirements.subtitle': 'Understanding user needs, pain points, and market landscape',
    'requirements.personas.title': 'User Personas',
    'requirements.painPoints.title': 'Pain Points Analysis',
    'requirements.market.title': 'Market Research',
    
    // Architecture
    'architecture.title': 'Architecture',
    'architecture.subtitle': 'System design, technology choices, and data flow',
    
    // User Scenarios
    'scenarios.title': 'User Scenarios',
    'scenarios.subtitle': 'How different users interact with Repo-Pulse',
    
    // Roadmap
    'roadmap.title': 'Roadmap',
    'roadmap.subtitle': 'Development timeline and future plans',
    
    // Appendix
    'appendix.title': 'Appendix',
    'appendix.subtitle': 'Additional resources and reference materials',
    
    // Common
    'common.readMore': 'Read More',
    'common.learnMore': 'Learn More',
    'common.getStarted': 'Get Started',
    'common.viewDetails': 'View Details',
    'common.comingSoon': 'Coming Soon',
    'common.inProgress': 'In Progress',
    'common.completed': 'Completed',
    'common.planned': 'Planned',
  },
  zh: {
    // Header
    'search.placeholder': '搜索文档...',
    'search.short': '搜索...',
    
    // Navigation
    'nav.overview': '概览',
    'nav.requirements': '需求分析',
    'nav.features': '核心功能',
    'nav.architecture': '架构设计',
    'nav.userScenarios': '用户场景',
    'nav.roadmap': '路线图',
    'nav.appendix': '附录',
    
    // Sub-nav
    'nav.userPersonas': '用户画像',
    'nav.painPoints': '痛点分析',
    'nav.marketResearch': '市场调研',
    'nav.dataListening': '数据监听',
    'nav.aiAnalysis': 'AI分析引擎',
    'nav.filtering': '过滤与订阅',
    'nav.approval': '审批工作流',
    'nav.notification': '智能通知',
    'nav.dashboard': '仪表板与分析',
    'nav.reporting': '自动报告',
    'nav.comparison': '仓库对比',
    'nav.systemDesign': '系统设计',
    'nav.techStack': '技术栈',
    'nav.dataFlow': '数据流',
    'nav.personalMode': '个人模式',
    'nav.teamMode': '团队模式',
    'nav.managerMode': '管理者模式',
    'nav.glossary': '术语表',
    'nav.references': '参考资料',
    
    // Overview
    'overview.title': 'Repo-Pulse 文档',
    'overview.subtitle': 'AI驱动的研发效能平台 — 将分散的仓库信息转化为结构化、可理解、可行动的洞察。',
    'overview.whatIs.title': '什么是 Repo-Pulse？',
    'overview.whatIs.description1': 'Repo-Pulse 是一个面向软件开发团队的AI驱动SaaS平台。它监听Git仓库活动（Issues、Pull Requests、Commits），对信息进行语义分析和风险评估，并通过可视化和智能通知呈现 — 帮助开发者和团队高效跟踪项目进展。',
    'overview.whatIs.description2': '与传统的代码审查工具不同，Repo-Pulse不仅仅分析代码质量。它将碎片化、冗余的代码信息转化为结构化、可理解、可决策的数据，使团队从"阅读代码更新"转变为"理解关键信息并做出决策"。',
    'overview.value.title': '核心价值主张',
    'overview.value.reduce': '减少信息过载',
    'overview.value.reduce.desc': 'AI自动过滤噪音并突出关键变更，将信息处理成本降低70%。',
    'overview.value.intelligent': '智能理解',
    'overview.value.intelligent.desc': '对代码变更进行语义分析，而不仅仅是关键词匹配。理解修改背后的业务含义。',
    'overview.value.risk': '风险预防',
    'overview.value.risk.desc': '在问题进入生产环境之前，自动识别高风险变更、安全漏洞和潜在问题。',
    'overview.features.title': '核心功能概览',
    'overview.quickStart.title': '快速开始',
    'overview.quickStart.step1': '连接您的GitHub或GitLab仓库',
    'overview.quickStart.step2': '配置AI分析偏好和通知规则',
    'overview.quickStart.step3': '开始接收智能摘要和洞察',
    'overview.users.title': '适用人群',
    'overview.users.individual': '个人开发者',
    'overview.users.individual.desc': '高效跟踪多个开源项目，不被通知淹没',
    'overview.users.team': '开发团队',
    'overview.users.team.desc': '通过AI辅助分析提高代码审查效率，降低风险',
    'overview.users.manager': '工程管理者',
    'overview.users.manager.desc': '数据驱动的团队生产力、代码质量趋势和项目健康度洞察',
    
    // Features
    'features.title': '核心功能',
    'features.subtitle': '智能研发效能管理的完整功能集',
    'features.overview.title': '功能概览',
    'features.checklist.title': '完整功能清单',
    'features.checklist.subtitle': '供开发人员参考的详细功能列表',
    
    // Requirements
    'requirements.title': '需求分析',
    'requirements.subtitle': '理解用户需求、痛点和市场格局',
    'requirements.personas.title': '用户画像',
    'requirements.painPoints.title': '痛点分析',
    'requirements.market.title': '市场调研',
    
    // Architecture
    'architecture.title': '架构设计',
    'architecture.subtitle': '系统设计、技术选择和数据流',
    
    // User Scenarios
    'scenarios.title': '用户场景',
    'scenarios.subtitle': '不同用户如何与Repo-Pulse交互',
    
    // Roadmap
    'roadmap.title': '路线图',
    'roadmap.subtitle': '开发时间表和未来计划',
    
    // Appendix
    'appendix.title': '附录',
    'appendix.subtitle': '附加资源和参考资料',
    
    // Common
    'common.readMore': '阅读更多',
    'common.learnMore': '了解更多',
    'common.getStarted': '开始使用',
    'common.viewDetails': '查看详情',
    'common.comingSoon': '即将推出',
    'common.inProgress': '进行中',
    'common.completed': '已完成',
    'common.planned': '计划中',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('zh');

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
