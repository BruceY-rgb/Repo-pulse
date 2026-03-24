import { useEffect, useRef } from 'react';
import { 
  GitPullRequest, 
  GitCommit, 
  AlertCircle, 
  TrendingUp,
  Clock,
  Users,
  Activity,
  Shield,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import gsap from 'gsap';

// Mock data for charts
const activityData = [
  { name: 'Mon', commits: 45, prs: 12, issues: 8 },
  { name: 'Tue', commits: 52, prs: 15, issues: 6 },
  { name: 'Wed', commits: 38, prs: 10, issues: 12 },
  { name: 'Thu', commits: 65, prs: 18, issues: 5 },
  { name: 'Fri', commits: 48, prs: 14, issues: 9 },
  { name: 'Sat', commits: 25, prs: 5, issues: 3 },
  { name: 'Sun', commits: 18, prs: 3, issues: 2 },
];

const riskDistribution = [
  { name: 'Low', value: 65, color: '#238636' },
  { name: 'Medium', value: 25, color: '#f0883e' },
  { name: 'High', value: 10, color: '#f85149' },
];

const recentActivity = [
  { id: 1, type: 'pr', title: 'Fix authentication vulnerability in login flow', repo: 'frontend-app', author: 'Alice Chen', time: '2 min ago', risk: 'high' },
  { id: 2, type: 'issue', title: 'Performance degradation in API endpoints', repo: 'backend-api', author: 'Bob Smith', time: '15 min ago', risk: 'medium' },
  { id: 3, type: 'commit', title: 'Refactor database connection pool', repo: 'backend-api', author: 'Carol Wu', time: '1 hour ago', risk: 'low' },
  { id: 4, type: 'pr', title: 'Add unit tests for user service', repo: 'backend-api', author: 'David Lee', time: '2 hours ago', risk: 'low' },
  { id: 5, type: 'issue', title: 'Update dependencies to latest versions', repo: 'frontend-app', author: 'Eve Zhang', time: '3 hours ago', risk: 'medium' },
];

const statsCards = [
  { 
    title: 'Open PRs', 
    value: '24', 
    change: '+12%', 
    trend: 'up',
    icon: GitPullRequest, 
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10'
  },
  { 
    title: 'Commits Today', 
    value: '156', 
    change: '+8%', 
    trend: 'up',
    icon: GitCommit, 
    color: 'text-green-400',
    bgColor: 'bg-green-400/10'
  },
  { 
    title: 'High Risk Issues', 
    value: '7', 
    change: '-2', 
    trend: 'down',
    icon: AlertCircle, 
    color: 'text-red-400',
    bgColor: 'bg-red-400/10'
  },
  { 
    title: 'Avg Review Time', 
    value: '4.2h', 
    change: '-15%', 
    trend: 'up',
    icon: Clock, 
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10'
  },
];

const doraMetrics = [
  { label: 'Deployment Frequency', value: '4.2/day', target: '5/day', progress: 84 },
  { label: 'Lead Time for Changes', value: '2.1 days', target: '2 days', progress: 95 },
  { label: 'Change Failure Rate', value: '8.5%', target: '5%', progress: 59 },
  { label: 'Time to Recovery', value: '45 min', target: '30 min', progress: 67 },
];

export function Dashboard() {
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardsRef.current) {
      gsap.fromTo(
        cardsRef.current.children,
        { opacity: 0, y: 20 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.5, 
          stagger: 0.1,
          ease: 'power2.out'
        }
      );
    }
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
            Real-time insights into your codebase health and team productivity
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-[var(--github-border)] text-sm">
            Last 7 Days
          </Button>
          <Button className="btn-x-primary gap-2 text-sm">
            <Activity className="w-4 h-4" />
            Live View
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="card-github hover:border-[var(--github-accent)]/30 transition-all duration-300">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${stat.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                    {stat.trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {stat.change}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-sm text-[var(--github-text-secondary)]">{stat.title}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <Card className="card-github lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--github-accent)]" />
                Weekly Activity
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--github-text-secondary)]">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData}>
                  <defs>
                    <linearGradient id="colorCommits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff4d00" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ff4d00" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPrs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#58a6ff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#8b949e" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#8b949e" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#161b22', 
                      border: '1px solid #30363d',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="commits" 
                    stroke="#ff4d00" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorCommits)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="prs" 
                    stroke="#58a6ff" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorPrs)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Risk Distribution */}
        <Card className="card-github">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--github-accent)]" />
              Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {riskDistribution.map((entry, index) => (
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
            <div className="flex justify-center gap-4 mt-2">
              {riskDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-[var(--github-text-secondary)]">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DORA Metrics & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DORA Metrics */}
        <Card className="card-github">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--github-accent)]" />
              DORA Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {doraMetrics.map((metric) => (
              <div key={metric.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--github-text-secondary)]">{metric.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{metric.value}</span>
                    <span className="text-xs text-[var(--github-text-secondary)]">/ {metric.target}</span>
                  </div>
                </div>
                <div className="relative">
                  <Progress 
                    value={metric.progress} 
                    className="h-2 bg-[var(--github-border)]"
                  />
                  <div 
                    className="absolute top-0 left-0 h-2 rounded-full bg-gradient-to-r from-[#ff4d00] to-[#ff8c00]"
                    style={{ width: `${metric.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="card-github">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-[var(--github-accent)]" />
                Recent Activity
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-[var(--github-accent)] text-xs">
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div 
                  key={activity.id} 
                  className="flex items-start gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                    activity.risk === 'high' ? 'bg-red-400' : 
                    activity.risk === 'medium' ? 'bg-yellow-400' : 'bg-green-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{activity.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs bg-[var(--github-border)] text-[var(--github-text-secondary)]">
                        {activity.repo}
                      </Badge>
                      <span className="text-xs text-[var(--github-text-secondary)]">{activity.time}</span>
                    </div>
                  </div>
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs bg-[var(--github-accent)] text-white">
                      {activity.author.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Activity */}
      <Card className="card-github">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--github-accent)]" />
            Team Contributions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#8b949e" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#8b949e" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#161b22', 
                    border: '1px solid #30363d',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="commits" fill="#ff4d00" radius={[4, 4, 0, 0]} />
                <Bar dataKey="issues" fill="#f85149" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
