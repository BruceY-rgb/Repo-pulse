import { useState } from 'react';
import { 
  Bell, 
  GitPullRequest, 
  AlertCircle, 
  CheckCircle,
  Info,
  Trash2,
  Check,
  Settings
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const notifications = [
  {
    id: 1,
    type: 'risk',
    title: 'High Risk Change Detected',
    message: 'PR #234 in frontend-dashboard introduces a potential security vulnerability',
    repo: 'frontend-dashboard',
    time: '5 minutes ago',
    read: false,
    icon: AlertCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
  },
  {
    id: 2,
    type: 'pr',
    title: 'PR Approved',
    message: 'Your pull request "Add user authentication" has been approved',
    repo: 'backend-api',
    time: '1 hour ago',
    read: false,
    icon: GitPullRequest,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
  },
  {
    id: 3,
    type: 'analysis',
    title: 'AI Analysis Complete',
    message: 'Analysis completed for PR #231 with 2 warnings and 1 suggestion',
    repo: 'ml-pipeline',
    time: '2 hours ago',
    read: true,
    icon: CheckCircle,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
  },
  {
    id: 4,
    type: 'info',
    title: 'Weekly Report Ready',
    message: 'Your weekly code quality report is now available',
    repo: 'All Repositories',
    time: '1 day ago',
    read: true,
    icon: Info,
    color: 'text-[var(--github-text-secondary)]',
    bgColor: 'bg-white/5',
  },
  {
    id: 5,
    type: 'risk',
    title: 'Dependency Vulnerability',
    message: 'Critical vulnerability found in lodash dependency',
    repo: 'frontend-dashboard',
    time: '2 days ago',
    read: true,
    icon: AlertCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
  },
];

const notificationSettings = {
  email: true,
  push: true,
  slack: false,
  highRisk: true,
  prUpdates: true,
  analysisComplete: true,
  weeklyReport: true,
};

export function Notifications() {
  const [activeTab, setActiveTab] = useState('all');
  const [notifs, setNotifs] = useState(notifications);

  const filteredNotifications = notifs.filter(n => {
    if (activeTab === 'unread') return !n.read;
    if (activeTab === 'risk') return n.type === 'risk';
    return true;
  });

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAsRead = (id: number) => {
    setNotifs(notifs.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifs(notifs.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: number) => {
    setNotifs(notifs.filter(n => n.id !== id));
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
            Stay updated on your repositories and code changes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="border-[var(--github-border)] gap-2"
            onClick={markAllAsRead}
          >
            <Check className="w-4 h-4" />
            Mark All Read
          </Button>
          <Button variant="ghost" size="icon" className="text-[var(--github-text-secondary)]">
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="bg-[var(--github-surface)] border border-[var(--github-border)]">
          <TabsTrigger 
            value="all" 
            onClick={() => setActiveTab('all')}
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            All
            <Badge className="ml-2 bg-[var(--github-border)] text-[var(--github-text-secondary)]">
              {notifs.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="unread"
            onClick={() => setActiveTab('unread')}
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            Unread
            {unreadCount > 0 && (
              <Badge className="ml-2 bg-[var(--github-accent)] text-white">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="risk"
            onClick={() => setActiveTab('risk')}
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            Risk Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <NotificationList 
            notifications={filteredNotifications} 
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
          />
        </TabsContent>
        
        <TabsContent value="unread" className="mt-4">
          <NotificationList 
            notifications={filteredNotifications}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
          />
        </TabsContent>
        
        <TabsContent value="risk" className="mt-4">
          <NotificationList 
            notifications={filteredNotifications}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
          />
        </TabsContent>
      </Tabs>

      {/* Notification Settings */}
      <Card className="card-github">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-[var(--github-accent)]" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-white">Channels</h4>
              <div className="space-y-2">
                {Object.entries(notificationSettings).slice(0, 3).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-sm text-[var(--github-text)] capitalize">{key}</span>
                    <div className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${value ? 'bg-[var(--github-accent)]' : 'bg-[var(--github-border)]'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${value ? 'left-5' : 'left-0.5'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-white">Event Types</h4>
              <div className="space-y-2">
                {Object.entries(notificationSettings).slice(3).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-sm text-[var(--github-text)]">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </span>
                    <div className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${value ? 'bg-[var(--github-accent)]' : 'bg-[var(--github-border)]'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${value ? 'left-5' : 'left-0.5'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface NotificationListProps {
  notifications: typeof notifications;
  onMarkAsRead: (id: number) => void;
  onDelete: (id: number) => void;
}

function NotificationList({ notifications, onMarkAsRead, onDelete }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-[var(--github-surface)] flex items-center justify-center mx-auto mb-4">
          <Bell className="w-8 h-8 text-[var(--github-text-secondary)]" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No notifications</h3>
        <p className="text-sm text-[var(--github-text-secondary)]">
          You're all caught up!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map((notification) => {
        const Icon = notification.icon;
        return (
          <Card 
            key={notification.id} 
            className={`card-github hover:border-[var(--github-accent)]/30 transition-all duration-300 ${
              !notification.read ? 'border-l-4 border-l-[var(--github-accent)]' : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg ${notification.bgColor} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${notification.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className={`text-sm font-medium ${notification.read ? 'text-white' : 'text-white font-semibold'}`}>
                        {notification.title}
                      </h4>
                      <p className="text-sm text-[var(--github-text-secondary)] mt-1">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <Badge variant="secondary" className="text-xs bg-[var(--github-border)]">
                          {notification.repo}
                        </Badge>
                        <span className="text-xs text-[var(--github-text-secondary)]">
                          {notification.time}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!notification.read && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-[var(--github-text-secondary)] hover:text-white"
                          onClick={() => onMarkAsRead(notification.id)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-[var(--github-text-secondary)] hover:text-red-400"
                        onClick={() => onDelete(notification.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
