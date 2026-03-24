import { useState, useEffect } from 'react';
import { Search, FileText, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSectionChange: (section: string) => void;
}

interface SearchResult {
  id: string;
  title: string;
  description: string;
  section: string;
}

const searchData: SearchResult[] = [
  { id: 'overview', title: 'Overview', description: 'Introduction to Repo-Pulse platform', section: 'overview' },
  { id: 'user-personas', title: 'User Personas', description: 'Target users and their needs', section: 'user-personas' },
  { id: 'pain-points', title: 'Pain Points', description: 'Problems we aim to solve', section: 'pain-points' },
  { id: 'market-research', title: 'Market Research', description: 'Competitive analysis and market trends', section: 'market-research' },
  { id: 'data-listening', title: 'Data Listening', description: 'Real-time repository monitoring', section: 'data-listening' },
  { id: 'ai-analysis', title: 'AI Analysis Engine', description: 'Intelligent code analysis and summarization', section: 'ai-analysis' },
  { id: 'filtering', title: 'Filtering & Subscription', description: 'Customizable content filtering', section: 'filtering' },
  { id: 'approval', title: 'Approval Workflow', description: 'Team review and approval process', section: 'approval' },
  { id: 'notification', title: 'Smart Notification', description: 'Intelligent notification routing', section: 'notification' },
  { id: 'dashboard', title: 'Dashboard & Analytics', description: 'Visual insights and metrics', section: 'dashboard' },
  { id: 'reporting', title: 'Auto Reporting', description: 'Automated report generation', section: 'reporting' },
  { id: 'comparison', title: 'Repo Comparison', description: 'Compare multiple repositories', section: 'comparison' },
  { id: 'system-design', title: 'System Design', description: 'High-level architecture overview', section: 'system-design' },
  { id: 'tech-stack', title: 'Tech Stack', description: 'Technology choices and rationale', section: 'tech-stack' },
  { id: 'data-flow', title: 'Data Flow', description: 'How data moves through the system', section: 'data-flow' },
  { id: 'personal-mode', title: 'Personal Mode', description: 'For individual developers', section: 'personal-mode' },
  { id: 'team-mode', title: 'Team Mode', description: 'For development teams', section: 'team-mode' },
  { id: 'manager-mode', title: 'Manager Mode', description: 'For engineering managers', section: 'manager-mode' },
  { id: 'roadmap', title: 'Roadmap', description: 'Development timeline and milestones', section: 'roadmap' },
  { id: 'glossary', title: 'Glossary', description: 'Key terms and definitions', section: 'glossary' },
  { id: 'references', title: 'References', description: 'External resources and citations', section: 'references' },
];

export function SearchDialog({ isOpen, onClose, onSectionChange }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredResults = query
    ? searchData.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase())
      )
    : searchData;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredResults.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredResults[selectedIndex]) {
            onSectionChange(filteredResults[selectedIndex].section);
            onClose();
            setQuery('');
          }
          break;
        case 'Escape':
          onClose();
          setQuery('');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredResults, selectedIndex, onSectionChange, onClose]);

  const handleSelect = (result: SearchResult) => {
    onSectionChange(result.section);
    onClose();
    setQuery('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="sr-only">Search Documentation</DialogTitle>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search documentation..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex h-8 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-xs font-medium">
              ESC
            </kbd>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-2">
            {filteredResults.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No results found for &quot;{query}&quot;
              </div>
            ) : (
              <div className="space-y-1">
                {filteredResults.map((result, index) => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2 rounded-md text-left transition-colors',
                      index === selectedIndex
                        ? 'bg-primary/10'
                        : 'hover:bg-muted'
                    )}
                  >
                    <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{result.title}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {result.description}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t text-xs text-muted-foreground flex items-center justify-between">
          <div className="flex gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">
                ↑↓
              </kbd>{' '}
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">
                ↵
              </kbd>{' '}
              to select
            </span>
          </div>
          <span>{filteredResults.length} results</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
