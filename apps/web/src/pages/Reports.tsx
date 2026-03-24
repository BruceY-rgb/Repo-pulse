import { useState } from 'react';
import { 
  FileText, 
  Download, 
  Calendar,
  ChevronRight,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const weeklyData = [
  { day: 'Mon', commits: 45, prs: 12, reviews: 28 },
  { day: 'Tue', commits: 52, prs: 15, reviews: 32 },
  { day: 'Wed', commits: 38, prs: 10, reviews: 24 },
  { day: 'Thu', commits: 65, prs: 18, reviews: 38 },
  { day: 'Fri', commits: 48, prs: 14, reviews: 30 },
  { day: 'Sat', commits: 25, prs: 5, reviews: 12 },
  { day: 'Sun', commits: 18, prs: 3, reviews: 8 },
];

const issueTypes = [
  { name: 'Security', value: 8, color: '#f85149' },
  { name: 'Performance', value: 15, color: '#f0883e' },
  { name: 'Code Quality', value: 32, color: '#58a6ff' },
  { name: 'Documentation', value: 12, color: '#8b949e' },
];

const recentReports = [
  { 
    id: 1, 
    title: 'Weekly Code Quality Report', 
    date: 'Mar 23, 2025', 
    type: 'weekly',
    summary: 'Overall code quality improved by 12%. 3 high-risk issues identified and resolved.',
    metrics: { issues: 23, resolved: 18, prs: 67 }
  },
  { 
    id: 2, 
    title: 'Security Audit Report', 
    date: 'Mar 20, 2025', 
    type: 'security',
    summary: '2 critical vulnerabilities found in authentication module. Immediate action required.',
    metrics: { critical: 2, high: 5, medium: 8 }
  },
  { 
    id: 3, 
    title: 'Team Performance Report', 
    date: 'Mar 15, 2025', 
    type: 'team',
    summary: 'Team velocity increased by 18%. Average PR review time reduced to 4.2 hours.',
    metrics: { velocity: '+18%', reviewTime: '4.2h', commits: 342 }
  },
];

export function Reports() {
  const [selectedReport, setSelectedReport] = useState(recentReports[0]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
            Automated insights and analytics for your codebase
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-[var(--github-border)] gap-2">
            <Calendar className="w-4 h-4" />
            This Week
          </Button>
          <Button className="btn-x-primary gap-2">
            <Download className="w-4 h-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report List */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[var(--github-text-secondary)] uppercase tracking-wider">
            Recent Reports
          </h3>
          <div className="space-y-3">
            {recentReports.map((report) => (
              <Card 
                key={report.id} 
                className={`card-github cursor-pointer transition-all duration-300 ${
                  selectedReport.id === report.id 
                    ? 'border-[var(--github-accent)] bg-[var(--github-accent)]/5' 
                    : 'hover:border-[var(--github-accent)]/30'
                }`}
                onClick={() => setSelectedReport(report)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      report.type === 'security' ? 'bg-red-400/10' :
                      report.type === 'team' ? 'bg-blue-400/10' : 'bg-[var(--github-accent)]/10'
                    }`}>
                      <FileText className={`w-5 h-5 ${
                        report.type === 'security' ? 'text-red-400' :
                        report.type === 'team' ? 'text-blue-400' : 'text-[var(--github-accent)]'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-white">{report.title}</h4>
                      <p className="text-xs text-[var(--github-text-secondary)] mt-1">{report.date}</p>
                      <p className="text-xs text-[var(--github-text-secondary)] mt-2 line-clamp-2">
                        {report.summary}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--github-text-secondary)]" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Generate New Report */}
          <Card className="card-github border-dashed border-2 border-[var(--github-border)]">
            <CardContent className="p-4">
              <Button variant="ghost" className="w-full h-full py-8 text-[var(--github-text-secondary)] hover:text-white">
                <Zap className="w-5 h-5 mr-2" />
                Generate Custom Report
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Report Detail */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="card-github">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-semibold text-white">
                    {selectedReport.title}
                  </CardTitle>
                  <p className="text-sm text-[var(--github-text-secondary)] mt-1">
                    {selectedReport.date}
                  </p>
                </div>
                <Badge className={`${
                  selectedReport.type === 'security' ? 'bg-red-400/20 text-red-400' :
                  selectedReport.type === 'team' ? 'bg-blue-400/20 text-blue-400' :
                  'bg-[var(--github-accent)]/20 text-[var(--github-accent)]'
                }`}>
                  {selectedReport.type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-[var(--github-text)] leading-relaxed mb-6">
                {selectedReport.summary}
              </p>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {Object.entries(selectedReport.metrics).map(([key, value]) => (
                  <div key={key} className="p-4 rounded-lg bg-white/5 text-center">
                    <p className="text-2xl font-bold text-white">{value}</p>
                    <p className="text-xs text-[var(--github-text-secondary)] capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <Tabs defaultValue="activity" className="w-full">
                <TabsList className="bg-[var(--github-surface)] border border-[var(--github-border)]">
                  <TabsTrigger 
                    value="activity"
                    className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
                  >
                    Activity
                  </TabsTrigger>
                  <TabsTrigger 
                    value="issues"
                    className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
                  >
                    Issues
                  </TabsTrigger>
                  <TabsTrigger 
                    value="trends"
                    className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
                  >
                    Trends
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="mt-4">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                        <XAxis dataKey="day" stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#161b22', 
                            border: '1px solid #30363d',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar dataKey="commits" fill="#ff4d00" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="prs" fill="#58a6ff" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>

                <TabsContent value="issues" className="mt-4">
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={issueTypes}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {issueTypes.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#161b22', 
                            border: '1px solid #30363d',
                            borderRadius: '8px'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-4 mt-4">
                    {issueTypes.map((item) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-[var(--github-text-secondary)]">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="trends" className="mt-4">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                        <XAxis dataKey="day" stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#161b22', 
                            border: '1px solid #30363d',
                            borderRadius: '8px'
                          }}
                        />
                        <Line type="monotone" dataKey="reviews" stroke="#ff4d00" strokeWidth={2} dot={{ fill: '#ff4d00' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
