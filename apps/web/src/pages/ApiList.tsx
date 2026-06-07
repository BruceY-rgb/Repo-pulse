import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  Layers3,
  RefreshCcw,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useApiQuery } from '@/lib/query-hooks';
import { getApiBaseUrl, toApiUrl } from '@/lib/desktop';
import { apiDocsService, type OpenApiDocument, type OpenApiOperation } from '@/services/api-docs.service';

const METHOD_META: Record<string, { label: string; className: string }> = {
  get: { label: 'GET', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  post: { label: 'POST', className: 'bg-sky-500/15 text-sky-300 border-sky-500/25' },
  put: { label: 'PUT', className: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  patch: { label: 'PATCH', className: 'bg-violet-500/15 text-violet-300 border-violet-500/25' },
  delete: { label: 'DELETE', className: 'bg-rose-500/15 text-rose-300 border-rose-500/25' },
  options: { label: 'OPTIONS', className: 'bg-slate-500/15 text-slate-300 border-slate-500/25' },
  head: { label: 'HEAD', className: 'bg-slate-500/15 text-slate-300 border-slate-500/25' },
};

function groupOperations(document: OpenApiDocument) {
  const groups = new Map<string, Array<{ path: string; method: string; operation: OpenApiOperation }>>();

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of Object.keys(pathItem) as Array<keyof typeof pathItem>) {
      const operation = pathItem[method];
      if (!operation) continue;

      const tag = operation.tags?.[0] ?? path.split('/').filter(Boolean)[0] ?? 'Other';
      const groupName = tag.replace(/^\w/, (char) => char.toUpperCase());
      const current = groups.get(groupName) ?? [];
      current.push({ path, method, operation });
      groups.set(groupName, current);
    }
  }

  return Array.from(groups.entries())
    .map(([tag, items]) => ({
      tag,
      items: items.sort((left, right) => {
        if (left.path === right.path) {
          return left.method.localeCompare(right.method);
        }
        return left.path.localeCompare(right.path);
      }),
    }))
    .sort((left, right) => left.tag.localeCompare(right.tag));
}

export function ApiList() {
  const navigate = useNavigate();
  const docsQuery = useApiQuery({
    queryKey: ['api-docs'],
    queryFn: () => apiDocsService.getOpenApiDocument(),
    staleTime: 5 * 60 * 1000,
  });

  const groups = useMemo(() => {
    if (!docsQuery.data) {
      return [];
    }
    return groupOperations(docsQuery.data);
  }, [docsQuery.data]);

  const totalEndpoints = useMemo(
    () => groups.reduce((sum, group) => sum + group.items.length, 0),
    [groups],
  );

  return (
    <div className="min-h-screen bg-[var(--github-bg)] px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-[var(--github-border)] bg-[radial-gradient(circle_at_top_left,_rgba(255,77,0,0.18),_transparent_35%),linear-gradient(180deg,rgba(22,27,34,0.98),rgba(13,17,23,0.98))] p-6 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--github-border)] bg-white/5 px-3 py-1 text-xs text-[var(--github-text-secondary)]">
                <BookOpen className="h-3.5 w-3.5 text-[var(--github-accent)]" />
                API List
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
                Repo-Pulse API Overview
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-[var(--github-text-secondary)] md:text-base">
                This page is generated from the backend Swagger document, so the endpoint list stays aligned with the live API surface.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="border-[var(--github-border)] gap-2"
                onClick={() => docsQuery.refetch()}
                disabled={docsQuery.isFetching}
              >
                <RefreshCcw className={`h-4 w-4 ${docsQuery.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                className="btn-x-primary gap-2"
                onClick={() => window.open(toApiUrl('/docs'), '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-4 w-4" />
                Open Swagger UI
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="card-github border-[var(--github-border)]">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-xl bg-[var(--github-accent)]/10 p-3 text-[var(--github-accent)]">
                  <Workflow className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-[var(--github-text-secondary)]">API base</p>
                  <p className="font-medium text-white">{getApiBaseUrl()}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-github border-[var(--github-border)]">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-xl bg-sky-500/10 p-3 text-sky-300">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-[var(--github-text-secondary)]">Groups</p>
                  <p className="font-medium text-white">{groups.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-github border-[var(--github-border)]">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-[var(--github-text-secondary)]">Endpoints</p>
                  <p className="font-medium text-white">{totalEndpoints}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {docsQuery.isLoading ? (
          <Card className="card-github">
            <CardContent className="flex items-center justify-center p-12">
              <Spinner className="h-6 w-6 text-[var(--github-accent)]" />
            </CardContent>
          </Card>
        ) : docsQuery.isError ? (
          <Card className="card-github border-red-400/30">
            <CardContent className="space-y-4 p-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Failed to load API docs</h2>
                <p className="mt-1 text-sm text-[var(--github-text-secondary)]">
                  The page could not load `/docs-json`. Make sure the backend is running and Swagger is enabled.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="border-[var(--github-border)]" onClick={() => docsQuery.refetch()}>
                  Retry
                </Button>
                <Button className="btn-x-primary" onClick={() => navigate('/workbench')}>
                  Back to Workbench
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <Card key={group.tag} className="card-github">
                <CardHeader className="border-b border-[var(--github-border)]/80 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl text-white">{group.tag}</CardTitle>
                      <p className="mt-1 text-sm text-[var(--github-text-secondary)]">
                        {group.items.length} endpoints
                      </p>
                    </div>
                    <Badge className="rounded-full bg-[var(--github-accent)]/15 text-[var(--github-accent)]">
                      {group.items.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4 md:p-6">
                  {group.items.map(({ path, method, operation }) => {
                    const meta = METHOD_META[method] ?? METHOD_META.get;
                    return (
                      <div
                        key={`${method}-${path}`}
                        className="rounded-2xl border border-[var(--github-border)]/80 bg-white/[0.02] p-4 transition-colors hover:border-[var(--github-accent)]/30 hover:bg-white/[0.04]"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={`rounded-full border ${meta.className}`}>{meta.label}</Badge>
                              {operation.deprecated ? (
                                <Badge variant="outline" className="rounded-full border-red-400/30 text-red-300">
                                  Deprecated
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="rounded-lg border border-[var(--github-border)] bg-[var(--github-surface)] px-2 py-1 text-sm text-white">
                                {path}
                              </code>
                              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--github-text-secondary)]" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-base font-medium text-white">
                                {operation.summary ?? operation.operationId ?? `${method.toUpperCase()} ${path}`}
                              </p>
                              <p className="text-sm leading-6 text-[var(--github-text-secondary)]">
                                {operation.description ?? 'No description provided in Swagger metadata.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
