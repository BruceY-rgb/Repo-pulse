import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Database
  DATABASE_URL: Joi.string().uri().required(),

  // Redis
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // JWT（桌面端本地实例：access token 默认 7 天，保证同设备登录态长期有效）
  // 格式限定为 数字+单位(s/m/h/d)：Cookie maxAge 解析与 JWT 签名使用同一字符串，
  // jsonwebtoken 支持但这里不支持的格式（如 '2w'）会导致两者静默不一致，故在启动时直接拒绝
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRATION: Joi.string().pattern(/^[1-9]\d*[smhd]$/).default('7d'),
  JWT_REFRESH_EXPIRATION: Joi.string().pattern(/^[1-9]\d*[smhd]$/).default('30d'),

  // GitHub（全局兜底 PAT，按用户的 token 在设置页配置）
  GITHUB_TOKEN: Joi.string().allow(''),

  // GitLab OAuth
  GITLAB_CLIENT_ID: Joi.string().allow(''),
  GITLAB_CLIENT_SECRET: Joi.string().allow(''),
  GITLAB_CALLBACK_URL: Joi.string().uri().allow(''),

  // AI Providers
  OPENAI_API_KEY: Joi.string().allow(''),
  ANTHROPIC_API_KEY: Joi.string().allow(''),
  DEEPSEEK_API_KEY: Joi.string().allow(''),
  GEMINI_API_KEY: Joi.string().allow(''),
  OLLAMA_BASE_URL: Joi.string().default('http://localhost:11434'),
  AI_DEFAULT_PROVIDER: Joi.string()
    .valid('openai', 'anthropic', 'ollama', 'deepseek', 'google', 'moonshot', 'zhipu', 'minimax', 'doubao', 'qwen', 'custom')
    .default('openai'),
  AI_DEFAULT_MODEL: Joi.string().default('gpt-4o-mini'),
  AI_FALLBACK_CHAIN: Joi.string().default('openai,anthropic,ollama'),
  AI_ANALYSIS_ENABLED: Joi.boolean()
    .truthy('true').truthy('1').truthy('yes').truthy('on')
    .falsy('false').falsy('0').falsy('no').falsy('off')
    .default(true),
  AI_AUTO_ANALYSIS_ENABLED: Joi.boolean()
    .truthy('true').truthy('1').truthy('yes').truthy('on')
    .falsy('false').falsy('0').falsy('no').falsy('off')
    .default(false),
  AI_AUTO_ANALYSIS_ACCESS_MODES: Joi.string().default('EDITABLE'),
  AI_MAX_RETRY: Joi.number().integer().min(0).default(2),

  // App
  APP_HOST: Joi.string().hostname().default('127.0.0.1'),
  APP_PORT: Joi.number().default(3001),
  // FRONTEND_URL: 前端应用的访问地址，用于 CORS
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  // API_URL: 后端 API 的公开访问地址，用于生成 Webhook 回调 URL
  API_URL: Joi.string().uri().default('http://localhost:3001'),

  // Rate Limiting
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
});
