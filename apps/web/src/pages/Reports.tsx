import { useState, useMemo } from 'react';
import {
  FileText,
  Download,
  Calendar,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
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
import { useApiQuery } from '@/lib/query-hooks';
import { useLanguage } from '@/contexts/LanguageContext';
import { reportService } from '@/services/report.service';

function ReportSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <div className="flex items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    </div>
  );
}

const TYPE_BADGE_KEY: Record<string, string> = {
  weekly: 'reports.detail.badge.weekly',
  security: 'reports.detail.badge.security',
  team: 'reports.detail.badge.team',
};

const ISSUE_LABEL_KEY: Record<string, string> = {
  Security: 'reports.issues.security',
  Performance: 'reports.issues.performance',
  'Code Quality': 'reports.issues.codeQuality',
  Documentation: 'reports.issues.documentation',
  Other: 'reports.issues.other',
};

const TYPE_TITLE_KEY: Record<string, string> = {
  weekly: 'reports.title.weekly',
  security: 'reports.title.security',
  team: 'reports.title.team',
};

export function Reports() {
  const { t } = useLanguage();
  const [selectedId, setSelectedId] = useState(1);

  const reportQuery = useApiQuery({
    queryKey: ['reports'],
    queryFn: () => reportService.getReportData(),
    staleTime: 60 * 1000,
  });

  const { weeklyData, issueTypes, recentReports } = useMemo(() => {
    if (!reportQuery.data) {
      return { weeklyData: [], issueTypes: [], recentReports: [] };
    }
    return reportQuery.data;
  }, [reportQuery.data]);

  const selectedReport = useMemo(
    () => recentReports.find((r) => r.id === selectedId) ?? recentReports[0],
    [recentReports, selectedId],
  );

  const hasData = recentReports.length > 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('reports.page.title')}</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
            {t('reports.page.description')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-[var(--github-border)] gap-2">
            <Calendar className="w-4 h-4" />
            {t('reports.page.thisWeek')}
          </Button>
          <Button className="btn-x-primary gap-2">
            <Download className="w-4 h-4" />
            {t('reports.page.exportPdf')}
          </Button>
        </div>
      </div>

      {reportQuery.isLoading ? (
        <ReportSkeleton />
      ) : !hasData ? (
        <Card className="card-github">
          <CardContent className="p-12 text-center">
            <p className="text-[var(--github-text-secondary)]">
              {t('reports.empty')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report List */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-[var(--github-text-secondary)] uppercase tracking-wider">
              {t('reports.sidebar.title')}
            </h3>
            <div className="space-y-3">
              {recentReports.map((report) => (
                <Card
                  key={report.id}
                  className={`card-github cursor-pointer transition-all duration-300 ${
                    selectedId === report.id
                      ? 'border-[var(--github-accent)] bg-[var(--github-accent)]/5'
                      : 'hover:border-[var(--github-accent)]/30'
                  }`}
                  onClick={() => setSelectedId(report.id)}
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
                        <h4 className="text-sm font-medium text-white">
                          {t(TYPE_TITLE_KEY[report.type] || 'reports.title.weekly')}
                        </h4>
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
                  {t('reports.sidebar.generate')}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Report Detail */}
          {selectedReport && (
            <div className="lg:col-span-2 space-y-4">
              <Card className="card-github">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-semibold text-white">
                        {t(TYPE_TITLE_KEY[selectedReport.type] || 'reports.title.weekly')}
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
                      {t(TYPE_BADGE_KEY[selectedReport.type] || 'reports.detail.badge.weekly')}
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
                        {t('reports.charts.activity')}
                      </TabsTrigger>
                      <TabsTrigger
                        value="issues"
                        className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
                      >
                        {t('reports.charts.issues')}
                      </TabsTrigger>
                      <TabsTrigger
                        value="trends"
                        className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
                      >
                        {t('reports.charts.trends')}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="activity" className="mt-4">
                      {weeklyData.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-[var(--github-text-secondary)] text-sm">
                          {t('reports.charts.emptyActivity')}
                        </div>
                      ) : (
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
                                  borderRadius: '8px',
                                  color: '#e6edf3',
                                }}
                                itemStyle={{ color: '#e6edf3' }}
                              />
                              <Bar dataKey="commits" fill="#ff4d00" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="prs" fill="#58a6ff" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="issues" className="mt-4">
                      {issueTypes.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-[var(--github-text-secondary)] text-sm">
                          {t('reports.charts.emptyIssues')}
                        </div>
                      ) : (
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
                                  borderRadius: '8px',
                                  color: '#e6edf3',
                                }}
                                itemStyle={{ color: '#e6edf3' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {issueTypes.length > 0 && (
                        <div className="flex justify-center gap-4 mt-4">
                          {issueTypes.map((item) => (
                            <div key={item.name} className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                              <span className="text-xs text-[var(--github-text-secondary)]">{t(ISSUE_LABEL_KEY[item.name] || item.name)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="trends" className="mt-4">
                      {weeklyData.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-[var(--github-text-secondary)] text-sm">
                          {t('reports.charts.emptyTrends')}
                        </div>
                      ) : (
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
                                  borderRadius: '8px',
                                  color: '#e6edf3',
                                }}
                                itemStyle={{ color: '#e6edf3' }}
                              />
                              <Line type="monotone" dataKey="reviews" stroke="#ff4d00" strokeWidth={2} dot={{ fill: '#ff4d00' }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
