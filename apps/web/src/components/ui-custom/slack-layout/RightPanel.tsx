import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  className?: string;
}

export function RightPanel({ open, onClose, className }: RightPanelProps) {
  const { t } = useLanguage();

  return (
    <div
      className={cn(
        'flex flex-col h-full border-l border-border bg-card transition-all duration-200',
        open ? 'w-full' : 'w-0 border-l-0 overflow-hidden',
        className,
      )}
    >
      {open && (
        <>
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <h2 className="font-semibold text-sm">
              {t('app.layout.agent.workbench')}
            </h2>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Separator />
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              {t('app.layout.agent.placeholder')}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {t('app.layout.agent.empty')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
