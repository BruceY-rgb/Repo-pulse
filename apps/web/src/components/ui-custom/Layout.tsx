import { Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  GitBranch,
  Brain,
  Bell,
  FileText,
  Settings,
  Search,
  Plus,
  Menu,
  X,
  Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useState } from 'react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/repositories', label: 'Repositories', icon: GitBranch },
  { path: '/analysis', label: 'AI Analysis', icon: Brain },
  { path: '/notifications', label: 'Notifications', icon: Bell, badge: 3 },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[var(--github-bg)] flex">
      {/* Sidebar */}
      <aside 
        className={`fixed left-0 top-0 h-full bg-[var(--github-surface)] border-r border-[var(--github-border)] z-40 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="p-4">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-3 mb-8 px-2">
            <img src="/avator.png" alt="Repo-Pulse" className="h-9" />
            <span className="font-bold text-lg text-white">Repo-Pulse</span>
          </Link>

          {/* New Analysis Button */}
          <Button className="w-full mb-6 btn-x-primary gap-2">
            <Plus className="w-4 h-4" />
            New Analysis
          </Button>

          {/* Navigation */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                      : 'text-[var(--github-text-secondary)] hover:bg-white/5 hover:text-[var(--github-text)]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <Badge className="bg-[var(--github-accent)] text-white text-xs px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Profile */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[var(--github-border)]">
          <div className="flex items-center gap-3 px-2">
            <Avatar className="w-9 h-9 border border-[var(--github-border)]">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback className="bg-[var(--github-accent)] text-white text-sm">JD</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">John Doe</p>
              <p className="text-xs text-[var(--github-text-secondary)] truncate">john@example.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Header */}
        <header className="h-16 bg-[var(--github-bg)]/80 backdrop-blur-md border-b border-[var(--github-border)] sticky top-0 z-30">
          <div className="h-full px-6 flex items-center justify-between gap-4">
            {/* Left: Toggle & Search */}
            <div className="flex items-center gap-4 flex-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-[var(--github-text-secondary)] hover:text-white hover:bg-white/5"
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>

              <div className="relative max-w-md w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--github-text-secondary)]" />
                <Input 
                  placeholder="Search repositories, issues, PRs..."
                  className="pl-10 bg-[var(--github-surface)] border-[var(--github-border)] text-sm placeholder:text-[var(--github-text-secondary)] focus:border-[var(--github-accent)] focus:ring-[var(--github-accent)]/20"
                />
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="relative text-[var(--github-text-secondary)] hover:text-white hover:bg-white/5">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--github-accent)] rounded-full" />
              </Button>
              
              <Button variant="ghost" size="icon" className="text-[var(--github-text-secondary)] hover:text-white hover:bg-white/5">
                <Github className="w-5 h-5" />
              </Button>

              <div className="h-6 w-px bg-[var(--github-border)] mx-1" />

              <Button className="btn-x-primary gap-2 text-sm">
                <Plus className="w-4 h-4" />
                Connect Repo
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-6 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
