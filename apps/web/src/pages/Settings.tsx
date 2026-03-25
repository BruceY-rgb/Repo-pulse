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
import { settingsService } from '@/services/settings.service';
import type { AIProvider, AIConfig } from '@/services/settings.service';

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

  // AI 配置状态
  const [aiConfig, setAiConfig] = useState<AIConfig>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);

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

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
          <Card className="card-github">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white">Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-[var(--github-text-secondary)] uppercase tracking-wider">
                  Channels
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-[var(--github-text-secondary)]" />
                      <div>
                        <p className="text-sm text-white">Email Notifications</p>
                        <p className="text-xs text-[var(--github-text-secondary)]">Receive updates via email</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-[var(--github-text-secondary)]" />
                      <div>
                        <p className="text-sm text-white">Push Notifications</p>
                        <p className="text-xs text-[var(--github-text-secondary)]">Receive push notifications</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                      <Slack className="w-5 h-5 text-[var(--github-text-secondary)]" />
                      <div>
                        <p className="text-sm text-white">Slack Integration</p>
                        <p className="text-xs text-[var(--github-text-secondary)]">Send notifications to Slack</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>

              <Separator className="bg-[var(--github-border)]" />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-[var(--github-text-secondary)] uppercase tracking-wider">
                  Event Types
                </h4>
                <div className="space-y-4">
                  {[
                    { label: 'High Risk Alerts', desc: 'Critical security and performance issues', default: true },
                    { label: 'PR Updates', desc: 'Pull request created, updated, or merged', default: true },
                    { label: 'Analysis Complete', desc: 'AI analysis finished for a PR', default: true },
                    { label: 'Weekly Reports', desc: 'Weekly code quality summary', default: false },
                    { label: 'Team Activity', desc: 'Team member actions and updates', default: false },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <div>
                        <p className="text-sm text-white">{item.label}</p>
                        <p className="text-xs text-[var(--github-text-secondary)]">{item.desc}</p>
                      </div>
                      <Switch defaultChecked={item.default} />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
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
                      value={aiConfig.aiProvider || ''}
                      onValueChange={(value: AIProvider) => setAiConfig({ ...aiConfig, aiProvider: value })}
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
                  {(aiConfig.aiProvider === 'openai' || aiConfig.aiProvider === 'anthropic') && (
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

                  {/* Base URL - show for ollama and custom */}
                  {(aiConfig.aiProvider === 'ollama' || aiConfig.aiProvider === 'custom') && (
                    <div className="space-y-2">
                      <Label htmlFor="aiBaseUrl" className="text-sm text-white">
                        {aiConfig.aiProvider === 'ollama' ? 'Ollama URL' : 'Base URL'}
                      </Label>
                      <Input
                        id="aiBaseUrl"
                        type="url"
                        placeholder={aiConfig.aiProvider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                        value={aiConfig.aiBaseUrl || ''}
                        onChange={(e) => setAiConfig({ ...aiConfig, aiBaseUrl: e.target.value })}
                        className="bg-[var(--github-surface)] border-[var(--github-border)]"
                      />
                    </div>
                  )}

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

                  <Button
                    onClick={handleSaveAI}
                    disabled={aiSaving || !aiConfig.aiProvider}
                    className="btn-x-primary gap-2"
                  >
                    {aiSaving && <Loader2 className="w-4 h-4 animate-spin" />}
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

function getModelHint(provider?: string): string {
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
