-- 登录/注册回归纯账号密码模式，邮箱验证码功能下线
-- DropTable
DROP TABLE IF EXISTS "EmailVerificationCode";

-- DropEnum
DROP TYPE IF EXISTS "EmailVerificationPurpose";
