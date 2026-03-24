import { useState } from 'react';
import { 
  Brain, 
  GitPullRequest, 
  Shield, 
  AlertTriangle,
  CheckCircle,
  Code,
  FileText,
  Zap,
  ChevronDown,
  ChevronRight,
  Copy,
  ThumbsUp,
  ThumbsDown,
  MessageSquare
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const prAnalysis = {
  id: 1,
  title: 'Fix authentication vulnerability in login flow',
  number: 234,
  repo: 'frontend-dashboard',
  author: 'Alice Chen',
  avatar: 'AC',
  createdAt: '2 hours ago',
  status: 'open',
  riskLevel: 'high',
  summary: 'This PR addresses a critical authentication vulnerability in the login flow by implementing proper JWT token validation and adding rate limiting to prevent brute force attacks.',
  changes: {
    files: 5,
    additions: 127,
    deletions: 43,
  },
  analysis: {
    security: [
      { type: 'critical', message: 'JWT secret key exposed in environment variables', line: 23 },
      { type: 'warning', message: 'Missing input validation on password field', line: 45 },
    ],
    performance: [
      { type: 'info', message: 'Database query could be optimized with indexing', line: 67 },
    ],
    codeQuality: [
      { type: 'suggestion', message: 'Consider extracting validation logic to a separate function', line: 89 },
    ],
  },
  codeDiff: `@@ -20,7 +20,12 @@ export async function login(credentials) {
-  const token = jwt.sign(user, process.env.JWT_SECRET);
+  const token = jwt.sign(
+    { id: user.id, email: user.email },
+    process.env.JWT_SECRET,
+    { expiresIn: '1h', algorithm: 'HS256' }
+  );
   
+  // Add rate limiting
+  await rateLimiter.consume(user.id);
   return { token, user };`,
};

const recentAnalyses = [
  { id: 1, title: 'Add user authentication middleware', repo: 'backend-api', risk: 'medium', time: '1 hour ago' },
  { id: 2, title: 'Update database schema for new features', repo: 'frontend-dashboard', risk: 'low', time: '3 hours ago' },
  { id: 3, title: 'Fix memory leak in WebSocket handler', repo: 'backend-api', risk: 'high', time: '5 hours ago' },
  { id: 4, title: 'Refactor API response formatting', repo: 'backend-api', risk: 'low', time: '1 day ago' },
];

export function AIAnalysis() {
  const [expandedSection, setExpandedSection] = useState<string | null>('security');
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(prAnalysis.codeDiff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'high':
        return <AlertTriangle className="w-5 h-5 text-red-400" />;
      case 'medium':
        return <Shield className="w-5 h-5 text-yellow-400" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-400" />;
    }
  };

  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'warning':
        return <Shield className="w-4 h-4 text-yellow-400" />;
      case 'info':
        return <Zap className="w-4 h-4 text-blue-400" />;
      default:
        return <MessageSquare className="w-4 h-4 text-[var(--github-text-secondary)]" />;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Analysis</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
            Intelligent code review and risk assessment
          </p>
        </div>
        <Button className="btn-x-primary gap-2">
          <Brain className="w-4 h-4" />
          Analyze New PR
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Analysis */}
        <div className="lg:col-span-2 space-y-4">
          {/* PR Header */}
          <Card className="card-github">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <GitPullRequest className="w-5 h-5 text-green-400" />
                    <span className="text-sm text-[var(--github-text-secondary)]">
                      {prAnalysis.repo} #{prAnalysis.number}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-3">
                    {prAnalysis.title}
                  </h2>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs bg-[var(--github-accent)] text-white">
                          {prAnalysis.avatar}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-white">{prAnalysis.author}</span>
                    </div>
                    <span className="text-sm text-[var(--github-text-secondary)]">
                      {prAnalysis.createdAt}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getRiskIcon(prAnalysis.riskLevel)}
                  <span className={`text-sm font-medium capitalize ${
                    prAnalysis.riskLevel === 'high' ? 'text-red-400' :
                    prAnalysis.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {prAnalysis.riskLevel} Risk
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Summary */}
          <Card className="card-github border-[var(--github-accent)]/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-[var(--github-accent)]" />
                AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[var(--github-text)] leading-relaxed">
                {prAnalysis.summary}
              </p>
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--github-border)]">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--github-text-secondary)]" />
                  <span className="text-sm text-[var(--github-text-secondary)]">
                    {prAnalysis.changes.files} files changed
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-green-400">+{prAnalysis.changes.additions}</span>
                  <span className="text-sm text-red-400">-{prAnalysis.changes.deletions}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Analysis */}
          <Card className="card-github">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white">
                Detailed Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Security */}
              <div className="border border-[var(--github-border)] rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedSection(expandedSection === 'security' ? null : 'security')}
                  className="w-full flex items-center justify-between p-4 bg-[var(--github-surface)] hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-red-400" />
                    <span className="font-medium text-white">Security Issues</span>
                    <Badge className="bg-red-400/20 text-red-400">
                      {prAnalysis.analysis.security.length}
                    </Badge>
                  </div>
                  {expandedSection === 'security' ? (
                    <ChevronDown className="w-5 h-5 text-[var(--github-text-secondary)]" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-[var(--github-text-secondary)]" />
                  )}
                </button>
                {expandedSection === 'security' && (
                  <div className="p-4 space-y-3">
                    {prAnalysis.analysis.security.map((issue, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-400/5 border border-red-400/20">
                        {getIssueIcon(issue.type)}
                        <div className="flex-1">
                          <p className="text-sm text-white">{issue.message}</p>
                          <p className="text-xs text-[var(--github-text-secondary)] mt-1">
                            Line {issue.line}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Performance */}
              <div className="border border-[var(--github-border)] rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedSection(expandedSection === 'performance' ? null : 'performance')}
                  className="w-full flex items-center justify-between p-4 bg-[var(--github-surface)] hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-blue-400" />
                    <span className="font-medium text-white">Performance</span>
                    <Badge className="bg-blue-400/20 text-blue-400">
                      {prAnalysis.analysis.performance.length}
                    </Badge>
                  </div>
                  {expandedSection === 'performance' ? (
                    <ChevronDown className="w-5 h-5 text-[var(--github-text-secondary)]" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-[var(--github-text-secondary)]" />
                  )}
                </button>
                {expandedSection === 'performance' && (
                  <div className="p-4 space-y-3">
                    {prAnalysis.analysis.performance.map((issue, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-blue-400/5 border border-blue-400/20">
                        {getIssueIcon(issue.type)}
                        <div className="flex-1">
                          <p className="text-sm text-white">{issue.message}</p>
                          <p className="text-xs text-[var(--github-text-secondary)] mt-1">
                            Line {issue.line}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Code Quality */}
              <div className="border border-[var(--github-border)] rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedSection(expandedSection === 'quality' ? null : 'quality')}
                  className="w-full flex items-center justify-between p-4 bg-[var(--github-surface)] hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Code className="w-5 h-5 text-[var(--github-text-secondary)]" />
                    <span className="font-medium text-white">Code Quality</span>
                    <Badge className="bg-[var(--github-border)] text-[var(--github-text-secondary)]">
                      {prAnalysis.analysis.codeQuality.length}
                    </Badge>
                  </div>
                  {expandedSection === 'quality' ? (
                    <ChevronDown className="w-5 h-5 text-[var(--github-text-secondary)]" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-[var(--github-text-secondary)]" />
                  )}
                </button>
                {expandedSection === 'quality' && (
                  <div className="p-4 space-y-3">
                    {prAnalysis.analysis.codeQuality.map((issue, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-[var(--github-border)]">
                        {getIssueIcon(issue.type)}
                        <div className="flex-1">
                          <p className="text-sm text-white">{issue.message}</p>
                          <p className="text-xs text-[var(--github-text-secondary)] mt-1">
                            Line {issue.line}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Code Diff */}
          <Card className="card-github">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Code className="w-5 h-5 text-[var(--github-accent)]" />
                Code Changes
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={copyToClipboard}
                className="text-[var(--github-text-secondary)] hover:text-white"
              >
                <Copy className="w-4 h-4 mr-2" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="code-block text-xs overflow-x-auto">
                <code className="text-[var(--github-text)]">{prAnalysis.codeDiff}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Feedback */}
          <Card className="card-github">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-white">
                Was this analysis helpful?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-[var(--github-border)]">
                  <ThumbsUp className="w-4 h-4 mr-2" />
                  Yes
                </Button>
                <Button variant="outline" className="flex-1 border-[var(--github-border)]">
                  <ThumbsDown className="w-4 h-4 mr-2" />
                  No
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Analyses */}
          <Card className="card-github">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-white">
                Recent Analyses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentAnalyses.map((analysis) => (
                  <div 
                    key={analysis.id} 
                    className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <p className="text-sm text-white truncate">{analysis.title}</p>
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant="secondary" className="text-xs bg-[var(--github-border)]">
                        {analysis.repo}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          analysis.risk === 'high' ? 'bg-red-400' :
                          analysis.risk === 'medium' ? 'bg-yellow-400' : 'bg-green-400'
                        }`} />
                        <span className="text-xs text-[var(--github-text-secondary)]">{analysis.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
