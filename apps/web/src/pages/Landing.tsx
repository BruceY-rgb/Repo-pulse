import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  Zap, 
  Brain, 
  Shield, 
  TrendingUp,
  Bell,
  ArrowRight,
  Star,
  Github,
  Twitter,
  Linkedin,
  BarChart3,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import gsap from 'gsap';

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Analysis',
    description: 'Get instant insights into your code with advanced AI that understands context and intent.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Shield,
    title: 'Risk Detection',
    description: 'Identify security vulnerabilities and high-risk changes before they reach production.',
    color: 'from-red-500 to-orange-500',
  },
  {
    icon: TrendingUp,
    title: 'DORA Metrics',
    description: 'Track deployment frequency, lead time, and team productivity with industry-standard metrics.',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'Stay informed with intelligent alerts delivered to Slack, Email, or DingTalk.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: BarChart3,
    title: 'Real-time Dashboard',
    description: 'Visualize your codebase health and team activity in a beautiful, intuitive interface.',
    color: 'from-yellow-500 to-amber-500',
  },
  {
    icon: FileText,
    title: 'Auto Reports',
    description: 'Generate weekly and monthly reports automatically to share with your team.',
    color: 'from-indigo-500 to-violet-500',
  },
];

const testimonials = [
  {
    quote: "Repo-Pulse has transformed how we review code. The AI insights catch issues we'd miss, and the DORA metrics help us continuously improve.",
    author: "Sarah Chen",
    role: "Tech Lead at Stripe",
    avatar: "SC",
  },
  {
    quote: "The risk detection feature alone has saved us countless hours. We caught a critical security vulnerability before it went live.",
    author: "Michael Park",
    role: "Engineering Manager at Netflix",
    avatar: "MP",
  },
  {
    quote: "Finally, a tool that understands developer workflows. The smart notifications mean I only get alerted when it actually matters.",
    author: "Emily Rodriguez",
    role: "Senior Developer at GitHub",
    avatar: "ER",
  },
];

const stats = [
  { value: '10K+', label: 'Repositories Analyzed' },
  { value: '50M+', label: 'Lines of Code Processed' },
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '4.9/5', label: 'User Rating' },
];

