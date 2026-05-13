import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Bell,
  LayoutDashboard,
  Lock,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { useRepositoryListQuery } from '@/hooks/queries/use-repository-queries';
import { useDashboardRecentEventsQuery } from '@/hooks/queries/use-dashboard-queries';
import type { Repository } from '@/types/api';

function avatarUrlForRepo(repo: Repository): string {
  const owner = repo.fullName.split('/')[0];
  if (!owner) return '';
  return `https://github.com/${owner}.png`;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const GRADIENT_PAIRS: [string, string][] = [
  ['#3b1d5c', '#5c2d91'],
  ['#1a3a5c', '#2d6ba0'],
  ['#3b5c1d', '#5c912d'],
  ['#5c1a1a', '#a02d2d'],
  ['#1a5c4b', '#2d9178'],
  ['#5c4b1a', '#91782d'],
  ['#2d1a5c', '#4b2d91'],
  ['#1a5c5c', '#2d9191'],
];

function repoGradient(fullName: string): string {
  const idx = hashString(fullName) % GRADIENT_PAIRS.length;
  const [from, to] = GRADIENT_PAIRS[idx];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

function getRiskLevel(type: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const lower = type.toLowerCase();
  if (lower.includes('security') || lower.includes('failed') || lower.includes('critical')) {
    return 'HIGH';
  }
  if (lower.includes('update') || lower.includes('change') || lower.includes('review')) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function riskBadgeVariant(level: 'HIGH' | 'MEDIUM' | 'LOW'): 'destructive' | 'default' | 'secondary' | 'outline' {
  if (level === 'HIGH') return 'destructive';
  if (level === 'MEDIUM') return 'default';
  return 'secondary';
}

function formatTime(dateString?: string): string {
  if (!dateString) return '';
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

function EmptyState({ repo }: { repo: Repository }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <Avatar className="h-16 w-16 rounded-xl mb-4">
        <AvatarImage src={avatarUrlForRepo(repo)} className="object-cover" />
        <AvatarFallback
          className="rounded-xl text-white text-2xl font-bold"
          style={{ background: repoGradient(repo.fullName) }}
        >
          {repo.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <h2 className="text-lg font-semibold text-foreground">{repo.name}</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Repository events will appear here once webhooks are connected.
      </p>
    </div>
  );
}

export function AgentRoom() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const reposQuery = useRepositoryListQuery();
  const [inputValue, setInputValue] = useState('');

  const repo = useMemo(() => {
    if (!conversationId || !reposQuery.data) return null;
    return reposQuery.data.find((r) => r.id === conversationId) ?? null;
  }, [conversationId, reposQuery.data]);

  const recentEventsQuery = useDashboardRecentEventsQuery(
    conversationId ? [conversationId] : [],
    undefined,
  );

  const events = useMemo(() => {
    if (!recentEventsQuery.data?.items) return [];
    return recentEventsQuery.data.items;
  }, [recentEventsQuery.data]);

  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <h2 className="text-lg font-semibold text-foreground">Chats</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Select a repository conversation to view its event stream.
        </p>
      </div>
    );
  }

  if (reposQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-muted-foreground">Repository not found.</p>
      </div>
    );
  }

  const gradient = repoGradient(repo.fullName);
  const owner = repo.fullName.split('/')[0];
  const isPrivate = owner.length < 10;
  const eventCount = repo._count?.events ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-card/50">
        <Avatar className="h-9 w-9 shrink-0 rounded-lg">
          <AvatarImage src={avatarUrlForRepo(repo)} className="object-cover" />
          <AvatarFallback
            className="rounded-lg text-white text-sm font-semibold"
            style={{ background: gradient }}
          >
            {repo.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {repo.name}
            </h2>
            {isPrivate ? (
              <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <Users className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {isPrivate ? 'Private' : 'Channel'}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {repo.fullName}
            {eventCount > 0 && ` - ${eventCount} events`}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <Link to="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Event stream */}
      <ScrollArea className="flex-1">
        {events.length === 0 ? (
          <EmptyState repo={repo} />
        ) : (
          <div className="divide-y divide-border">
            {events.map((event) => {
              const risk = getRiskLevel(event.type);
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors"
                >
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                    <span className="text-xs font-bold text-muted-foreground">
                      {event.type.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={riskBadgeVariant(risk)}
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        {risk}
                      </Badge>
                      <span className="text-sm font-medium text-foreground truncate">
                        {event.title}
                      </span>
                    </div>
                    {event.body && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {event.body}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {event.occurredAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(event.occurredAt)}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground uppercase">
                        {event.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Bottom input */}
      <div className="shrink-0 border-t border-border px-4 py-3 bg-card/50">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (inputValue.trim()) {
              setInputValue('');
            }
          }}
        >
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Send a message..."
            className="flex-1 h-9 text-sm border-border bg-background"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!inputValue.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
