import type { Event } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface EventContextChipsProps {
  event?: Pick<
    Event,
    'type' | 'branch' | 'sourceBranch' | 'targetBranch' | 'branches' | 'repository'
  > | null;
  className?: string;
}

export function formatEventType(type?: string | null) {
  if (!type) {
    return null;
  }

  return type
    .toLowerCase()
    .split('_')
    .map((part, index) => (index === 0 ? part.toUpperCase() : part))
    .join(' ');
}

export function buildBranchLabels(
  event?: Pick<Event, 'branch' | 'sourceBranch' | 'targetBranch' | 'branches'> | null,
) {
  if (!event) {
    return [];
  }

  const labels: string[] = [];
  const branches = event.branches ?? [];
  const formatBranchList = (values: string[]) => {
    const visibleBranches = values.slice(0, 2);
    const hiddenCount = values.length - visibleBranches.length;
    return hiddenCount > 0
      ? `${visibleBranches.join(', ')} +${hiddenCount}`
      : visibleBranches.join(', ');
  };

  if (event.sourceBranch && event.targetBranch) {
    labels.push(`${event.sourceBranch} -> ${event.targetBranch}`);
  } else if (branches.length > 1) {
    labels.push(`branches: ${formatBranchList(branches)}`);
  } else if (branches.length === 1) {
    labels.push(`branch: ${branches[0]}`);
  } else if (event.targetBranch) {
    labels.push(`target: ${event.targetBranch}`);
  } else if (event.branch) {
    labels.push(`branch: ${event.branch}`);
  }

  return labels;
}

export function EventContextChips({ event, className }: EventContextChipsProps) {
  const repositoryName = event?.repository?.fullName || event?.repository?.name;
  const eventType = formatEventType(event?.type);
  const branchLabels = buildBranchLabels(event);

  if (!repositoryName && !eventType && branchLabels.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex min-w-0 max-w-full flex-wrap items-center gap-2', className)}>
      {repositoryName ? (
        <Badge
          variant="outline"
          className="min-w-0 max-w-full border-[var(--github-accent)]/25 bg-[var(--github-accent)]/8 text-[var(--github-accent)]"
        >
          <span className="truncate font-mono text-[11px]">{repositoryName}</span>
        </Badge>
      ) : null}

      {branchLabels.map((label) => (
        <Badge
          key={label}
          variant="outline"
          className="min-w-0 max-w-full border-border/80 bg-muted/35 text-muted-foreground"
        >
          <span className="truncate">{label}</span>
        </Badge>
      ))}

      {eventType ? (
        <Badge
          variant="outline"
          className="border-border/80 bg-transparent text-muted-foreground"
        >
          {eventType}
        </Badge>
      ) : null}
    </div>
  );
}
