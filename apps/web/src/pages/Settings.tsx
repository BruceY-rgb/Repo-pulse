import { useState, useEffect } from 'react';
import {
  User,
  Bell,
  Shield,
  Code,
  Github,
  Key,
  Mail,
  Slack,
  Save,
  CheckCircle,
  AlertTriangle,
  Brain,
  Wifi,
  Download,
  Loader2,
  Eye,
  EyeOff,
  GitPullRequest,
  MessageSquare,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import { authQueryKeys } from '@/hooks/queries/use-auth-queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  NotificationExceptionDraftCard,
} from '@/components/settings/notifications/NotificationExceptionDraftCard';
import {
  NotificationExceptionRuleList,
} from '@/components/settings/notifications/NotificationExceptionRuleList';
import {
  NotificationLevelSelector,
  type NotificationLevelValue,
} from '@/components/settings/notifications/NotificationLevelSelector';
import {
  NotificationTemplateGallery,
  type NotificationTemplateValue,
} from '@/components/settings/notifications/NotificationTemplateGallery';
import { FeishuIntegrationDialog } from '@/components/settings/integrations/FeishuIntegrationDialog';
import {
  createExceptionRuleFromFilterRule,
  createFilterRulePayloadFromDraft,
  createFilterRuleUpdatePayloadFromDraft,
  createExceptionDraftFromTemplate,
  type NotificationExceptionAction,
  type NotificationExceptionDraft,
  type NotificationExceptionRule,
} from '@/components/settings/notifications/notification-template-drafts';
import {
  useCreateFilterRuleMutation,
  useDeleteFilterRuleMutation,
  useFilterRulesQuery,
  useUpdateFilterRuleMutation,
} from '@/hooks/queries/use-filter-queries';
import {
  settingsService,
  PROVIDER_LABELS,
  PROVIDER_DEFAULT_MODELS,
  PROVIDER_DEFAULT_URLS,
  PROVIDER_CHAT_PATHS,
  type AIProvider,
  type AIConfig,
  type ConnectionTestResult,
  type ModelInfo,
} from '@/services/settings.service';
import { useLanguage } from '@/contexts/LanguageContext';
import { getProviderLogo } from '@/lib/provider-logo';
import { cn } from '@/lib/utils';
import { authService } from '@/services/auth.service';
import { notificationService } from '@/services/notification.service';
import type {
  NotificationChannel,
  NotificationPreferences,
} from '@/services/notification.service';
import { imService } from '@/services/im.service';
import feishuLogo from '@/assets/integrations/feishu.svg';

const apiKeys = [
  { name: 'Production API Key', key: 'rp_live_xxxxxxxxxxxx', created: '2025-01-15', lastUsed: '2 hours ago' },
  { name: 'Development API Key', key: 'rp_dev_xxxxxxxxxxxx', created: '2025-02-20', lastUsed: '1 day ago' },
];

