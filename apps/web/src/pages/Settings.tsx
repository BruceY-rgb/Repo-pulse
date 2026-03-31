import { useState, useEffect } from 'react';
import {
  User,
  Bell,
  Shield,
  Code,
  Github,
  Key,
  Mail,
  Smartphone,
  Slack,
  Save,
  CheckCircle,
  AlertTriangle,
  Brain,
  Loader2,
  Link,
} from 'lucide-react';
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
import { useAIConfig, useUpdateAIConfig } from '@/hooks/use-settings';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/use-notifications';
import type { AIProvider } from '@/services/settings.service';

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
  const [saved, setSaved] = useState(false);

  // React Query Hooks
  const { data: aiConfig = {}, isLoading: aiLoading } = useAIConfig();
  const { data: notifPrefs, isLoading: notifLoading, isError: notifError } = useNotificationPreferences();

  // Default values for notification preferences
  const defaultNotifPrefs = {
    channels: ['inApp'],
    events: {
      highRisk: true,
      prUpdates: true,
      analysisComplete: true,
      weeklyReport: false,
    },
  };

  // Local state for form inputs - 使用默认值初始化
  const [localAiConfig, setLocalAiConfig] = useState<{
    aiProvider?: AIProvider;
    aiApiKey?: string;
    aiBaseUrl?: string;
    aiModel?: string;
  }>({});
  const [localNotifPrefs, setLocalNotifPrefs] = useState(defaultNotifPrefs);

  // Update local state only when data is loaded (not loading and not error)
  useEffect(() => {
    if (!aiLoading && aiConfig && Object.keys(aiConfig).length > 0) {
      setLocalAiConfig(aiConfig);
    }
  }, [aiConfig, aiLoading]);

  useEffect(() => {
    // When data loads successfully, update local state
    if (!notifLoading && !notifError && notifPrefs) {
      setLocalNotifPrefs({ ...defaultNotifPrefs, ...notifPrefs });
    }
  }, [notifPrefs, notifLoading, notifError]);

  // Mutations
  const updateAIConfig = useUpdateAIConfig();
  const updateNotifPrefs = useUpdateNotificationPreferences();

  const handleSaveAI = async () => {
    try {
      await updateAIConfig.mutateAsync(localAiConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save AI config:', error);
    }
  };

  const handleSaveNotifications = async () => {
    try {
      await updateNotifPrefs.mutateAsync(localNotifPrefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const toggleChannel = (channel: string) => {
    if (!localNotifPrefs) return;
    const channels = localNotifPrefs.channels.includes(channel as any)
      ? localNotifPrefs.channels.filter((c) => c !== channel)
      : [...localNotifPrefs.channels, channel as any];
    setLocalNotifPrefs({ ...localNotifPrefs, channels });
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
              <Loader2 className="w-6 h-6 animate-spin text-[var(--github-accent)]" />
            </div>
          ) : (
            <>
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
                        checked={localNotifPrefs.channels.includes('email')}
                        onCheckedChange={() => toggleChannel('email')}
                      />
                    </div>
                    {localNotifPrefs.channels.includes('email') && (
                      <div className="ml-12 space-y-2">
                        <Input
                          placeholder="your@email.com"
                          value={localNotifPrefs.email || ''}
                          onChange={(e) => setLocalNotifPrefs({ ...localNotifPrefs, email: e.target.value })}
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
                        checked={localNotifPrefs.channels.includes('dingtalk')}
                        onCheckedChange={() => toggleChannel('dingtalk')}
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
                        checked={localNotifPrefs.channels.includes('feishu')}
                        onCheckedChange={() => toggleChannel('feishu')}
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
                        checked={localNotifPrefs.channels.includes('inApp')}
                        onCheckedChange={() => toggleChannel('inApp')}
                      />
                    </div>
                  </div>

                  {(localNotifPrefs.channels.includes('dingtalk') ||
                    localNotifPrefs.channels.includes('feishu') ||
                    localNotifPrefs.channels.includes('webhook')) && (
                    <>
                      <Separator className="bg-[var(--github-border)]" />
                      <div className="space-y-2">
                        <Label className="text-sm text-white">Webhook URL</Label>
                        <Input
                          placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx"
                          value={localNotifPrefs.webhookUrl || ''}
                          onChange={(e) => setLocalNotifPrefs({ ...localNotifPrefs, webhookUrl: e.target.value })}
                          className="bg-[var(--github-surface)] border-[var(--github-border)]"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="card-github">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-white">Event Types</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm text-white">High Risk Alerts</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">Critical security and performance issues</p>
                    </div>
                    <Switch
                      checked={localNotifPrefs.events.highRisk}
                      onCheckedChange={(checked) =>
                        setLocalNotifPrefs({ ...localNotifPrefs, events: { ...localNotifPrefs.events, highRisk: checked } })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm text-white">PR Updates</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">Pull request created, updated, or merged</p>
                    </div>
                    <Switch
                      checked={localNotifPrefs.events.prUpdates}
                      onCheckedChange={(checked) =>
                        setLocalNotifPrefs({ ...localNotifPrefs, events: { ...localNotifPrefs.events, prUpdates: checked } })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm text-white">Analysis Complete</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">AI analysis finished for a PR</p>
                    </div>
                    <Switch
                      checked={localNotifPrefs.events.analysisComplete}
                      onCheckedChange={(checked) =>
                        setLocalNotifPrefs({ ...localNotifPrefs, events: { ...localNotifPrefs.events, analysisComplete: checked } })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm text-white">Weekly Reports</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">Weekly code quality summary</p>
                    </div>
                    <Switch
                      checked={localNotifPrefs.events.weeklyReport}
                      onCheckedChange={(checked) =>
                        setLocalNotifPrefs({ ...localNotifPrefs, events: { ...localNotifPrefs.events, weeklyReport: checked } })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                onClick={handleSaveNotifications}
                disabled={updateNotifPrefs.isPending}
                className="btn-x-primary gap-2"
              >
                {updateNotifPrefs.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {saved ? <CheckCircle className="w-4 h-4" /> : null}
                {updateNotifPrefs.isPending ? 'Saving...' : saved ? 'Saved!' : 'Save Notification Settings'}
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
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--github-accent)]" />
                </div>
              ) : (
                <>
                  {/* Provider Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="aiProvider" className="text-sm text-white">AI Provider</Label>
                    <Select
                      value={localAiConfig.aiProvider || ''}
                      onValueChange={(value: AIProvider) => setLocalAiConfig({ ...localAiConfig, aiProvider: value })}
                    >
                      <SelectTrigger className="bg-[var(--github-surface)] border-[var(--github-border)]">
                        <SelectValue placeholder="Select an AI provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">
                          <div className="flex items-center gap-2">
                            <span>OpenAI (GPT-4)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="anthropic">
                          <div className="flex items-center gap-2">
                            <span>Anthropic (Claude)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="ollama">
                          <div className="flex items-center gap-2">
                            <span>Ollama (Local)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="custom">
                          <div className="flex items-center gap-2">
                            <span>Custom Endpoint</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* API Key - only show for openai and anthropic */}
                  {(localAiConfig.aiProvider === 'openai' || localAiConfig.aiProvider === 'anthropic') && (
                    <div className="space-y-2">
                      <Label htmlFor="aiApiKey" className="text-sm text-white">API Key</Label>
                      <Input
                        id="aiApiKey"
                        type="password"
                        placeholder={aiConfig.aiApiKey ? '***' : 'Enter your API key'}
                        value={localAiConfig.aiApiKey || ''}
                        onChange={(e) => setLocalAiConfig({ ...localAiConfig, aiApiKey: e.target.value })}
                        className="bg-[var(--github-surface)] border-[var(--github-border)]"
                      />
                      <p className="text-xs text-[var(--github-text-secondary)]">
                        Leave empty to keep the existing API key
                      </p>
                    </div>
                  )}

                  {/* Base URL - show for ollama and custom */}
                  {(localAiConfig.aiProvider === 'ollama' || localAiConfig.aiProvider === 'custom') && (
                    <div className="space-y-2">
                      <Label htmlFor="aiBaseUrl" className="text-sm text-white">
                        {localAiConfig.aiProvider === 'ollama' ? 'Ollama URL' : 'Base URL'}
                      </Label>
                      <Input
                        id="aiBaseUrl"
                        type="url"
                        placeholder={localAiConfig.aiProvider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                        value={localAiConfig.aiBaseUrl || ''}
                        onChange={(e) => setLocalAiConfig({ ...localAiConfig, aiBaseUrl: e.target.value })}
                        className="bg-[var(--github-surface)] border-[var(--github-border)]"
                      />
                    </div>
                  )}

                  {/* Model */}
                  <div className="space-y-2">
                    <Label htmlFor="aiModel" className="text-sm text-white">Model</Label>
                    <Input
                      id="aiModel"
                      placeholder={getDefaultModel(localAiConfig.aiProvider)}
                      value={localAiConfig.aiModel || ''}
                      onChange={(e) => setLocalAiConfig({ ...localAiConfig, aiModel: e.target.value })}
                      className="bg-[var(--github-surface)] border-[var(--github-border)]"
                    />
                    <p className="text-xs text-[var(--github-text-secondary)]">
                      {getModelHint(localAiConfig.aiProvider)}
                    </p>
                  </div>

                  <Button
                    onClick={handleSaveAI}
                    disabled={updateAIConfig.isPending || !localAiConfig.aiProvider}
                    className="btn-x-primary gap-2"
                  >
                    {updateAIConfig.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saved ? <CheckCircle className="w-4 h-4" /> : null}
                    {updateAIConfig.isPending ? 'Saving...' : saved ? 'Saved!' : 'Save AI Config'}
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
function getDefaultModel(provider?: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4';
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'ollama':
      return 'llama3';
    case 'custom':
      return 'gpt-4';
    default:
      return '';
  }
}

function getModelHint(provider?: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'e.g., gpt-4, gpt-4-turbo, gpt-3.5-turbo';
    case 'anthropic':
      return 'e.g., claude-sonnet-4-20250514, claude-opus-4-20250514, claude-3-5-sonnet-20241022';
    case 'ollama':
      return 'e.g., llama3, mistral, codellama';
    case 'custom':
      return 'Enter the model name supported by your custom endpoint';
    default:
      return 'Select a provider first';
  }
}