export function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Hero animation
    if (heroRef.current) {
      gsap.fromTo(
        heroRef.current.querySelectorAll('.animate-in'),
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out' }
      );
    }

    // Features animation
    if (featuresRef.current) {
      gsap.fromTo(
        featuresRef.current.querySelectorAll('.feature-card'),
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: featuresRef.current,
            start: 'top 80%',
          },
        }
      );
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--github-bg)]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--github-bg)]/80 backdrop-blur-md border-b border-[var(--github-border)]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/avator.png" alt="Repo-Pulse" className="h-9" />
            <span className="font-bold text-xl text-white">Repo-Pulse</span>
          </Link>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-[var(--github-text-secondary)] hover:text-white transition-colors">
              Features
            </a>
            <a href="#testimonials" className="text-sm text-[var(--github-text-secondary)] hover:text-white transition-colors">
              Testimonials
            </a>
            <Link to="/dashboard">
              <Button variant="ghost" className="text-[var(--github-text-secondary)] hover:text-white">
                Sign In
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button className="btn-x-primary gap-2">
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section ref={heroRef} className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="animate-in">
                <Badge className="bg-[var(--github-accent)]/20 text-[var(--github-accent)] border-[var(--github-accent)]/30 mb-4">
                  <Star className="w-3 h-3 mr-1" />
                  Now with AI Code Review
                </Badge>
                <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">
                  AI-Powered{' '}
                  <span className="gradient-text">Code Intelligence</span>{' '}
                  for Modern Teams
                </h1>
              </div>
              <p className="animate-in text-xl text-[var(--github-text-secondary)] max-w-lg">
                Get instant insights into your codebase. From vulnerability detection to 
                DORA metrics, Repo-Pulse is your AI development companion.
              </p>
              <div className="animate-in flex flex-wrap gap-4">
                <Link to="/dashboard">
                  <Button className="btn-x-primary gap-2 text-lg px-8 py-6">
                    Start Free Trial
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Button variant="outline" className="border-[var(--github-border)] text-lg px-8 py-6">
                  <Github className="w-5 h-5 mr-2" />
                  View on GitHub
                </Button>
              </div>
              <div className="animate-in flex items-center gap-6 pt-4">
                <div className="flex -space-x-3">
                  {['SC', 'MP', 'ER', 'JD'].map((initial, i) => (
                    <div 
                      key={i} 
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--github-accent)] to-[#ff8c00] flex items-center justify-center text-white text-sm font-medium border-2 border-[var(--github-bg)]"
                    >
                      {initial}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-[var(--github-text-secondary)]">
                  Trusted by <span className="text-white font-medium">10,000+</span> developers
                </p>
              </div>
            </div>
            <div className="animate-in relative">
              <div className="relative rounded-2xl overflow-hidden border border-[var(--github-border)] shadow-2xl">
                <div className="bg-[var(--github-surface)] p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="space-y-3">
                    <div className="p-4 rounded-lg bg-[var(--github-bg)] border border-[var(--github-border)]">
                      <div className="flex items-center gap-3 mb-3">
                        <Brain className="w-5 h-5 text-[var(--github-accent)]" />
                        <span className="text-sm text-white font-medium">AI Analysis Complete</span>
                      </div>
                      <p className="text-sm text-[var(--github-text-secondary)]">
                        Found 2 security issues and 3 performance optimizations
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-red-400/5 border border-red-400/20">
                      <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-red-400 mt-0.5" />
                        <div>
                          <p className="text-sm text-white font-medium">Security Alert</p>
                          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
                            Potential SQL injection vulnerability in auth.js:42
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-[var(--github-bg)] border border-[var(--github-border)]">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--github-text-secondary)]">Deployment Frequency</span>
                        <span className="text-sm text-green-400 font-medium">4.2/day ↑</span>
                      </div>
                      <div className="mt-2 h-2 bg-[var(--github-border)] rounded-full overflow-hidden">
                        <div className="h-full w-4/5 bg-gradient-to-r from-[var(--github-accent)] to-[#ff8c00] rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Glow effect */}
              <div className="absolute -inset-4 bg-gradient-to-r from-[var(--github-accent)]/20 to-purple-500/20 blur-3xl -z-10" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-[var(--github-border)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl lg:text-4xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-[var(--github-text-secondary)] mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" ref={featuresRef} className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              Everything you need to ship better code
            </h2>
            <p className="text-lg text-[var(--github-text-secondary)] max-w-2xl mx-auto">
              From AI-powered analysis to team collaboration, Repo-Pulse provides 
              the tools you need to build high-quality software faster.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <Card 
                  key={i} 
                  className="feature-card card-github hover:border-[var(--github-accent)]/30 transition-all duration-300 group"
                >
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-[var(--github-text-secondary)]">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 px-6 border-y border-[var(--github-border)]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              Loved by developers worldwide
            </h2>
            <p className="text-lg text-[var(--github-text-secondary)]">
              See what teams are saying about Repo-Pulse
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, i) => (
              <Card key={i} className="card-github">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-[var(--github-accent)] text-[var(--github-accent)]" />
                    ))}
                  </div>
                  <p className="text-[var(--github-text)] mb-6 leading-relaxed">
                    "{testimonial.quote}"
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--github-accent)] to-[#ff8c00] flex items-center justify-center text-white text-sm font-medium">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{testimonial.author}</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--github-accent)]/10 to-purple-500/10" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Ready to transform your code review process?
          </h2>
          <p className="text-lg text-[var(--github-text-secondary)] mb-8 max-w-2xl mx-auto">
            Join thousands of developers who are shipping better code faster with Repo-Pulse.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/dashboard">
              <Button className="btn-x-primary gap-2 text-lg px-8 py-6">
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Button variant="outline" className="border-[var(--github-border)] text-lg px-8 py-6">
              Schedule Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-[var(--github-border)]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2">
                {['Features', 'Pricing', 'Integrations', 'Changelog'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-[var(--github-text-secondary)] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2">
                {['About', 'Blog', 'Careers', 'Contact'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-[var(--github-text-secondary)] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Resources</h4>
              <ul className="space-y-2">
                {['Documentation', 'API Reference', 'Community', 'Support'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-[var(--github-text-secondary)] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2">
                {['Privacy', 'Terms', 'Security'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-[var(--github-text-secondary)] hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-[var(--github-border)]">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ff4d00] to-[#ff8c00] flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">Repo-Pulse</span>
            </div>
            <p className="text-sm text-[var(--github-text-secondary)] mb-4 md:mb-0">
              © 2025 Repo-Pulse. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-[var(--github-text-secondary)] hover:text-white transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="text-[var(--github-text-secondary)] hover:text-white transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-[var(--github-text-secondary)] hover:text-white transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
