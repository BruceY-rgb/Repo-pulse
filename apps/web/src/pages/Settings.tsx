// @ts-nocheck
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
  Link,
  Wifi,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { notificationService } from '@/services/notification.service';
import type {
  NotificationChannel,
  NotificationPreferences,
} from '@/services/notification.service';

const connectedAccounts = [
  { provider: 'GitHub', username: 'johndoe', connected: true, icon: Github },
  { provider: 'Slack', username: 'acme-corp', connected: true, icon: Slack },
  { provider: 'Email', username: 'john@example.com', connected: true, icon: Mail },
];

const apiKeys = [
  { name: 'Production API Key', key: 'rp_live_xxxxxxxxxxxx', created: '2025-01-15', lastUsed: '2 hours ago' },
  { name: 'Development API Key', key: 'rp_dev_xxxxxxxxxxxx', created: '2025-02-20', lastUsed: '1 day ago' },
];

export function Settings() {
  const { t } = useLanguage();
  const [saved, setSaved] = useState(false);

  // AI 配置状态
  const [aiConfig, setAiConfig] = useState<AIConfig>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);

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
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
            Manage your account and preferences
          </p>
        </div>
        <Button
          className="btn-x-primary gap-2"
          onClick={handleSave}
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="bg-[var(--github-surface)] border border-[var(--github-border)]">
          <TabsTrigger
            value="profile"
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger
            value="integrations"
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            <Code className="w-4 h-4 mr-2" />
            Integrations
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            <Shield className="w-4 h-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger
            value="ai"
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            <Brain className="w-4 h-4 mr-2" />
            AI
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card className="card-github">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white">Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="w-20 h-20 border-2 border-[var(--github-border)]">
                  <AvatarImage src="https://github.com/shadcn.png" />
                  <AvatarFallback className="text-2xl bg-[var(--github-accent)] text-white">JD</AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Button variant="outline" className="border-[var(--github-border)]">
                    Change Avatar
                  </Button>
                  <p className="text-xs text-[var(--github-text-secondary)]">
                    JPG, PNG or GIF. Max 2MB.
                  </p>
                </div>
              </div>

              <Separator className="bg-[var(--github-border)]" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm text-white">Full Name</Label>
                  <Input
                    id="name"
                    defaultValue="John Doe"
                    className="bg-[var(--github-surface)] border-[var(--github-border)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm text-white">Username</Label>
                  <Input
                    id="username"
                    defaultValue="johndoe"
                    className="bg-[var(--github-surface)] border-[var(--github-border)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm text-white">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    defaultValue="john@example.com"
                    className="bg-[var(--github-surface)] border-[var(--github-border)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-sm text-white">Company</Label>
                  <Input
                    id="company"
                    defaultValue="Acme Corp"
                    className="bg-[var(--github-surface)] border-[var(--github-border)]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio" className="text-sm text-white">Bio</Label>
                <textarea
                  id="bio"
                  rows={3}
                  defaultValue="Full-stack developer passionate about clean code and AI."
                  className="w-full px-3 py-2 rounded-md bg-[var(--github-surface)] border border-[var(--github-border)] text-white text-sm resize-none focus:outline-none focus:border-[var(--github-accent)]"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-4 space-y-4">
          {notifLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-6 w-6 text-[var(--github-accent)]" />
            </div>
          ) : (
            <>
              <Card className="card-github">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-[var(--github-accent)]/15 text-[var(--github-accent)]">
                      Notification Controls
                    </Badge>
                  </div>
                  <CardTitle className="text-base font-semibold text-white">
                    Reduce noise without missing important updates
                  </CardTitle>
                  <CardDescription className="text-[var(--github-text-secondary)]">
                    Notification settings now combine delivery channels, default focus, and exception
                    rules in one place. We will move the filtering controls into this tab step by
                    step.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--github-surface)]">
                        <Bell className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Delivery channels</p>
                        <p className="text-xs text-[var(--github-text-secondary)]">
                          Choose where alerts should arrive.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--github-surface)]">
                        <Shield className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Default notification focus</p>
                        <p className="text-xs text-[var(--github-text-secondary)]">
                          This area will host the default level selector next.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--github-surface)]">
                        <Link className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Exception rules</p>
                        <p className="text-xs text-[var(--github-text-secondary)]">
                          Templates and advanced filters will live here after the focus selector.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--github-text-secondary)]">
                  Delivery
                </p>
                <p className="text-sm text-[var(--github-text-secondary)]">
                  First decide which channels are allowed to reach you.
                </p>
              </div>

              <Card className="card-github">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-white">Notification Channels</CardTitle>
                  <CardDescription className="text-[var(--github-text-secondary)]">
                    Configure how you want to receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-[var(--github-text-secondary)]" />
                        <div>
                          <p className="text-sm text-white">Email</p>
                          <p className="text-xs text-[var(--github-text-secondary)]">Receive updates via email</p>
                        </div>
                      </div>
                      <Switch
                        checked={notifPrefs.channels.includes('EMAIL')}
                        onCheckedChange={() => toggleChannel('EMAIL')}
                      />
                    </div>
                    {notifPrefs.channels.includes('EMAIL') && (
                      <div className="ml-12 space-y-2">
                        <Input
                          placeholder="your@email.com"
                          value={notifPrefs.email || ''}
                          onChange={(e) => setNotifPrefs({ ...notifPrefs, email: e.target.value })}
                          className="bg-[var(--github-surface)] border-[var(--github-border)]"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <div className="flex items-center gap-3">
                        <Link className="w-5 h-5 text-[var(--github-text-secondary)]" />
                        <div>
                          <p className="text-sm text-white">DingTalk</p>
                          <p className="text-xs text-[var(--github-text-secondary)]">Send to DingTalk webhook</p>
                        </div>
                      </div>
                      <Switch
                        checked={notifPrefs.channels.includes('DINGTALK')}
                        onCheckedChange={() => toggleChannel('DINGTALK')}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <div className="flex items-center gap-3">
                        <Link className="w-5 h-5 text-[var(--github-text-secondary)]" />
                        <div>
                          <p className="text-sm text-white">Feishu</p>
                          <p className="text-xs text-[var(--github-text-secondary)]">Send to Feishu webhook</p>
                        </div>
                      </div>
                      <Switch
                        checked={notifPrefs.channels.includes('FEISHU')}
                        onCheckedChange={() => toggleChannel('FEISHU')}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <div className="flex items-center gap-3">
                        <Bell className="w-5 h-5 text-[var(--github-text-secondary)]" />
                        <div>
                          <p className="text-sm text-white">In-App</p>
                          <p className="text-xs text-[var(--github-text-secondary)]">Receive in-app notifications</p>
                        </div>
                      </div>
                      <Switch
                        checked={notifPrefs.channels.includes('IN_APP')}
                        onCheckedChange={() => toggleChannel('IN_APP')}
                      />
                    </div>
                  </div>

                  {(notifPrefs.channels.includes('DINGTALK') ||
                    notifPrefs.channels.includes('FEISHU') ||
                    notifPrefs.channels.includes('WEBHOOK')) && (
                    <>
                      <Separator className="bg-[var(--github-border)]" />
                      <div className="space-y-2">
                        <Label className="text-sm text-white">Webhook URL</Label>
                        <Input
                          placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx"
                          value={notifPrefs.webhookUrl || ''}
                          onChange={(e) => setNotifPrefs({ ...notifPrefs, webhookUrl: e.target.value })}
                          className="bg-[var(--github-surface)] border-[var(--github-border)]"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--github-text-secondary)]">
                  Focus
                </p>
                <p className="text-sm text-[var(--github-text-secondary)]">
                  Then decide which kinds of repository activity should still get through by default.
                </p>
              </div>

              <Card className="card-github">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-white">Notification Focus</CardTitle>
                  <CardDescription className="text-[var(--github-text-secondary)]">
                    These toggles are the current baseline. Default levels and rule-based filtering will
                    be added into this section next.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <NotificationLevelSelector
                    onValueChange={setNotificationLevel}
                    value={notificationLevel}
                  />

                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm text-white">High Risk Alerts</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">Critical security and performance issues</p>
                    </div>
                    <Switch
                      checked={notifPrefs.events.highRisk}
                      onCheckedChange={(checked) =>
                        setNotifPrefs({ ...notifPrefs, events: { ...notifPrefs.events, highRisk: checked } })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm text-white">PR Updates</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">Pull request created, updated, or merged</p>
                    </div>
                    <Switch
                      checked={notifPrefs.events.prUpdates}
                      onCheckedChange={(checked) =>
                        setNotifPrefs({ ...notifPrefs, events: { ...notifPrefs.events, prUpdates: checked } })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm text-white">Analysis Complete</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">AI analysis finished for a PR</p>
                    </div>
                    <Switch
                      checked={notifPrefs.events.analysisComplete}
                      onCheckedChange={(checked) =>
                        setNotifPrefs({ ...notifPrefs, events: { ...notifPrefs.events, analysisComplete: checked } })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm text-white">Weekly Reports</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">Weekly code quality summary</p>
                    </div>
                    <Switch
                      checked={notifPrefs.events.weeklyReport}
                      onCheckedChange={(checked) =>
                        setNotifPrefs({ ...notifPrefs, events: { ...notifPrefs.events, weeklyReport: checked } })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--github-text-secondary)]">
                  Exceptions
                </p>
                <p className="text-sm text-[var(--github-text-secondary)]">
                  This is where quick templates and exception rules will be merged in, so users can fine-tune
                  noisy cases without leaving Settings.
                </p>
              </div>

              <Card className="card-github border-dashed">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-white">
                    Notification filtering is moving here
                  </CardTitle>
                  <CardDescription className="text-[var(--github-text-secondary)]">
                    Next we will embed default focus levels, quick templates, and exception rules directly into
                    this tab.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <NotificationTemplateGallery
                    onSelectTemplate={handleSelectTemplate}
                    selectedTemplate={selectedTemplate}
                  />

                  <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
                    <p className="text-sm font-medium text-white">Planned modules</p>
                    <p className="mt-1 text-xs text-[var(--github-text-secondary)]">
                      Default notification level, template shortcuts, readable exception rules, and advanced preview.
                    </p>
                  </div>

                  {exceptionDraft ? (
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
                  ) : null}

                  {filterRulesQuery.error ? (
                    <Alert className="border-destructive/40 bg-destructive/10 text-white">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>{t('notifications.settings.rules.errorTitle')}</AlertTitle>
                      <AlertDescription>
                        {filterRulesQuery.error.message || t('notifications.settings.rules.errorDescription')}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <NotificationExceptionRuleList
                    isDeleting={deleteFilterRuleMutation.isPending}
                    isLoading={filterRulesQuery.isLoading}
                    onEdit={handleEditExceptionRule}
                    onRemove={handleRemoveExceptionRule}
                    rules={exceptionRules}
                  />
                </CardContent>
              </Card>

              <Button
                onClick={handleSaveNotifications}
                disabled={notifSaving}
                className="btn-x-primary gap-2"
              >
                {notifSaving && <Spinner className="h-4 w-4" />}
                {notifSaved ? <CheckCircle className="w-4 h-4" /> : null}
                {notifSaving ? 'Saving...' : notifSaved ? 'Saved!' : 'Save Notification Settings'}
              </Button>
            </>
          )}
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <Card className="card-github">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white">Connected Accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {connectedAccounts.map((account) => {
                const Icon = account.icon;
                return (
                  <div key={account.provider} className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-[var(--github-surface)] flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{account.provider}</p>
                        <p className="text-xs text-[var(--github-text-secondary)]">{account.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {account.connected ? (
                        <>
                          <Badge className="bg-green-400/20 text-green-400">Connected</Badge>
                          <Button variant="outline" size="sm" className="border-[var(--github-border)] text-red-400 hover:text-red-400">
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" className="btn-x-primary">
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="card-github">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-white">API Keys</CardTitle>
                <Button size="sm" className="btn-x-primary gap-2">
                  <Key className="w-4 h-4" />
                  Generate New Key
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.name} className="p-4 rounded-lg bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-white">{apiKey.name}</p>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-400">
                      Revoke
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--github-text-secondary)]">
                    <code className="px-2 py-1 rounded bg-[var(--github-surface)]">{apiKey.key}</code>
                    <span>Created: {apiKey.created}</span>
                    <span>Last used: {apiKey.lastUsed}</span>
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
              <CardTitle className="text-base font-semibold text-white">Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current" className="text-sm text-white">Current Password</Label>
                <Input
                  id="current"
                  type="password"
                  className="bg-[var(--github-surface)] border-[var(--github-border)]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new" className="text-sm text-white">New Password</Label>
                <Input
                  id="new"
                  type="password"
                  className="bg-[var(--github-surface)] border-[var(--github-border)]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-sm text-white">Confirm New Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  className="bg-[var(--github-surface)] border-[var(--github-border)]"
                />
              </div>
              <Button className="btn-x-primary">Update Password</Button>
            </CardContent>
          </Card>

          <Card className="card-github border-red-400/30">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-red-400/5 border border-red-400/20">
                <div>
                  <p className="text-sm font-medium text-white">Delete Account</p>
                  <p className="text-xs text-[var(--github-text-secondary)]">
                    Permanently delete your account and all data
                  </p>
                </div>
                <Button variant="outline" className="border-red-400 text-red-400 hover:bg-red-400/10">
                  Delete Account
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
                AI Provider Configuration
              </CardTitle>
              <CardDescription className="text-[var(--github-text-secondary)]">
                Configure your AI provider for code analysis
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
                    <Label htmlFor="aiProvider" className="text-sm text-white">AI Provider</Label>
                    <Select
                      value={aiConfig.aiProvider || ''}
                      onValueChange={(value: AIProvider) => setAiConfig({ ...aiConfig, aiProvider: value, aiBaseUrl: undefined })}
                    >
                      <SelectTrigger className="bg-[var(--github-surface)] border-[var(--github-border)]">
                        <SelectValue placeholder="Select an AI provider" />
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
                        <SelectItem value="custom">
                          <div className="flex items-center gap-2">
                            <img src={getProviderLogo('custom')} alt="" className="w-5 h-5" />
                            <span>{PROVIDER_LABELS.custom}</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* API Key - show for all providers except custom */}
                  {(aiConfig.aiProvider && aiConfig.aiProvider !== 'custom') && (
                    <div className="space-y-2">
                      <Label htmlFor="aiApiKey" className="text-sm text-white">API Key</Label>
                      <Input
                        id="aiApiKey"
                        type="password"
                        placeholder={aiConfig.aiApiKey ? '***' : 'Enter your API key'}
                        value={aiConfig.aiApiKey || ''}
                        onChange={(e) => setAiConfig({ ...aiConfig, aiApiKey: e.target.value })}
                        className="bg-[var(--github-surface)] border-[var(--github-border)]"
                      />
                      <p className="text-xs text-[var(--github-text-secondary)]">
                        Leave empty to keep the existing API key
                      </p>
                    </div>
                  )}

                  {/* Base URL - show for custom */}
                  {aiConfig.aiProvider === 'custom' && (
                    <div className="space-y-2">
                      <Label htmlFor="aiBaseUrl" className="text-sm text-white">Base URL</Label>
                      <Input
                        id="aiBaseUrl"
                        type="url"
                        placeholder="https://api.example.com/v1"
                        value={aiConfig.aiBaseUrl || ''}
                        onChange={(e) => setAiConfig({ ...aiConfig, aiBaseUrl: e.target.value })}
                        className="bg-[var(--github-surface)] border-[var(--github-border)]"
                      />
                    </div>
                  )}

                  {/* Endpoint Preview */}
                  {aiConfig.aiProvider && (
                    <div className="p-3 rounded-lg bg-white/5 border border-[var(--github-border)]">
                      <p className="text-xs text-[var(--github-text-secondary)] mb-1">Endpoint Preview</p>
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
                      {testingConnection ? 'Testing...' : 'Test Connection'}
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
                    <Label htmlFor="aiModel" className="text-sm text-white">Model</Label>
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
                        {fetchingModels ? 'Fetching...' : 'Fetch Models from Provider'}
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
                          <Label className="text-sm text-white">Available Models</Label>
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
                                  Use
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
                    {aiSaving ? 'Saving...' : aiSaved ? 'Saved!' : 'Save AI Config'}
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
