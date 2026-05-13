import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import { cn } from '@/lib/utils';
import type { Event, Repository } from '@/types/api';

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

function authorFallback(author: string): string {
  return author.trim().charAt(0).toUpperCase() || 'U';
}

function avatarUrlForAuthor(author: string, authorAvatar?: string | null): string | undefined {
  if (authorAvatar) return authorAvatar;

  const login = author.trim();
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) {
    return undefined;
  }

  return `https://github.com/${encodeURIComponent(login)}.png`;
}

function linkifyBareUrls(markdown: string): string {
  return markdown.replace(
    /(^|\s)((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,!?;:'"`])/g,
    (match, prefix: string, url: string) => {
      const href = url.startsWith('www.') ? `https://${url}` : url;
      return `${prefix}[${url}](${href})`;
    },
  );
}

const RAW_HTML_START = /<(details|summary|p|ul|ol|li|h[1-6]|a|blockquote|code|pre|strong|em|br|hr)\b/i;
const ALLOWED_HTML_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'details',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'summary',
  'ul',
]);
const ALLOWED_HTML_ATTRS = new Set(['href', 'title', 'open']);

function isSafeUrl(value: string): boolean {
  return /^(https?:|mailto:|#|\/)/i.test(value);
}

function sanitizeGithubHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');

  const sanitizeNode = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        const tagName = element.tagName.toLowerCase();

        if (!ALLOWED_HTML_TAGS.has(tagName)) {
          element.replaceWith(...Array.from(element.childNodes));
          return;
        }

        Array.from(element.attributes).forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          const value = attribute.value;

          if (!ALLOWED_HTML_ATTRS.has(name) || name.startsWith('on')) {
            element.removeAttribute(attribute.name);
            return;
          }

          if (name === 'href' && !isSafeUrl(value)) {
            element.removeAttribute(attribute.name);
          }
        });

        if (tagName === 'a') {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noreferrer');
        }

        sanitizeNode(element);
      }
    });
  };

  sanitizeNode(doc.body);
  return doc.body.firstElementChild?.innerHTML ?? '';
}

function MarkdownRenderer({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ ...props }) => (
          <a
            {...props}
            className="text-[#58a6ff] underline decoration-[#58a6ff]/40 underline-offset-2 transition-colors hover:text-[#79c0ff] hover:decoration-[#79c0ff]"
            target="_blank"
            rel="noreferrer"
          />
        ),
        img: ({ ...props }) => (
          <img
            {...props}
            className="my-2 max-h-20 max-w-full rounded border border-border bg-background object-contain"
          />
        ),
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes('language-');
          if (isBlock) {
            return (
              <code
                {...props}
                className="block overflow-x-auto rounded-md bg-background px-3 py-2 text-xs text-foreground"
              >
                {children}
              </code>
            );
          }

          return (
            <code
              {...props}
              className="rounded bg-background px-1 py-0.5 text-[0.92em] text-foreground"
            >
              {children}
            </code>
          );
        },
      }}
    >
      {linkifyBareUrls(children)}
    </ReactMarkdown>
  );
}

function MarkdownBubble({ children }: { children: string }) {
  const htmlStart = children.search(RAW_HTML_START);

  if (htmlStart === -1) {
    return <MarkdownRenderer>{children}</MarkdownRenderer>;
  }

  const markdownPrefix = children.slice(0, htmlStart).trim();
  const htmlContent = children.slice(htmlStart);

  return (
    <>
      {markdownPrefix && <MarkdownRenderer>{markdownPrefix}</MarkdownRenderer>}
      <div
        className="github-html [&_a]:text-[#58a6ff] [&_a]:underline [&_a]:decoration-[#58a6ff]/40 [&_a]:underline-offset-2 [&_a:hover]:text-[#79c0ff] [&_a:hover]:decoration-[#79c0ff] [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_details]:my-2 [&_details]:rounded-lg [&_details]:border [&_details]:border-border [&_details]:bg-background/40 [&_details]:px-3 [&_details]:py-2 [&_summary]:cursor-pointer [&_summary]:font-medium"
        dangerouslySetInnerHTML={{ __html: sanitizeGithubHtml(htmlContent) }}
      />
    </>
  );
}

function isLongMessage(markdown: string): boolean {
  return markdown.length > 1200 || markdown.split(/\r?\n/).length > 18;
}

function hasTruncatedMarker(markdown: string): boolean {
  return /(?:\.\.\.\s*)?\(?\[?truncated\]?\)?/i.test(markdown);
}

function extractFullChangelogUrl(markdown: string): string | null {
  const htmlChangelogMatch = markdown.match(
    /full\s+changelog[\s\S]{0,400}?<a\s+href="([^"]+)"/i,
  );
  if (htmlChangelogMatch?.[1]) {
    return htmlChangelogMatch[1];
  }

  const fullChangelogMatch = markdown.match(
    /full\s+changelog\s*:?\s*(https?:\/\/[^\s<>()"']+)/i,
  );

  return fullChangelogMatch?.[1] ?? null;
}

function fullSourceUrlForEvent(event: Event, markdown: string): string | null {
  return extractFullChangelogUrl(markdown) ?? event.externalUrl ?? null;
}

function EventMessage({ event }: { event: Event }) {
  const [expanded, setExpanded] = useState(false);
  const risk = getRiskLevel(event.type);
  const markdown = [event.title, event.body].filter(Boolean).join('\n\n');
  const shouldCollapse = isLongMessage(markdown);
  const isTruncated = hasTruncatedMarker(markdown);
  const sourceUrl = isTruncated ? fullSourceUrlForEvent(event, markdown) : null;

  return (
    <article className="group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-secondary/30">
      <Avatar className="h-9 w-9 shrink-0 rounded-lg">
        <AvatarImage
          src={avatarUrlForAuthor(event.author, event.authorAvatar)}
          className="object-cover"
        />
        <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
          {authorFallback(event.author)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold text-foreground">
            {event.author || 'unknown'}
          </span>
          {event.occurredAt && (
            <span className="text-xs text-muted-foreground">
              {formatTime(event.occurredAt)}
            </span>
          )}
          <Badge
            variant={riskBadgeVariant(risk)}
            className="h-4 px-1.5 py-0 text-[10px]"
          >
            {risk}
          </Badge>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {event.type.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="max-w-3xl rounded-xl rounded-tl-sm border border-border bg-card/80 px-4 py-3 shadow-sm">
          <div className="relative">
            <div
              className={cn(
                'prose prose-invert max-w-none text-sm leading-relaxed prose-p:my-2 prose-headings:my-2 prose-headings:text-foreground prose-strong:text-foreground prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-transparent prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none',
                shouldCollapse && !expanded && 'max-h-72 overflow-hidden',
              )}
            >
              <MarkdownBubble>{markdown}</MarkdownBubble>
            </div>
            {shouldCollapse && !expanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card via-card/90 to-transparent" />
            )}
          </div>
          {shouldCollapse && (
            <button
              type="button"
              className="mt-3 text-sm font-medium text-[#58a6ff] transition-colors hover:text-[#79c0ff] hover:underline"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          {isTruncated && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>This message was truncated upstream.</span>
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#58a6ff] underline decoration-[#58a6ff]/40 underline-offset-2 transition-colors hover:text-[#79c0ff]"
                >
                  View full changelog
                </a>
              ) : (
                <span className="text-muted-foreground">
                  No source link was provided.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
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
      <ScrollArea className="min-h-0 flex-1">
        {events.length === 0 ? (
          <EmptyState repo={repo} />
        ) : (
          <div className="py-2">
            {events.map((event) => (
              <EventMessage key={event.id} event={event} />
            ))}
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
