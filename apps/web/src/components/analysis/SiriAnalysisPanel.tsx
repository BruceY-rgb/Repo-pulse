import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Brain, AlertCircle, RefreshCw, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { RiskBadge } from './RiskBadge';
import { CategoryBadge } from './CategoryBadge';
import { analysisService } from '@/services/analysis.service';

interface SiriAnalysisPanelProps {
  eventId: string;
  eventTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SiriAnalysisResult {
  summary: string;
  riskLevel: string;
  category: string;
  riskScore: number;
  confidence: number;
  suggestions: any[];
  riskReasons: string[];
  model?: string;
}

export function SiriAnalysisPanel({
  eventId,
  eventTitle,
  isOpen,
  onClose,
}: SiriAnalysisPanelProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<SiriAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [displayedSummary, setDisplayedSummary] = useState<string>('');

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // 在弹窗打开时，默认定位在屏幕右下角
  useEffect(() => {
    if (isOpen) {
      const initialX = window.innerWidth - 420 - 24; // 420px width, 24px padding
      const initialY = window.innerHeight - 560 - 24; // 560px max-height, 24px padding
      setPosition({ x: initialX, y: Math.max(24, initialY) });
    }
  }, [isOpen]);

  // 全局鼠标移动与抬起监听器
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = e.clientX - dragStart.current.x;
      const newY = e.clientY - dragStart.current.y;

      // 限制拖拽范围在可视区域内
      const boundedX = Math.max(0, Math.min(newX, window.innerWidth - 420));
      const boundedY = Math.max(0, Math.min(newY, window.innerHeight - 100));

      setPosition({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 如果点击的是关闭按钮或其内部，则不触发拖拽
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const triggerAndPoll = async () => {
    setStatus('loading');
    setResult(null);
    setErrorMsg('');
    setDisplayedSummary('');

    try {
      // 1. 触发手动分析（强制）
      await analysisService.triggerAnalysis(eventId, true);

      // 2. 开启轮询检查分析状态，最大重试25次（约37秒）
      let attempts = 0;
      const maxAttempts = 25;

      const poll = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(poll);
          setStatus('error');
          setErrorMsg('分析响应超时，请稍后前往“AI分析”列表查看结果。');
          return;
        }

        try {
          const detail = await analysisService.getByEventId(eventId);
          const statusLower = detail?.status?.toLowerCase();
          if (detail && (statusLower === 'completed' || statusLower === 'success' || statusLower === 'processed')) {
            clearInterval(poll);
            setResult({
              summary: detail.summaryLong || detail.summary || '',
              riskLevel: detail.riskLevel,
              category: detail.category,
              riskScore: detail.riskScore,
              confidence: detail.confidence,
              suggestions: detail.suggestions || [],
              riskReasons: detail.riskReasons || [],
              model: detail.model,
            });
            setStatus('success');
          } else if (detail && statusLower === 'failed') {
            clearInterval(poll);
            setStatus('error');
            setErrorMsg(detail.errorMessage || 'AI 分析任务执行失败。');
          }
        } catch (err) {
          // 轮询中的单次网络异常允许忽略并继续
          console.warn('Polling error, retrying...', err);
        }
      }, 1500);

      return () => clearInterval(poll);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.response?.data?.message || err?.message || '无法发起分析请求。');
    }
  };

  useEffect(() => {
    if (isOpen && eventId) {
      void triggerAndPoll();
    }
  }, [isOpen, eventId]);

  // 打字机流式输出效果
  useEffect(() => {
    if (status === 'success' && result?.summary) {
      let index = 0;
      const text = result.summary;
      setDisplayedSummary('');

      const interval = setInterval(() => {
        setDisplayedSummary((prev) => prev + text.charAt(index));
        index++;
        if (index >= text.length) {
          clearInterval(interval);
        }
      }, 15);

      return () => clearInterval(interval);
    }
  }, [status, result]);

  if (!isOpen) return null;

  return (
    <>
      {/* Dynamic animations injection */}
      <style>{`
        @keyframes siri-pulse {
          0% { transform: scale(0.9); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 0.85; filter: hue-rotate(60deg); }
          100% { transform: scale(0.9); opacity: 0.5; }
        }
        @keyframes siri-wave {
          0%, 100% { height: 10px; }
          50% { height: 38px; }
        }
      `}</style>

      {/* Floating Pane Container */}
      <div 
        style={{ top: `${position.y}px`, left: `${position.x}px`, margin: 0 }}
        className="fixed w-[420px] max-h-[560px] flex flex-col bg-slate-950/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_30px_rgba(168,85,247,0.1)] overflow-hidden transition-[opacity,transform] duration-300 z-50 text-slate-100 before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-purple-500 before:via-blue-500 before:to-pink-500"
      >
        
        {/* Header */}
        <header 
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50 bg-slate-900/30 cursor-grab active:cursor-grabbing select-none"
        >
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-ping absolute" />
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500 relative" />
            </div>
            <span className="text-sm font-semibold tracking-wide bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Siri AI 智能透视
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors cursor-default"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Scrollable Body */}
        <ScrollArea className="flex-1 p-4 overflow-y-auto">
          
          {/* Target Title context */}
          <div className="mb-4 bg-slate-900/40 border border-slate-800/30 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
              分析目标事件
            </span>
            <p className="text-xs text-slate-300 mt-1 font-medium line-clamp-2">
              {eventTitle}
            </p>
          </div>

          {/* Loading status (Voice-like wave) */}
          {status === 'loading' && (
            <div className="relative flex flex-col items-center justify-center p-8 bg-slate-900/25 border border-slate-800/40 rounded-xl overflow-hidden min-h-[220px]">
              {/* Pulsing glow background */}
              <div className="absolute w-24 h-24 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-blue-500 opacity-20 blur-xl animate-[siri-pulse_3s_infinite]" />
              
              {/* Wave visualizer */}
              <div className="flex items-end justify-center gap-1.5 h-12 mb-6 relative z-10">
                <div className="w-1 bg-purple-500 rounded-full animate-[siri-wave_1.2s_infinite]" style={{ animationDelay: '0.1s' }} />
                <div className="w-1.2 bg-pink-500 rounded-full animate-[siri-wave_1.0s_infinite]" style={{ animationDelay: '0.3s' }} />
                <div className="w-1.5 bg-blue-500 rounded-full animate-[siri-wave_1.4s_infinite]" style={{ animationDelay: '0.5s' }} />
                <div className="w-1.2 bg-cyan-500 rounded-full animate-[siri-wave_0.8s_infinite]" style={{ animationDelay: '0.2s' }} />
                <div className="w-1 bg-pink-400 rounded-full animate-[siri-wave_1.1s_infinite]" style={{ animationDelay: '0.4s' }} />
              </div>
              
              <p className="text-sm text-slate-300 text-center relative z-10 font-medium animate-pulse">
                正在深度剖析变更及可能的影响...
              </p>
              <p className="text-[10px] text-slate-500 text-center mt-2 relative z-10">
                模型走系统后台配置的 API Token
              </p>
            </div>
          )}

          {/* Error status */}
          {status === 'error' && (
            <div className="flex flex-col items-center justify-center p-6 bg-red-950/20 border border-red-900/30 rounded-xl min-h-[200px] text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
              <p className="text-sm font-medium text-red-300">{errorMsg}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 border-red-500/20 hover:bg-red-500/10 text-red-300 gap-1"
                onClick={triggerAndPoll}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                重新分析
              </Button>
            </div>
          )}

          {/* Success status */}
          {status === 'success' && result && (
            <div className="space-y-4">
              
              {/* Badges & Scores */}
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge riskLevel={result.riskLevel} />
                <CategoryBadge category={result.category} />
                <Badge variant="outline" className="border-slate-800 text-xs bg-slate-900/40">
                  可信度: {(result.confidence * 100).toFixed(0)}%
                </Badge>
                <Badge variant="outline" className="border-slate-800 text-xs bg-slate-900/40">
                  分值: {result.riskScore}/100
                </Badge>
              </div>

              {/* Typed Summary */}
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Brain className="w-3 h-3 text-purple-400" />
                  分析总结
                </span>
                <div className="text-sm text-slate-200 mt-1.5 leading-relaxed bg-slate-900/20 p-3 rounded-xl border border-slate-900 font-mono whitespace-pre-wrap">
                  {displayedSummary}
                  {displayedSummary.length < result.summary.length && (
                    <span className="inline-block w-1.5 h-3.5 bg-purple-400 ml-0.5 animate-pulse" />
                  )}
                </div>
              </div>

              {/* Risk reasons */}
              {result.riskReasons.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    风险成因
                  </span>
                  <ul className="mt-1.5 space-y-1.5">
                    {result.riskReasons.map((reason, i) => (
                      <li
                        key={i}
                        className="text-xs text-slate-300 pl-3 border-l-2 border-purple-500/50"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {result.suggestions.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    优化建议
                  </span>
                  <ul className="mt-1.5 space-y-2">
                    {result.suggestions.map((suggestion: any, i) => (
                      <li
                        key={i}
                        className="text-xs text-slate-300 flex flex-col gap-0.5 pl-3 border-l-2 border-purple-500/30"
                      >
                        <span className="font-semibold text-purple-300">{suggestion.title || suggestion}</span>
                        {suggestion.description && <span className="text-slate-400 mt-0.5">{suggestion.description}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer specs */}
              {result.model && (
                <div className="pt-2 border-t border-slate-900 text-[10px] text-slate-500 flex justify-between">
                  <span>模型: {result.model}</span>
                  <span>Repo-Pulse AI Pipeline</span>
                </div>
              )}

            </div>
          )}

        </ScrollArea>

        {/* Footer actions */}
        <footer className="px-4 py-3 border-t border-slate-800/50 bg-slate-900/30 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1">
            <Command className="w-3.5 h-3.5 text-slate-500" />
            <span>智能诊断就绪</span>
          </div>
          {status === 'success' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-950/20"
              onClick={triggerAndPoll}
            >
              重新发起分析
            </Button>
          )}
        </footer>

      </div>
    </>
  );
}
