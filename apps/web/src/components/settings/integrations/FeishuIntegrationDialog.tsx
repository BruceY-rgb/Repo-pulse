import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Clipboard,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  imService,
  type FeishuConnectionStatus,
  type FeishuConnectionTestResult,
  type ImStageStatus,
  type ImSubscription,
  type PairingCodeResult,
} from '@/services/im.service';

interface FeishuIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectionChange?: (connected: boolean) => void;
}

const DEFAULT_EVENTS = ['highRisk', 'prUpdates', 'analysisComplete'];

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }

  if (error instanceof Error) return error.message;
  return 'Request failed';
}

function isConnected(status: FeishuConnectionStatus | null): boolean {
  return Boolean(status?.connected || status?.state === 'connected' || status?.state === 'ready');
}

function buildFallbackStages(status: FeishuConnectionStatus | null): ImStageStatus[] {
  if (status?.stages?.length) return status.stages;

  return [
    {
      id: 'configured',
      state: status?.state && status.state !== 'not_configured' ? 'verified' : 'missing',
    },
    {
      id: 'credential_valid',
      state: isConnected(status) ? 'verified' : 'unknown',
    },
    {
      id: 'ws_connected',
      state: status?.state === 'ready' || status?.state === 'connected' ? 'verified' : 'unknown',
    },
    {
      id: 'bot_reachable',
      state: status?.state === 'ready' ? 'verified' : 'unknown',
    },
    {
      id: 'subscription_ready',
      state: 'unknown',
    },
  ];
}

