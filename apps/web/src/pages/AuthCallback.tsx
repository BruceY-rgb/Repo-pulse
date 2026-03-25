import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

/**
 * OAuth 回调页面
 * 后端完成 OAuth 认证后，将 Token 写入 HttpOnly Cookie 并重定向到此页面
 * 此页面只需调用 getMe 验证 Cookie 是否有效，无需从 URL 参数读取 Token
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuthStore();

  useEffect(() => {
    handleOAuthCallback()
      .then(() => {
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        navigate('/login?error=oauth_failed', { replace: true });
      });
  }, [handleOAuthCallback, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>正在登录，请稍候...</span>
      </div>
    </div>
  );
}
