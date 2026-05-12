import { Badge } from '@/components/ui/badge';

const categoryLabels: Record<string, string> = {
  FEATURE: 'Feature',
  BUGFIX: 'Bug Fix',
  REFACTOR: 'Refactor',
  DOCS: 'Docs',
  TEST: 'Test',
  DEPENDENCY: 'Dependency',
  SECURITY: 'Security',
  RELEASE: 'Release',
  UNKNOWN: 'Unknown',
};

interface CategoryBadgeProps {
  category: string;
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <Badge variant="secondary" className="text-xs">
      {categoryLabels[category] ?? category}
    </Badge>
  );
}
