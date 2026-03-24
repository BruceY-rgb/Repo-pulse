import { Menu, Search, Github, BookOpen, MessageCircle, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/contexts/LanguageContext';

interface HeaderProps {
  onMenuClick: () => void;
  onSearchClick: () => void;
  isSidebarOpen: boolean;
}

export function Header({ onMenuClick, onSearchClick }: HeaderProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="flex items-center h-full px-4">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="lg:flex"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          {/* Logo */}
          <a href="/" className="flex items-center gap-2">
            <img src="/avator.png" alt="Repo-Pulse" className="h-8" />
            <span className="font-semibold text-lg text-white">Repo-Pulse</span>
          </a>
        </div>

        {/* Center - Search */}
        <div className="flex-1 flex justify-center px-4">
          <Button
            variant="outline"
            onClick={onSearchClick}
            className="w-full max-w-md justify-start text-muted-foreground"
          >
            <Search className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{t('search.placeholder')}</span>
            <span className="sm:hidden">{t('search.short')}</span>
            <kbd className="ml-auto hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Languages className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLanguage('en')}>
                <span className={language === 'en' ? 'font-bold' : ''}>English</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage('zh')}>
                <span className={language === 'zh' ? 'font-bold' : ''}>中文</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" asChild>
            <a href="https://github.com/BruceY-rgb/Repo-pulse-docs" target="_blank" rel="noopener noreferrer">
              <Github className="h-5 w-5" />
            </a>
          </Button>
          <Button variant="ghost" size="icon">
            <BookOpen className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <MessageCircle className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