export function FeishuIntegrationDialog({
  open,
  onOpenChange,
  onConnectionChange,
}: FeishuIntegrationDialogProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('credentials');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [status, setStatus] = useState<FeishuConnectionStatus | null>(null);
  const [testResult, setTestResult] = useState<FeishuConnectionTestResult | null>(null);
  const [pairingCode, setPairingCode] = useState<PairingCodeResult | null>(null);
  const [subscriptions, setSubscriptions] = useState<ImSubscription[]>([]);
  const [branchDraft, setBranchDraft] = useState('main');
  const [guideOpen, setGuideOpen] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [savingSubscriptions, setSavingSubscriptions] = useState(false);
  const [statusError, setStatusError] = useState('');

  const stages = useMemo(() => buildFallbackStages(status), [status]);
  const connected = isConnected(status);
  const canSubmitCredentials = appId.trim().length > 0 && appSecret.trim().length > 0;

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoadingStatus(true);
      setStatusError('');
      try {
        const [nextStatus, nextSubscriptions] = await Promise.all([
          imService.getImStatus(),
          imService.listSubscriptions().catch(() => []),
        ]);
        const feishuStatus = nextStatus.feishu ?? null;
        setStatus(feishuStatus);
        setAppId(feishuStatus?.appId ?? '');
        setSubscriptions(nextSubscriptions);
        onConnectionChange?.(isConnected(feishuStatus));
      } catch (error) {
        setStatusError(getErrorMessage(error));
        setStatus(null);
        onConnectionChange?.(false);
      } finally {
        setLoadingStatus(false);
      }
    };

    void load();
  }, [onConnectionChange, open]);

  const saveCredentials = async () => {
    if (!canSubmitCredentials) {
      toast.error(t('settings.integrations.feishu.validation'));
      return;
    }

    setSaving(true);
    try {
      const nextStatus = await imService.saveFeishuConnection({
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      });
      setStatus(nextStatus);
      setTestResult(null);
      onConnectionChange?.(isConnected(nextStatus));
      toast.success(t('settings.integrations.feishu.saved'));
      setActiveTab('test');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!canSubmitCredentials) {
      toast.error(t('settings.integrations.feishu.validation'));
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await imService.testFeishuConnection({
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      });
      setTestResult(result);
      const nextStatus = {
        provider: 'feishu' as const,
        appId: appId.trim(),
        state: result.state,
        connected: result.success,
        summary: result.message,
        nextStep: result.nextStep,
        stages: result.stages,
      };
      setStatus(nextStatus);
      onConnectionChange?.(result.success);
      toast[result.success ? 'success' : 'error'](result.message);
    } catch (error) {
      const message = getErrorMessage(error);
      setTestResult({
        success: false,
        state: 'error',
        message,
        nextStep: t('settings.integrations.feishu.nextStepSecret'),
      });
      onConnectionChange?.(false);
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const createPairingCode = async () => {
    setPairing(true);
    try {
      const result = await imService.createPairingCode();
      setPairingCode(result);
      setActiveTab('binding');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPairing(false);
    }
  };

  const copyPairingCommand = async () => {
    if (!pairingCode?.code) return;
    await navigator.clipboard.writeText(`/bind ${pairingCode.code}`);
    toast.success(t('settings.integrations.feishu.copied'));
  };

  const saveSubscriptions = async () => {
    const draftSubscription: ImSubscription = subscriptions[0] ?? {
      id: 'default',
      chatName: t('settings.integrations.feishu.defaultChat'),
      repositoryIds: [],
      branches: [],
      events: DEFAULT_EVENTS,
      enabled: true,
    };
    const branches = branchDraft
      .split(',')
      .map((branch) => branch.trim())
      .filter(Boolean);

    setSavingSubscriptions(true);
    try {
      const nextSubscriptions = await imService.saveSubscriptions({
        subscriptions: [{ ...draftSubscription, branches }],
      });
      setSubscriptions(nextSubscriptions);
      toast.success(t('settings.integrations.feishu.subscriptionSaved'));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingSubscriptions(false);
    }
  };

  const toggleEvent = (eventName: string) => {
    const baseSubscription: ImSubscription = subscriptions[0] ?? {
      id: 'default',
      chatName: t('settings.integrations.feishu.defaultChat'),
      repositoryIds: [],
      branches: [],
      events: DEFAULT_EVENTS,
      enabled: true,
    };
    const nextEvents = baseSubscription.events.includes(eventName)
      ? baseSubscription.events.filter((event) => event !== eventName)
      : [...baseSubscription.events, eventName];

    setSubscriptions([{ ...baseSubscription, events: nextEvents }]);
  };

  const currentSubscription = subscriptions[0];
  const selectedEvents = currentSubscription?.events ?? DEFAULT_EVENTS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--github-border)] bg-[#0d1117] text-white sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>{t('settings.integrations.feishu.title')}</DialogTitle>
            {connected ? (
              <Badge className="bg-green-400/20 text-green-400">
                {t('settings.integrations.connected')}
              </Badge>
            ) : null}
          </div>
          <DialogDescription className="text-[var(--github-text-secondary)]">
            {status?.summary || testResult?.message || t('settings.integrations.feishu.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {loadingStatus ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--github-accent)]" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 border border-[var(--github-border)] bg-[var(--github-surface)]">
              <TabsTrigger value="credentials">{t('settings.integrations.feishu.tab.credentials')}</TabsTrigger>
              <TabsTrigger value="test">{t('settings.integrations.feishu.tab.test')}</TabsTrigger>
              <TabsTrigger value="binding">{t('settings.integrations.feishu.tab.binding')}</TabsTrigger>
              <TabsTrigger value="subscriptions">{t('settings.integrations.feishu.tab.subscriptions')}</TabsTrigger>
            </TabsList>

            <TabsContent value="credentials" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="feishu-app-id">{t('settings.integrations.feishu.appId')}</Label>
                  <Input
                    id="feishu-app-id"
                    value={appId}
                    onChange={(event) => setAppId(event.target.value)}
                    className="border-[var(--github-border)] bg-[var(--github-surface)]"
                    placeholder="cli_xxxxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feishu-app-secret">{t('settings.integrations.feishu.appSecret')}</Label>
                  <Input
                    id="feishu-app-secret"
                    type="password"
                    value={appSecret}
                    onChange={(event) => setAppSecret(event.target.value)}
                    className="border-[var(--github-border)] bg-[var(--github-surface)]"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-0 text-[var(--github-accent)] hover:bg-transparent">
                    {t('settings.integrations.feishu.guide')}
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-3 text-xs leading-6 text-[var(--github-text-secondary)]">
                    <p>{t('settings.integrations.feishu.guideStep1')}</p>
                    <p>{t('settings.integrations.feishu.guideStep2')}</p>
                    <p>{t('settings.integrations.feishu.guideStep3')}</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            <TabsContent value="test" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-5">
                {stages.map((stage) => (
                  <div key={stage.id} className="rounded-lg border border-[var(--github-border)] bg-white/5 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium text-white">
                        {t(`settings.integrations.feishu.stage.${stage.id}`)}
                      </p>
                      {stage.state === 'verified' ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
                      ) : stage.state === 'error' || stage.state === 'missing' ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--github-text-secondary)]" />
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--github-text-secondary)]">
                      {stage.message || t(`settings.integrations.feishu.stageState.${stage.state}`)}
                    </p>
                  </div>
                ))}
              </div>

              {(statusError || testResult?.nextStep || status?.nextStep) ? (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                  {statusError || testResult?.nextStep || status?.nextStep}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="binding" className="space-y-4">
              <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {pairingCode?.code ? `/bind ${pairingCode.code}` : t('settings.integrations.feishu.noPairingCode')}
                    </p>
                    <p className="mt-1 text-xs text-[var(--github-text-secondary)]">
                      {pairingCode?.expiresAt
                        ? t('settings.integrations.feishu.expiresAt', { time: new Date(pairingCode.expiresAt).toLocaleTimeString() })
                        : t('settings.integrations.feishu.bindingHint')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[var(--github-border)]"
                    disabled={!pairingCode?.code}
                    onClick={copyPairingCommand}
                  >
                    <Clipboard className="mr-2 h-4 w-4" />
                    {t('settings.integrations.feishu.copy')}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="subscriptions" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="feishu-branches">{t('settings.integrations.feishu.branches')}</Label>
                <Input
                  id="feishu-branches"
                  value={branchDraft}
                  onChange={(event) => setBranchDraft(event.target.value)}
                  className="border-[var(--github-border)] bg-[var(--github-surface)]"
                  placeholder="main, release/*"
                />
              </div>

              <div className="space-y-3">
                {['highRisk', 'prUpdates', 'analysisComplete'].map((eventName) => (
                  <div key={eventName} className="flex items-center justify-between rounded-lg border border-[var(--github-border)] bg-white/5 p-3">
                    <p className="text-sm text-white">
                      {t(`settings.integrations.feishu.event.${eventName}`)}
                    </p>
                    <Switch
                      checked={selectedEvents.includes(eventName)}
                      onCheckedChange={() => toggleEvent(eventName)}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <Separator className="bg-[var(--github-border)]" />

        <DialogFooter className="gap-2">
          {activeTab === 'credentials' ? (
            <Button onClick={saveCredentials} disabled={saving || !canSubmitCredentials} className="btn-x-primary gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('settings.integrations.feishu.save')}
            </Button>
          ) : null}
          {activeTab === 'test' ? (
            <Button onClick={testConnection} disabled={testing || !canSubmitCredentials} className="btn-x-primary gap-2">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('settings.integrations.feishu.test')}
            </Button>
          ) : null}
          {activeTab === 'binding' ? (
            <Button onClick={createPairingCode} disabled={pairing} className="btn-x-primary gap-2">
              {pairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('settings.integrations.feishu.generateCode')}
            </Button>
          ) : null}
          {activeTab === 'subscriptions' ? (
            <Button onClick={saveSubscriptions} disabled={savingSubscriptions} className="btn-x-primary gap-2">
              {savingSubscriptions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('settings.integrations.feishu.saveSubscriptions')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