export function Settings() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [feishuDialogOpen, setFeishuDialogOpen] = useState(false);
  const [feishuConnected, setFeishuConnected] = useState(false);

  // 用户信息状态
  const [userLoading, setUserLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [userProfile, setUserProfile] = useState({
    name: '',
    email: '',
    avatar: '',
    githubId: '',
    username: '',
    company: '',
    bio: '',
  });

  // AI 配置状态
  const [aiConfig, setAiConfig] = useState<AIConfig>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // 连接测试状态
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<ConnectionTestResult | null>(null);

  // 模型拉取状态
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchResult, setModelFetchResult] = useState<{ success: boolean; message: string; models: ModelInfo[] } | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);

  // 通知配置状态
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    channels: ['IN_APP'],
    events: {
      highRisk: true,
      prUpdates: true,
      analysisComplete: true,
      weeklyReport: false,
    },
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [notificationLevel, setNotificationLevel] = useState<NotificationLevelValue>('important');
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplateValue | null>(null);
  const [exceptionDraft, setExceptionDraft] = useState<NotificationExceptionDraft | null>(null);
  const filterRulesQuery = useFilterRulesQuery();
  const createFilterRuleMutation = useCreateFilterRuleMutation();
  const updateFilterRuleMutation = useUpdateFilterRuleMutation();
  const deleteFilterRuleMutation = useDeleteFilterRuleMutation();

  const exceptionRules = (filterRulesQuery.data ?? []).map((rule) =>
    createExceptionRuleFromFilterRule(rule, t),
  );

  // 加载用户信息
  useEffect(() => {
    const loadUser = async () => {
      setUserLoading(true);
      try {
        const user = await authService.getMe();
        setUserProfile({
          name: user.name || '',
          email: user.email || '',
          avatar: user.avatar || '',
          githubId: user.githubId || '',
          username: user.username || '',
          company: user.company || '',
          bio: user.bio || '',
        });
      } catch (error) {
        console.error('Failed to load user profile:', error);
      } finally {
        setUserLoading(false);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    const loadFeishuStatus = async () => {
      try {
        const status = await imService.getImStatus();
        const feishuStatus = status.feishu;
        setFeishuConnected(Boolean(
          feishuStatus?.connected ||
          feishuStatus?.state === 'connected' ||
          feishuStatus?.state === 'ready',
        ));
      } catch {
        setFeishuConnected(false);
      }
    };

    loadFeishuStatus();
  }, []);

  // 加载 AI 配置
  useEffect(() => {
    const loadAIConfig = async () => {
      setAiLoading(true);
      try {
        const config = await settingsService.getAIConfig();
        setAiConfig(config);
      } catch (error) {
        console.error('Failed to load AI config:', error);
      } finally {
        setAiLoading(false);
      }
    };
    loadAIConfig();
  }, []);

  // 加载通知配置
  useEffect(() => {
    const loadNotifPrefs = async () => {
      setNotifLoading(true);
      try {
        const prefs = await notificationService.getPreferences();
        setNotifPrefs(prefs);
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
      } finally {
        setNotifLoading(false);
      }
    };
    loadNotifPrefs();
  }, []);

  const handleUpdateProfile = async () => {
    setProfileSaving(true);
    try {
      await apiClient.patch('/users/me', {
        name: userProfile.name,
        email: userProfile.email,
        avatar: userProfile.avatar,
        username: userProfile.username || '',
        company: userProfile.company || '',
        bio: userProfile.bio || '',
      });
      queryClient.invalidateQueries({ queryKey: authQueryKeys.currentUser() });
      toast.success(t('settings.profile.saved') || 'Saved');
    } catch {
      toast.error(t('settings.profile.saveFailed') || 'Failed');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveAI = async () => {
    setAiSaving(true);
    try {
      await settingsService.updateAIConfig(aiConfig);
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save AI config:', error);
    } finally {
      setAiSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!aiConfig.aiProvider) return;

    setTestingConnection(true);
    setConnectionTestResult(null);

    try {
      const result = await settingsService.testConnection(
        aiConfig.aiProvider,
        aiConfig.aiApiKey || '',
        aiConfig.aiBaseUrl
      );
      setConnectionTestResult(result);
    } catch (error) {
      setConnectionTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFetchModels = async () => {
    if (!aiConfig.aiProvider) return;

    setFetchingModels(true);
    setModelFetchResult(null);

    try {
      const result = await settingsService.fetchModels(
        aiConfig.aiProvider,
        aiConfig.aiApiKey || '',
        aiConfig.aiBaseUrl
      );
      setModelFetchResult(result);
      if (result.success) {
        setModels(result.models);
      }
    } catch (error) {
      setModelFetchResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch models',
        models: [],
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const toggleModelEnabled = (modelId: string) => {
    setModels(models.map(m =>
      m.id === modelId ? { ...m, enabled: !m.enabled } : m
    ));
  };

  const handleSaveNotifications = async () => {
    setNotifSaving(true);
    try {
      await notificationService.updatePreferences(notifPrefs);
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    } finally {
      setNotifSaving(false);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const toggleChannel = (channel: NotificationChannel) => {
    const channels = notifPrefs.channels.includes(channel)
      ? notifPrefs.channels.filter((c) => c !== channel)
      : [...notifPrefs.channels, channel];
    setNotifPrefs({ ...notifPrefs, channels });
  };

  const handleSelectTemplate = (template: NotificationTemplateValue) => {
    setSelectedTemplate(template);
    setExceptionDraft(createExceptionDraftFromTemplate(template, t));
  };

  const handleSaveExceptionDraft = async () => {
    if (!exceptionDraft) {
      return;
    }

    try {
      if (exceptionDraft.id) {
        await updateFilterRuleMutation.mutateAsync({
          payload: createFilterRuleUpdatePayloadFromDraft(exceptionDraft),
          ruleId: exceptionDraft.id,
        });
      } else {
        await createFilterRuleMutation.mutateAsync(
          createFilterRulePayloadFromDraft(exceptionDraft),
        );
      }

      setSelectedTemplate(null);
      setExceptionDraft(null);
      toast.success(t('notifications.settings.rules.saveSuccess'));
    } catch (error) {
      console.error('Failed to save filter rule:', error);
      toast.error(t('notifications.settings.rules.saveError'));
    }
  };

  const handleEditExceptionRule = (rule: NotificationExceptionRule) => {
    setSelectedTemplate(rule.template);
    setExceptionDraft(rule);
  };

  const handleRemoveExceptionRule = async (ruleId: string) => {
    try {
      await deleteFilterRuleMutation.mutateAsync(ruleId);
      setExceptionDraft((current) => (current?.id === ruleId ? null : current));
      setSelectedTemplate((current) =>
        exceptionDraft?.id === ruleId ? null : current,
      );
      toast.success(t('notifications.settings.rules.removeSuccess'));
    } catch (error) {
      console.error('Failed to delete filter rule:', error);
      toast.error(t('notifications.settings.rules.removeError'));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('settings.page.title')}</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
            {t('settings.page.description')}
          </p>
        </div>
        <Button
          className="btn-x-primary gap-2"
          onClick={handleSave}
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? t('settings.saved') : t('settings.save')}
        </Button>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="bg-[var(--github-surface)] border border-[var(--github-border)]">
          <TabsTrigger
            value="profile"
            className="data-[state=active]:text-white"
          >
            <User className="w-4 h-4 mr-2" />
            {t('settings.tabs.profile')}
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="data-[state=active]:text-white"
          >
            <Bell className="w-4 h-4 mr-2" />
            {t('settings.tabs.notifications')}
          </TabsTrigger>
          <TabsTrigger
            value="integrations"
            className="data-[state=active]:text-white"
          >
            <Code className="w-4 h-4 mr-2" />
            {t('settings.tabs.integrations')}
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="data-[state=active]:text-white"
          >
            <Shield className="w-4 h-4 mr-2" />
            {t('settings.tabs.security')}
          </TabsTrigger>
          <TabsTrigger
            value="ai"
            className="data-[state=active]:text-white"
          >
            <Brain className="w-4 h-4 mr-2" />
            {t('settings.tabs.ai')}
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          {userLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-6 w-6 text-[var(--github-accent)]" />
            </div>
          ) : (
          <Card className="card-github">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white">{t('settings.profile.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="w-20 h-20 border-2 border-[var(--github-border)]">
                  <AvatarImage src={userProfile.avatar || 'https://github.com/shadcn.png'} />
                  <AvatarFallback className="text-2xl bg-[var(--github-accent)] text-white">
                    {userProfile.name.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[var(--github-border)] bg-[var(--github-surface)] text-sm text-white cursor-pointer hover:border-[var(--github-accent)] transition-colors">
                      {t('settings.profile.uploadAvatar') || 'Upload from computer'}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append('file', file);
                        try {
                          const res = await apiClient.post('/users/me/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                          setUserProfile({ ...userProfile, avatar: res.data.data.avatar });
                          toast.success(t('settings.profile.avatarUploaded') || 'Avatar uploaded');
                        } catch { toast.error('Upload failed'); }
                      }} />
                    </label>
                    <Button variant="outline" size="sm" className="border-[var(--github-border)]" onClick={async () => {
                      try {
                        const res = await apiClient.get('/users/me/github-avatar');
                        setUserProfile({ ...userProfile, avatar: res.data.data.avatar });
                        toast.success(t('settings.profile.avatarRestored') || 'GitHub avatar restored');
                      } catch { toast.error('Failed to restore'); }
                    }}>
                      <Github className="w-4 h-4 mr-1" />
                      {t('settings.profile.restoreAvatar') || 'Restore GitHub avatar'}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator className="bg-[var(--github-border)]" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm text-white">{t('settings.profile.fullName')}</Label>
                  <Input
                    id="name"
                    value={userProfile.name}
                    onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                    className="bg-[var(--github-surface)] border-[var(--github-border)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm text-white">{t('settings.profile.username')}</Label>
                  <Input
                    id="username"
                    value={userProfile.username}
                    onChange={(e) => setUserProfile({ ...userProfile, username: e.target.value })}
                    className="bg-[var(--github-surface)] border-[var(--github-border)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm text-white">{t('settings.profile.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={userProfile.email}
                    onChange={(e) => setUserProfile({ ...userProfile, email: e.target.value })}
                    className="bg-[var(--github-surface)] border-[var(--github-border)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-sm text-white">{t('settings.profile.company')}</Label>
                  <Input
                    id="company"
                    value={userProfile.company}
                    onChange={(e) => setUserProfile({ ...userProfile, company: e.target.value })}
                    className="bg-[var(--github-surface)] border-[var(--github-border)]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio" className="text-sm text-white">{t('settings.profile.bio')}</Label>
                <textarea
                  id="bio"
                  rows={3}
                  value={userProfile.bio}
                  onChange={(e) => setUserProfile({ ...userProfile, bio: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-[var(--github-surface)] border border-[var(--github-border)] text-white text-sm resize-none focus:outline-none focus:border-[var(--github-accent)]"
                />
              </div>

              <Button onClick={handleUpdateProfile} disabled={profileSaving} className="gap-2">
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {profileSaving ? (t('settings.profile.saving') || 'Saving...') : (t('settings.profile.save') || 'Save Settings')}
              </Button>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-4 space-y-6">
          {notifLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-6 w-6 text-[var(--github-accent)]" />
            </div>
          ) : (
            <>
              {/* Delivery Channels Card */}
              <Card className="card-github border border-border/80 shadow-md">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    {t('settings.notifications.channels.header')}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-xs leading-normal">
                    {t('settings.notifications.channels.headerDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Channels Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* In App Channel */}
                    <div className={cn(
                      "rounded-xl border p-4 flex flex-col justify-between space-y-4 transition-all duration-200",
                      notifPrefs.channels.includes('IN_APP')
                        ? "border-primary bg-primary/5 shadow-md shadow-primary/5 glow-orange"
                        : "border-border/60 bg-card/40 hover:bg-white/5 hover:border-primary/20"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                          notifPrefs.channels.includes('IN_APP')
                            ? "bg-primary/10 border-primary/20 text-primary"
                            : "bg-white/5 border-border/40 text-muted-foreground"
                        )}>
                          <Bell className="h-4.5 w-4.5" />
                        </div>
                        <Switch
                          checked={notifPrefs.channels.includes('IN_APP')}
                          onCheckedChange={() => toggleChannel('IN_APP')}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{t('settings.notifications.channels.inApp')}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-normal">
                          {t('settings.notifications.channels.inAppDesc')}
                        </p>
                      </div>
                    </div>

                    {/* Email Channel */}
                    <div className={cn(
                      "rounded-xl border p-4 flex flex-col justify-between space-y-4 transition-all duration-200",
                      notifPrefs.channels.includes('EMAIL')
                        ? "border-primary bg-primary/5 shadow-md shadow-primary/5 glow-orange"
                        : "border-border/60 bg-card/40 hover:bg-white/5 hover:border-primary/20"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                          notifPrefs.channels.includes('EMAIL')
                            ? "bg-primary/10 border-primary/20 text-primary"
                            : "bg-white/5 border-border/40 text-muted-foreground"
                        )}>
                          <Mail className="h-4.5 w-4.5" />
                        </div>
                        <Switch
                          checked={notifPrefs.channels.includes('EMAIL')}
                          onCheckedChange={() => toggleChannel('EMAIL')}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{t('settings.notifications.channels.email')}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-normal">
                            {t('settings.notifications.channels.emailDesc')}
                          </p>
                        </div>
                        {notifPrefs.channels.includes('EMAIL') && (
                          <div className="pt-3 border-t border-border/30 space-y-1.5 transition-all">
                            <Label className="text-[10px] font-semibold text-muted-foreground">{t('settings.notifications.channels.email')}</Label>
                            <Input
                              placeholder="your@email.com"
                              value={notifPrefs.email || ''}
                              onChange={(e) => setNotifPrefs({ ...notifPrefs, email: e.target.value })}
                              className="h-8 bg-background border-border/60 text-xs text-white rounded-lg focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Feishu Channel */}
                    <div className={cn(
                      "rounded-xl border p-4 flex flex-col justify-between space-y-4 transition-all duration-200",
                      notifPrefs.channels.includes('FEISHU')
                        ? "border-primary bg-primary/5 shadow-md shadow-primary/5 glow-orange"
                        : "border-border/60 bg-card/40 hover:bg-white/5 hover:border-primary/20"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200 overflow-hidden",
                          notifPrefs.channels.includes('FEISHU')
                            ? "bg-primary/10 border-primary/20"
                            : "bg-white/5 border-border/40"
                        )}>
                          <img src={feishuLogo} alt="Feishu" className="h-4.5 w-4.5 brightness-110 filter" />
                        </div>
                        <Switch
                          checked={notifPrefs.channels.includes('FEISHU')}
                          onCheckedChange={() => toggleChannel('FEISHU')}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{t('settings.notifications.channels.feishu')}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-normal">
                            {t('settings.notifications.channels.feishuDesc')}
                          </p>
                        </div>
                        {notifPrefs.channels.includes('FEISHU') && (
                          <div className="pt-3 border-t border-border/30 space-y-1.5 transition-all">
                            <Label className="text-[10px] font-semibold text-muted-foreground">{t('settings.notifications.channels.webhookUrl')}</Label>
                            <Input
                              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
                              value={notifPrefs.webhookUrl || ''}
                              onChange={(e) => setNotifPrefs({ ...notifPrefs, webhookUrl: e.target.value })}
                              className="h-8 bg-background border-border/60 text-xs text-white rounded-lg focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* DingTalk Channel */}
                    <div className={cn(
                      "rounded-xl border p-4 flex flex-col justify-between space-y-4 transition-all duration-200",
                      notifPrefs.channels.includes('DINGTALK')
                        ? "border-primary bg-primary/5 shadow-md shadow-primary/5 glow-orange"
                        : "border-border/60 bg-card/40 hover:bg-white/5 hover:border-primary/20"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                          notifPrefs.channels.includes('DINGTALK')
                            ? "bg-primary/10 border-primary/20 text-primary"
                            : "bg-white/5 border-border/40 text-muted-foreground"
                        )}>
                          <MessageSquare className="h-4.5 w-4.5" />
                        </div>
                        <Switch
                          checked={notifPrefs.channels.includes('DINGTALK')}
                          onCheckedChange={() => toggleChannel('DINGTALK')}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{t('settings.notifications.channels.dingtalk')}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-normal">
                            {t('settings.notifications.channels.dingtalkDesc')}
                          </p>
                        </div>
                        {notifPrefs.channels.includes('DINGTALK') && (
                          <div className="pt-3 border-t border-border/30 space-y-1.5 transition-all">
                            <Label className="text-[10px] font-semibold text-muted-foreground">{t('settings.notifications.channels.webhookUrl')}</Label>
                            <Input
                              placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx"
                              value={notifPrefs.webhookUrl || ''}
                              onChange={(e) => setNotifPrefs({ ...notifPrefs, webhookUrl: e.target.value })}
                              className="h-8 bg-background border-border/60 text-xs text-white rounded-lg focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Focus Level & Categories */}
              <Card className="card-github border border-border/80 shadow-md">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    {t('settings.notifications.focus.header')}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-xs leading-normal">
                    {t('settings.notifications.focus.headerDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Focus Level Selector */}
                  <NotificationLevelSelector
                    onValueChange={setNotificationLevel}
                    value={notificationLevel}
                  />

                  <Separator className="bg-border/60" />

                  {/* Focus Event Categories */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {t('settings.notifications.section.focus')}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* High Risk */}
                      <div className={cn(
                        "flex items-center justify-between p-4 rounded-xl border transition-all duration-200",
                        notifPrefs.events.highRisk
                          ? "border-primary/25 bg-primary/5 shadow-sm shadow-primary/5"
                          : "border-border/60 bg-card/30 hover:bg-white/5"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                            notifPrefs.events.highRisk ? "bg-primary/10 border-primary/20 text-primary" : "bg-white/5 border-border/40 text-muted-foreground"
                          )}>
                            <AlertTriangle className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{t('settings.notifications.events.highRisk')}</p>
                            <p className="text-xs text-muted-foreground leading-normal mt-0.5">{t('settings.notifications.events.highRiskDesc')}</p>
                          </div>
                        </div>
                        <Switch
                          checked={notifPrefs.events.highRisk}
                          onCheckedChange={(checked) =>
                            setNotifPrefs({ ...notifPrefs, events: { ...notifPrefs.events, highRisk: checked } })
                          }
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>

                      {/* PR Updates */}
                      <div className={cn(
                        "flex items-center justify-between p-4 rounded-xl border transition-all duration-200",
                        notifPrefs.events.prUpdates
                          ? "border-primary/25 bg-primary/5 shadow-sm shadow-primary/5"
                          : "border-border/60 bg-card/30 hover:bg-white/5"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                            notifPrefs.events.prUpdates ? "bg-primary/10 border-primary/20 text-primary" : "bg-white/5 border-border/40 text-muted-foreground"
                          )}>
                            <GitPullRequest className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{t('settings.notifications.events.prUpdates')}</p>
                            <p className="text-xs text-muted-foreground leading-normal mt-0.5">{t('settings.notifications.events.prUpdatesDesc')}</p>
                          </div>
                        </div>
                        <Switch
                          checked={notifPrefs.events.prUpdates}
                          onCheckedChange={(checked) =>
                            setNotifPrefs({ ...notifPrefs, events: { ...notifPrefs.events, prUpdates: checked } })
                          }
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>

                      {/* Analysis Complete */}
                      <div className={cn(
                        "flex items-center justify-between p-4 rounded-xl border transition-all duration-200",
                        notifPrefs.events.analysisComplete
                          ? "border-primary/25 bg-primary/5 shadow-sm shadow-primary/5"
                          : "border-border/60 bg-card/30 hover:bg-white/5"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                            notifPrefs.events.analysisComplete ? "bg-primary/10 border-primary/20 text-primary" : "bg-white/5 border-border/40 text-muted-foreground"
                          )}>
                            <Brain className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{t('settings.notifications.events.analysisComplete')}</p>
                            <p className="text-xs text-muted-foreground leading-normal mt-0.5">{t('settings.notifications.events.analysisCompleteDesc')}</p>
                          </div>
                        </div>
                        <Switch
                          checked={notifPrefs.events.analysisComplete}
                          onCheckedChange={(checked) =>
                            setNotifPrefs({ ...notifPrefs, events: { ...notifPrefs.events, analysisComplete: checked } })
                          }
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>

                      {/* Weekly Report */}
                      <div className={cn(
                        "flex items-center justify-between p-4 rounded-xl border transition-all duration-200",
                        notifPrefs.events.weeklyReport
                          ? "border-primary/25 bg-primary/5 shadow-sm shadow-primary/5"
                          : "border-border/60 bg-card/30 hover:bg-white/5"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                            notifPrefs.events.weeklyReport ? "bg-primary/10 border-primary/20 text-primary" : "bg-white/5 border-border/40 text-muted-foreground"
                          )}>
                            <FileText className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{t('settings.notifications.events.weeklyReport')}</p>
                            <p className="text-xs text-muted-foreground leading-normal mt-0.5">{t('settings.notifications.events.weeklyReportDesc')}</p>
                          </div>
                        </div>
                        <Switch
                          checked={notifPrefs.events.weeklyReport}
                          onCheckedChange={(checked) =>
                            setNotifPrefs({ ...notifPrefs, events: { ...notifPrefs.events, weeklyReport: checked } })
                          }
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Exception Rules Card */}
              <Card className="card-github border border-border/80 shadow-md">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                    <Code className="h-5 w-5 text-primary" />
                    {t('settings.notifications.exceptions.incoming')}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-xs leading-normal">
                    {t('settings.notifications.exceptions.incomingDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Template Shortcuts */}
                  <NotificationTemplateGallery
                    onSelectTemplate={handleSelectTemplate}
                    selectedTemplate={selectedTemplate}
                  />

                  {/* Exception Draft Form */}
                  {exceptionDraft && (
                    <div className="pt-2">
                      <NotificationExceptionDraftCard
                        draft={exceptionDraft}
                        isSaving={
                          createFilterRuleMutation.isPending || updateFilterRuleMutation.isPending
                        }
                        onActionChange={(value: NotificationExceptionAction) =>
                          setExceptionDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  action: value,
                                }
                              : current,
                          )
                        }
                        onClear={() => {
                          setSelectedTemplate(null);
                          setExceptionDraft(null);
                        }}
                        onDescriptionChange={(value: string) =>
                          setExceptionDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  description: value,
                                }
                              : current,
                          )
                        }
                        onEnabledChange={(value: boolean) =>
                          setExceptionDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  enabled: value,
                                }
                              : current,
                          )
                        }
                        onNameChange={(value: string) =>
                          setExceptionDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  name: value,
                                }
                              : current,
                          )
                        }
                        onSave={handleSaveExceptionDraft}
                      />
                    </div>
                  )}

                  {filterRulesQuery.error && (
                    <Alert className="border-destructive/40 bg-destructive/10 text-white rounded-xl">
                      <AlertTriangle className="h-4 w-4 text-[var(--github-danger)]" />
                      <AlertTitle>{t('notifications.settings.rules.errorTitle')}</AlertTitle>
                      <AlertDescription>
                        {filterRulesQuery.error.message || t('notifications.settings.rules.errorDescription')}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Separator className="bg-border/60" />

                  {/* Rule List */}
                  <NotificationExceptionRuleList
                    isDeleting={deleteFilterRuleMutation.isPending}
                    isLoading={filterRulesQuery.isLoading}
                    onEdit={handleEditExceptionRule}
                    onRemove={handleRemoveExceptionRule}
                    rules={exceptionRules}
                  />
                </CardContent>
              </Card>

              {/* Bottom Sticky-like Action Buttons */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSaveNotifications}
                  disabled={notifSaving}
                  className="btn-x-primary h-10 px-6 gap-2 text-sm font-semibold rounded-full shadow-lg shadow-primary/5 border-none"
                >
                  {notifSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : notifSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {notifSaving ? t('settings.notifications.saving') : notifSaved ? t('settings.notifications.saved') : t('settings.notifications.save')}
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <Card className="card-github">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white">{t('settings.integrations.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { provider: 'GitHub', username: userProfile.githubId ? userProfile.name || 'Connected' : 'Not connected', connected: !!userProfile.githubId, icon: Github },
                { provider: 'Feishu', username: feishuConnected ? t('settings.integrations.feishu.ready') : t('settings.integrations.feishu.notConfigured'), connected: feishuConnected, logo: feishuLogo, action: 'feishu' },
                { provider: 'Slack', username: 'Not configured', connected: false, icon: Slack },
                { provider: 'Email', username: userProfile.email || 'Not configured', connected: !!userProfile.email, icon: Mail },
              ].map((account) => {
                const Icon = account.icon;
                const isFeishu = account.action === 'feishu';
                return (
                  <div key={account.provider} className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-[var(--github-surface)] flex items-center justify-center">
                        {account.logo ? (
                          <img src={account.logo} alt="" className="h-5 w-5 rounded" />
                        ) : (
                          <Icon className="w-5 h-5 text-white" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{account.provider}</p>
                        <p className="text-xs text-[var(--github-text-secondary)]">{account.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isFeishu ? (
                        <>
                          {account.connected ? (
                            <Badge className="bg-green-400/20 text-green-400">{t('settings.integrations.connected')}</Badge>
                          ) : null}
                          <Button
                            size="sm"
                            className={account.connected ? "border-[var(--github-border)]" : "btn-x-primary"}
                            variant={account.connected ? "outline" : undefined}
                            onClick={() => setFeishuDialogOpen(true)}
                          >
                            {account.connected
                              ? t('settings.integrations.feishu.manage')
                              : t('settings.integrations.feishu.configure')}
                          </Button>
                        </>
                      ) : account.connected ? (
                        <>
                          <Badge className="bg-green-400/20 text-green-400">{t('settings.integrations.connected')}</Badge>
                          <Button variant="outline" size="sm" className="border-[var(--github-border)] text-red-400 hover:text-red-400">
                            {t('settings.integrations.disconnect')}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" className="btn-x-primary">
                          {t('settings.integrations.connect')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <FeishuIntegrationDialog
            open={feishuDialogOpen}
            onOpenChange={setFeishuDialogOpen}
            onConnectionChange={setFeishuConnected}
          />

          <Card className="card-github">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-white">{t('settings.integrations.apiKeys')}</CardTitle>
                <Button size="sm" className="btn-x-primary gap-2">
                  <Key className="w-4 h-4" />
                  {t('settings.integrations.generateKey')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.name} className="p-4 rounded-lg bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-white">{apiKey.name}</p>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-400">
                      {t('settings.integrations.revoke')}
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--github-text-secondary)]">
                    <code className="px-2 py-1 rounded bg-[var(--github-surface)]">{apiKey.key}</code>
                    <span>{t('settings.integrations.created')} {apiKey.created}</span>
                    <span>{t('settings.integrations.lastUsed')} {apiKey.lastUsed}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="mt-4 space-y-4">
          <Card className="card-github">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white">{t('settings.security.password')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current" className="text-sm text-white">{t('settings.security.currentPassword')}</Label>
                <Input
                  id="current"
                  type="password"
                  className="bg-[var(--github-surface)] border-[var(--github-border)]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new" className="text-sm text-white">{t('settings.security.newPassword')}</Label>
                <Input
                  id="new"
                  type="password"
                  className="bg-[var(--github-surface)] border-[var(--github-border)]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-sm text-white">{t('settings.security.confirmPassword')}</Label>
                <Input
                  id="confirm"
                  type="password"
                  className="bg-[var(--github-surface)] border-[var(--github-border)]"
                />
              </div>
              <Button className="btn-x-primary">{t('settings.security.updatePassword')}</Button>
            </CardContent>
          </Card>

          <Card className="card-github border-red-400/30">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                {t('settings.security.dangerZone')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-red-400/5 border border-red-400/20">
                <div>
                  <p className="text-sm font-medium text-white">{t('settings.security.deleteAccount')}</p>
                  <p className="text-xs text-[var(--github-text-secondary)]">
                    {t('settings.security.deleteDescription')}
                  </p>
                </div>
                <Button variant="outline" className="border-red-400 text-red-400 hover:bg-red-400/10">
                  {t('settings.security.deleteButton')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Tab */}
        <TabsContent value="ai" className="mt-4 space-y-4">
          <Card className="card-github">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Brain className="w-5 h-5" />
                {t('settings.ai.title')}
              </CardTitle>
              <CardDescription className="text-[var(--github-text-secondary)]">
                {t('settings.ai.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {aiLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="h-6 w-6 text-[var(--github-accent)]" />
                </div>
              ) : (
                <>
                  {/* Provider Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="aiProvider" className="text-sm text-white">{t('settings.ai.provider')}</Label>
                    <Select
                      value={aiConfig.aiProvider || ''}
                      onValueChange={(value: AIProvider) => setAiConfig({ ...aiConfig, aiProvider: value, aiModel: PROVIDER_DEFAULT_MODELS[value] || '', aiBaseUrl: value === 'custom' ? '' : null })}
                    >
                      <SelectTrigger className="bg-[var(--github-surface)] border-[var(--github-border)]">
                        <SelectValue placeholder={t('settings.ai.providerPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('openai')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.openai}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="anthropic">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('anthropic')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.anthropic}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="deepseek">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('deepseek')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.deepseek}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="google">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('google')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.google}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="moonshot">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('moonshot')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.moonshot}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="zhipu">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('zhipu')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.zhipu}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="minimax">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('minimax')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.minimax}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="doubao">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('doubao')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.doubao}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="qwen">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('qwen')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.qwen}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="ollama">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('ollama')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.ollama}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="custom">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('custom')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.custom}</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* API Key - show for all providers except custom & ollama */}
                  {(aiConfig.aiProvider && aiConfig.aiProvider !== 'custom' && aiConfig.aiProvider !== 'ollama') && (
                    <div className="space-y-2">
                      <Label htmlFor="aiApiKey" className="text-sm text-white">{t('settings.ai.apiKey')}</Label>
                      <div className="relative">
                        <Input
                          id="aiApiKey"
                          type={showApiKey ? 'text' : 'password'}
                          placeholder={aiConfig.aiApiKey ? '*'.repeat(aiConfig.aiApiKey.length) : t('settings.ai.apiKeyPlaceholder')}
                          value={aiConfig.aiApiKey || ''}
                          onChange={(e) => setAiConfig({ ...aiConfig, aiApiKey: e.target.value })}
                          className="bg-[var(--github-surface)] border-[var(--github-border)] pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--github-text-secondary)] hover:text-white transition-colors"
                        >
                          {showApiKey ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-[var(--github-text-secondary)]">
                        {t('settings.ai.apiKeyHint')}
                      </p>
                    </div>
                  )}

                  {/* Base URL - show for custom */}
                  {aiConfig.aiProvider === 'custom' && (
                    <div className="space-y-2">
                      <Label htmlFor="aiBaseUrl" className="text-sm text-white">{t('settings.ai.baseUrl')}</Label>
                      <Input
                        id="aiBaseUrl"
                        type="url"
                        placeholder={t('settings.ai.baseUrlPlaceholder')}
                        value={aiConfig.aiBaseUrl || ''}
                        onChange={(e) => setAiConfig({ ...aiConfig, aiBaseUrl: e.target.value })}
                        className="bg-[var(--github-surface)] border-[var(--github-border)]"
                      />
                    </div>
                  )}

                  {/* Endpoint Preview */}
                  {aiConfig.aiProvider && (
                    <div className="p-3 rounded-lg bg-white/5 border border-[var(--github-border)]">
                      <p className="text-xs text-[var(--github-text-secondary)] mb-1">{t('settings.ai.endpointPreview')}</p>
                      <code className="text-sm text-white break-all">
                        {getEndpointPreview(aiConfig.aiProvider, aiConfig.aiProvider === 'custom' ? aiConfig.aiBaseUrl : undefined)}
                      </code>
                    </div>
                  )}

                  {/* Test Connection Button */}
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleTestConnection}
                      disabled={testingConnection || !aiConfig.aiProvider}
                      variant="outline"
                      className="border-[var(--github-border)] gap-2"
                    >
                      {testingConnection ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Wifi className="w-4 h-4" />
                      )}
                      {testingConnection ? t('settings.ai.testing') : t('settings.ai.testConnection')}
                    </Button>
                    {connectionTestResult && (
                      <div className={`flex items-center gap-2 text-sm ${connectionTestResult.success ? 'text-green-400' : 'text-red-400'}`}>
                        {connectionTestResult.success ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <AlertTriangle className="w-4 h-4" />
                        )}
                        {connectionTestResult.message}
                      </div>
                    )}
                  </div>

                  {/* Model */}
                  <div className="space-y-2">
                    <Label htmlFor="aiModel" className="text-sm text-white">{t('settings.ai.model')}</Label>
                    <Input
                      id="aiModel"
                      placeholder={getDefaultModel(aiConfig.aiProvider)}
                      value={aiConfig.aiModel || ''}
                      onChange={(e) => setAiConfig({ ...aiConfig, aiModel: e.target.value })}
                      className="bg-[var(--github-surface)] border-[var(--github-border)]"
                    />
                    <p className="text-xs text-[var(--github-text-secondary)]">
                      {getModelHint(aiConfig.aiProvider)}
                    </p>
                  </div>

                  {/* Fetch Models Button */}
                  {aiConfig.aiProvider && aiConfig.aiProvider !== 'custom' && (
                    <div className="space-y-3">
                      <Button
                        onClick={handleFetchModels}
                        disabled={fetchingModels}
                        variant="outline"
                        className="border-[var(--github-border)] gap-2"
                      >
                        {fetchingModels ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        {fetchingModels ? t('settings.ai.fetching') : t('settings.ai.fetchModels')}
                      </Button>

                      {modelFetchResult && !modelFetchResult.success && (
                        <div className="flex items-center gap-2 text-sm text-red-400">
                          <AlertTriangle className="w-4 h-4" />
                          {modelFetchResult.message}
                        </div>
                      )}

                      {/* Model List */}
                      {models.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm text-white">{t('settings.ai.availableModels')}</Label>
                          <div className="max-h-48 overflow-y-auto space-y-1 border border-[var(--github-border)] rounded-lg">
                            {models.map((model) => (
                              <div
                                key={model.id}
                                className="flex items-center justify-between p-2 hover:bg-white/5"
                              >
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={model.enabled}
                                    onCheckedChange={() => toggleModelEnabled(model.id)}
                                  />
                                  <span className="text-sm text-white">{model.name}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    setAiConfig({ ...aiConfig, aiModel: model.id });
                                  }}
                                  className="text-xs text-[var(--github-accent)] hover:underline"
                                >
                                  {t('settings.ai.use')}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Separator className="bg-[var(--github-border)]" />

                  <Button
                    onClick={handleSaveAI}
                    disabled={aiSaving || !aiConfig.aiProvider}
                    className="btn-x-primary gap-2"
                  >
                    {aiSaving && <Spinner className="h-4 w-4" />}
                    {aiSaved ? <CheckCircle className="w-4 h-4" /> : null}
                    {aiSaving ? t('settings.ai.saving') : aiSaved ? t('settings.ai.saved') : t('settings.ai.save')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper functions
function getDefaultModel(provider?: string): string {
  if (!provider || !(provider in PROVIDER_DEFAULT_MODELS)) return '';
  return PROVIDER_DEFAULT_MODELS[provider as AIProvider] || '';
}

function getModelHint(provider?: string): string {
  if (!provider) return 'Select a provider first';
  switch (provider) {
    case 'openai':
      return 'e.g., gpt-4o, gpt-4-turbo, gpt-3.5-turbo';
    case 'anthropic':
      return 'e.g., claude-sonnet-4-20250514, claude-opus-4-20250514';
    case 'deepseek':
      return 'e.g., deepseek-chat, deepseek-coder';
    case 'google':
      return 'e.g., gemini-2.0-flash-exp, gemini-1.5-pro';
    case 'moonshot':
      return 'e.g., kimi-longtext-chat, kimi-math';
    case 'zhipu':
      return 'e.g., glm-4-flash, glm-4';
    case 'minimax':
      return 'e.g., MiniMax-M2.1';
    case 'doubao':
      return 'e.g., doubao-pro-32k';
    case 'qwen':
      return 'e.g., qwen-turbo, qwen-plus';
    case 'ollama':
      return 'e.g., llama3, qwen2.5, mistral, codellama';
    case 'custom':
      return 'Enter the model name supported by your custom endpoint';
    default:
      return 'Select a provider first';
  }
}

function getEndpointPreview(provider?: string, customBaseUrl?: string): string {
  if (!provider) return '';

  if (customBaseUrl?.trim()) {
    const normalizedBaseUrl = customBaseUrl.replace(/\/$/, '');
    const path = PROVIDER_CHAT_PATHS[provider as AIProvider] || '/chat/completions';
    return normalizedBaseUrl + path;
  }

  const baseUrl = PROVIDER_DEFAULT_URLS[provider as AIProvider];
  if (!baseUrl) return '';

  const path = PROVIDER_CHAT_PATHS[provider as AIProvider] || '/chat/completions';
  return baseUrl + path;
}
