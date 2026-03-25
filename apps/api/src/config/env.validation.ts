import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Database
  DATABASE_URL: Joi.string().uri().required(),

  // Redis
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('30d'),

  // GitHub OAuth
  GITHUB_CLIENT_ID: Joi.string().allow(''),
  GITHUB_CLIENT_SECRET: Joi.string().allow(''),
  GITHUB_CALLBACK_URL: Joi.string().uri().allow(''),

  // GitLab OAuth
  GITLAB_CLIENT_ID: Joi.string().allow(''),
  GITLAB_CLIENT_SECRET: Joi.string().allow(''),
  GITLAB_CALLBACK_URL: Joi.string().uri().allow(''),

  // AI Providers
  OPENAI_API_KEY: Joi.string().allow(''),
  ANTHROPIC_API_KEY: Joi.string().allow(''),
  OLLAMA_BASE_URL: Joi.string().default('http://localhost:11434'),
  AI_DEFAULT_PROVIDER: Joi.string()
    .valid('openai', 'anthropic', 'ollama')
    .default('openai'),
  AI_DEFAULT_MODEL: Joi.string().default('gpt-4o-mini'),
  AI_FALLBACK_CHAIN: Joi.string().default('openai,anthropic,ollama'),

  // App
  APP_PORT: Joi.number().default(3001),
  // FRONTEND_URL: 前端应用的访问地址，用于 OAuth 回调重定向和 CORS
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  // API_URL: 后端 API 的公开访问地址，用于生成 Webhook 回调 URL
  API_URL: Joi.string().uri().default('http://localhost:3001'),

  // Rate Limiting
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
});
