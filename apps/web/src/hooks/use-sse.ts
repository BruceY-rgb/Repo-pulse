import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { toApiUrl } from '@/lib/desktop';

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

type SSEAction<T> =
  | { type: 'start' }
  | { type: 'open' }
  | { type: 'message'; data: T; isComplete: boolean }
  | { type: 'error'; error: Error };

function sseReducer<T>(state: SSEReturn<T>, action: SSEAction<T>): SSEReturn<T> {
  switch (action.type) {
    case 'start':
      return {
        data: null,
        isLoading: true,
        error: null,
        isComplete: false,
      };
    case 'open':
      return {
        ...state,
        isLoading: false,
      };
    case 'message':
      return {
        ...state,
        data: action.data,
        isComplete: action.isComplete,
      };
    case 'error':
      return {
        ...state,
        error: action.error,
        isLoading: false,
      };
    default:
      return state;
  }
}

/**
 * SSE Hook - 用于接收服务器发送的事件流
 */
export function useSSE<T = string>(options: UseSSEOptions<T>): SSEReturn<T> {
  const { url, enabled = true, onMessage, onError, onComplete } = options;
  const [state, dispatch] = useReducer(sseReducer<T>, {
    data: null,
    isLoading: false,
    error: null,
    isComplete: false,
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    dispatch({ type: 'start' });

    const eventSource = new EventSource(toApiUrl(url));
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Connected to:', url);
      dispatch({ type: 'open' });
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as T;
        onMessage?.(parsed);

        const isCompleteMessage =
          typeof parsed === 'object' &&
          parsed !== null &&
          'type' in parsed &&
          (parsed as { type: string }).type === 'done';

        if (isCompleteMessage) {
          onComplete?.();
        }
        dispatch({ type: 'message', data: parsed, isComplete: isCompleteMessage });
      } catch {
        // 如果不是 JSON，直接作为字符串处理
        dispatch({ type: 'message', data: event.data as T, isComplete: false });
      }
    };

    eventSource.onerror = (e) => {
      console.error('[SSE] Error:', e);
      const err = new Error('SSE connection failed');
      dispatch({ type: 'error', error: err });
      onError?.(err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [url, enabled, onMessage, onError, onComplete]);

  return state;
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
      const userResponse = await fetch(toApiUrl('/users/me'), {
        credentials: 'include',
      });
      const userData = await userResponse.json();
      const token = userData.accessToken;

      // 使用 fetch 进行流式请求
      const response = await fetch(toApiUrl(`/ai/stream/${eventId}`), {
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
