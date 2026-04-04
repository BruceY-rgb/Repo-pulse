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
import { useLanguage } from '@/contexts/LanguageContext';
import gsap from 'gsap';

const features = [
  {
    icon: Brain,
    titleKey: 'landing.features.items.analysis.title',
    descriptionKey: 'landing.features.items.analysis.description',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Shield,
    titleKey: 'landing.features.items.risk.title',
    descriptionKey: 'landing.features.items.risk.description',
    color: 'from-red-500 to-orange-500',
  },
  {
    icon: TrendingUp,
    titleKey: 'landing.features.items.dora.title',
    descriptionKey: 'landing.features.items.dora.description',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: Bell,
    titleKey: 'landing.features.items.notifications.title',
    descriptionKey: 'landing.features.items.notifications.description',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: BarChart3,
    titleKey: 'landing.features.items.dashboard.title',
    descriptionKey: 'landing.features.items.dashboard.description',
    color: 'from-yellow-500 to-amber-500',
  },
  {
    icon: FileText,
    titleKey: 'landing.features.items.reports.title',
    descriptionKey: 'landing.features.items.reports.description',
    color: 'from-indigo-500 to-violet-500',
  },
];

const testimonials = [
  {
    quoteKey: 'landing.testimonials.items.0.quote',
    authorKey: 'landing.testimonials.items.0.author',
    roleKey: 'landing.testimonials.items.0.role',
    avatar: "SC",
  },
  {
    quoteKey: 'landing.testimonials.items.1.quote',
    authorKey: 'landing.testimonials.items.1.author',
    roleKey: 'landing.testimonials.items.1.role',
    avatar: "MP",
  },
  {
    quoteKey: 'landing.testimonials.items.2.quote',
    authorKey: 'landing.testimonials.items.2.author',
    roleKey: 'landing.testimonials.items.2.role',
    avatar: "ER",
  },
];

const stats = [
  { value: '10K+', labelKey: 'landing.stats.repositories' },
  { value: '50M+', labelKey: 'landing.stats.lines' },
  { value: '99.9%', labelKey: 'landing.stats.uptime' },
  { value: '4.9/5', labelKey: 'landing.stats.rating' },
];

const footerGroups = [
  {
    titleKey: 'landing.footer.product.title',
    itemKeys: [
      'landing.footer.product.features',
      'landing.footer.product.pricing',
      'landing.footer.product.integrations',
      'landing.footer.product.changelog',
    ],
  },
  {
    titleKey: 'landing.footer.company.title',
    itemKeys: [
      'landing.footer.company.about',
      'landing.footer.company.blog',
      'landing.footer.company.careers',
      'landing.footer.company.contact',
    ],
  },
  {
    titleKey: 'landing.footer.resources.title',
    itemKeys: [
      'landing.footer.resources.documentation',
      'landing.footer.resources.api',
      'landing.footer.resources.community',
      'landing.footer.resources.support',
    ],
  },
  {
    titleKey: 'landing.footer.legal.title',
    itemKeys: [
      'landing.footer.legal.privacy',
      'landing.footer.legal.terms',
      'landing.footer.legal.security',
    ],
  },
];

export function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

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
        <div className="w-full px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/avator.png" alt="Repo-Pulse" className="h-9" />
            <span className="font-bold text-xl text-white">Repo-Pulse</span>
          </Link>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-[var(--github-text-secondary)] hover:text-white transition-colors">
              {t('landing.nav.features')}
            </a>
            <a href="#testimonials" className="text-sm text-[var(--github-text-secondary)] hover:text-white transition-colors">
              {t('landing.nav.testimonials')}
            </a>
            <Link to="/dashboard">
              <Button variant="ghost" className="text-[var(--github-text-secondary)] hover:text-white">
                {t('landing.nav.signIn')}
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button className="btn-x-primary gap-2">
                {t('landing.nav.getStarted')}
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
                  {t('landing.hero.badge')}
                </Badge>
                <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">
                  {t('landing.hero.title.prefix')}{' '}
                  <span className="gradient-text">{t('landing.hero.title.highlight')}</span>{' '}
                  {t('landing.hero.title.suffix')}
                </h1>
              </div>
              <p className="animate-in text-xl text-[var(--github-text-secondary)] max-w-lg">
                {t('landing.hero.description')}
              </p>
              <div className="animate-in flex flex-wrap gap-4">
                <Link to="/dashboard">
                  <Button className="btn-x-primary gap-2 text-lg px-8 py-6">
                    {t('landing.hero.primaryCta')}
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Button variant="outline" className="border-[var(--github-border)] text-lg px-8 py-6">
                  <Github className="w-5 h-5 mr-2" />
                  {t('landing.hero.secondaryCta')}
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
                  {t('landing.hero.trustedByPrefix')} <span className="text-white font-medium">10,000+</span> {t('landing.hero.trustedBySuffix')}
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
                        <span className="text-sm text-white font-medium">{t('landing.preview.analysisComplete')}</span>
                      </div>
                      <p className="text-sm text-[var(--github-text-secondary)]">
                        {t('landing.preview.analysisResult')}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-red-400/5 border border-red-400/20">
                      <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-red-400 mt-0.5" />
                        <div>
                          <p className="text-sm text-white font-medium">{t('landing.preview.securityAlert')}</p>
                          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
                            {t('landing.preview.securityMessage')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-[var(--github-bg)] border border-[var(--github-border)]">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--github-text-secondary)]">{t('landing.preview.deploymentFrequency')}</span>
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
                <p className="text-sm text-[var(--github-text-secondary)] mt-1">{t(stat.labelKey)}</p>
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
              {t('landing.features.title')}
            </h2>
            <p className="text-lg text-[var(--github-text-secondary)] max-w-2xl mx-auto">
              {t('landing.features.description')}
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
                    <h3 className="text-lg font-semibold text-white mb-2">{t(feature.titleKey)}</h3>
                    <p className="text-sm text-[var(--github-text-secondary)]">{t(feature.descriptionKey)}</p>
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
              {t('landing.testimonials.title')}
            </h2>
            <p className="text-lg text-[var(--github-text-secondary)]">
              {t('landing.testimonials.description')}
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
                    "{t(testimonial.quoteKey)}"
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--github-accent)] to-[#ff8c00] flex items-center justify-center text-white text-sm font-medium">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{t(testimonial.authorKey)}</p>
                      <p className="text-xs text-[var(--github-text-secondary)]">{t(testimonial.roleKey)}</p>
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
            {t('landing.cta.title')}
          </h2>
          <p className="text-lg text-[var(--github-text-secondary)] mb-8 max-w-2xl mx-auto">
            {t('landing.cta.description')}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/dashboard">
              <Button className="btn-x-primary gap-2 text-lg px-8 py-6">
                {t('landing.cta.primary')}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Button variant="outline" className="border-[var(--github-border)] text-lg px-8 py-6">
              {t('landing.cta.secondary')}
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-[var(--github-border)]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            {footerGroups.map((group) => (
              <div key={group.titleKey}>
                <h4 className="text-sm font-semibold text-white mb-4">{t(group.titleKey)}</h4>
                <ul className="space-y-2">
                  {group.itemKeys.map((itemKey) => (
                    <li key={itemKey}>
                      <a href="#" className="text-sm text-[var(--github-text-secondary)] hover:text-white transition-colors">
                        {t(itemKey)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-[var(--github-border)]">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ff4d00] to-[#ff8c00] flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">Repo-Pulse</span>
            </div>
            <p className="text-sm text-[var(--github-text-secondary)] mb-4 md:mb-0">
              {t('landing.footer.copyright')}
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
