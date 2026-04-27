import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSSEOptions<T> {
  url: string;
  enabled?: boolean;
  onMessage?: (data: T) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

interface SSEReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  isComplete: boolean;
}

/**
 * SSE Hook - 用于接收服务器发送的事件流
 */
export function useSSE<T = string>(options: UseSSEOptions<T>): SSEReturn<T> {
  const { url, enabled = true, onMessage, onError, onComplete } = options;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);
    setIsComplete(false);
    setData(null);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Connected to:', url);
      setIsLoading(false);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as T;
        setData(parsed);
        onMessage?.(parsed);

        // 检查是否是完成信号
        if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
          if ((parsed as { type: string }).type === 'done') {
            setIsComplete(true);
            onComplete?.();
          }
        }
      } catch (e) {
        // 如果不是 JSON，直接作为字符串处理
        setData(event.data as T);
      }
    };

    eventSource.onerror = (e) => {
      console.error('[SSE] Error:', e);
      const err = new Error('SSE connection failed');
      setError(err);
      setIsLoading(false);
      onError?.(err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [url, enabled, onMessage, onError, onComplete]);

  return { data, isLoading, error, isComplete };
}

/**
 * 流式文本 Hook - 用于打字机效果
 */
export function useStreamingText(options: {
  eventId: string;
  enabled?: boolean;
}) {
  const { eventId, enabled = true } = options;
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchToken = useCallback(async () => {
    if (!eventId || !enabled) return;

    setText('');
    setIsStreaming(true);
    setError(null);

    try {
      // 获取访问 token
      const userResponse = await fetch('/api/users/me', {
        credentials: 'include',
      });
      const userData = await userResponse.json();
      const token = userData.accessToken;

      // 使用 fetch 进行流式请求
      const response = await fetch(`/api/ai/stream/${eventId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'chunk') {
                setText((prev) => prev + parsed.content);
              } else if (parsed.type === 'done') {
                setIsStreaming(false);
              } else if (parsed.error) {
                setError(new Error(parsed.error));
                setIsStreaming(false);
              }
            } catch {
              // 不是 JSON，可能是纯文本
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Unknown error'));
      setIsStreaming(false);
    }
  }, [eventId, enabled]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  return { text, isStreaming, error };
}