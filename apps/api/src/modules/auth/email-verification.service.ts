import { BadRequestException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@repo-pulse/database';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import * as net from 'node:net';
import * as tls from 'node:tls';
import type { VerificationCodePurpose } from './dto/verification-code.dto';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

interface SmtpResponse {
  code: number;
  lines: string[];
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendCode(email: string, purpose: VerificationCodePurpose) {
    const normalizedEmail = this.normalizeEmail(email);

    if (purpose === 'BOOTSTRAP') {
      const users = await prisma.user.count();
      if (users > 0) {
        throw new BadRequestException('Bootstrap is already completed');
      }
    } else {
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { passwordHash: true },
      });
      if (!user?.passwordHash) {
        this.logger.warn(`verification_code_login_skipped email=${normalizedEmail} reason=user_missing_or_passwordless`);
        return { sent: true };
      }
    }

    await this.assertCooldownElapsed(normalizedEmail, purpose);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);

    await this.deliverCode(normalizedEmail, code, purpose);

    await prisma.emailVerificationCode.create({
      data: {
        email: normalizedEmail,
        purpose,
        codeHash,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    return { sent: true };
  }

  async verifyCode(email: string, purpose: VerificationCodePurpose, code: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const record = await prisma.emailVerificationCode.findFirst({
      where: {
        email: normalizedEmail,
        purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new UnauthorizedException('Verification code is invalid or expired');
    }

    if (record.attemptCount >= MAX_ATTEMPTS || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Verification code is invalid or expired');
    }

    const matched = await bcrypt.compare(code, record.codeHash);
    if (!matched) {
      await prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { attemptCount: { increment: 1 } },
      });
      throw new UnauthorizedException('Verification code is invalid or expired');
    }

    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }

  private async assertCooldownElapsed(email: string, purpose: VerificationCodePurpose) {
    const recent = await prisma.emailVerificationCode.findFirst({
      where: {
        email,
        purpose,
        createdAt: { gte: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recent) {
      throw new BadRequestException('Verification code was sent recently');
    }
  }

  private async deliverCode(email: string, code: string, purpose: VerificationCodePurpose) {
    const smtp = this.resolveSmtpConfig();
    const subject = purpose === 'BOOTSTRAP'
      ? 'Repo-Pulse bootstrap verification code'
      : 'Repo-Pulse sign-in verification code';
    const body = [
      `Your Repo-Pulse verification code is ${code}.`,
      '',
      'This code expires in 10 minutes.',
      'If you did not request this code, you can ignore this message.',
    ].join('\n');

    if (!smtp) {
      this.logger.warn(`verification_code_dev_delivery email=${email} purpose=${purpose} code=${code}`);
      return;
    }

    try {
      await sendSmtpMail(smtp, email, subject, body);
    } catch (error) {
      this.logger.error(`verification_code_smtp_delivery_failed email=${email}`, error);
      throw new InternalServerErrorException('Unable to send verification code');
    }
  }

  private resolveSmtpConfig(): SmtpConfig | null {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const from = this.configService.get<string>('SMTP_FROM')?.trim();
    if (!host || !from) {
      return null;
    }

    const secure = this.configService.get<boolean>('SMTP_SECURE') ?? false;
    return {
      host,
      from,
      secure,
      port: this.configService.get<number>('SMTP_PORT') ?? (secure ? 465 : 25),
      user: this.configService.get<string>('SMTP_USER')?.trim() || undefined,
      pass: this.configService.get<string>('SMTP_PASS') || undefined,
    };
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
}

class SmtpSession {
  private buffer = '';
  private waiters: Array<(response: SmtpResponse) => void> = [];

  constructor(private readonly socket: net.Socket | tls.TLSSocket) {
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string | Buffer) => this.handleData(String(chunk)));
  }

  async sendCommand(command: string, expectedCode: number) {
    this.socket.write(`${command}\r\n`);
    const response = await this.readResponse();
    if (response.code !== expectedCode) {
      throw new Error(`SMTP command failed: ${command} status=${response.code} response=${response.lines.join(' | ')}`);
    }
    return response;
  }

  async sendData(message: string) {
    this.socket.write(`${message}\r\n.\r\n`);
    const response = await this.readResponse();
    if (response.code !== 250) {
      throw new Error(`SMTP DATA failed: status=${response.code} response=${response.lines.join(' | ')}`);
    }
    return response;
  }

  async expect(expectedCode: number) {
    const response = await this.readResponse();
    if (response.code !== expectedCode) {
      throw new Error(`SMTP unexpected response: status=${response.code} response=${response.lines.join(' | ')}`);
    }
    return response;
  }

  close() {
    this.socket.end();
  }

  private readResponse() {
    const parsed = this.tryParseResponse();
    if (parsed) {
      return Promise.resolve(parsed);
    }

    return new Promise<SmtpResponse>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private handleData(chunk: string) {
    this.buffer += chunk;
    let parsed = this.tryParseResponse();
    while (parsed && this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.(parsed);
      parsed = this.tryParseResponse();
    }
  }

  private tryParseResponse(): SmtpResponse | null {
    const separatorIndex = this.buffer.indexOf('\r\n');
    if (separatorIndex === -1) {
      return null;
    }

    const lines = this.buffer.split('\r\n');
    const completeLines: string[] = [];
    let consumedLength = 0;

    for (const line of lines) {
      if (!line) {
        consumedLength += 2;
        continue;
      }

      completeLines.push(line);
      consumedLength += line.length + 2;
      if (/^\d{3} /.test(line)) {
        this.buffer = this.buffer.slice(consumedLength);
        return {
          code: Number(line.slice(0, 3)),
          lines: completeLines,
        };
      }
    }

    return null;
  }
}

async function sendSmtpMail(config: SmtpConfig, to: string, subject: string, body: string) {
  const socket = await connectSmtp(config);
  const session = new SmtpSession(socket);

  try {
    await session.expect(220);
    await session.sendCommand('EHLO repo-pulse.local', 250);

    if (config.user && config.pass) {
      await session.sendCommand('AUTH LOGIN', 334);
      await session.sendCommand(Buffer.from(config.user).toString('base64'), 334);
      await session.sendCommand(Buffer.from(config.pass).toString('base64'), 235);
    }

    await session.sendCommand(`MAIL FROM:<${extractEmailAddress(config.from)}>`, 250);
    await session.sendCommand(`RCPT TO:<${to}>`, 250);
    await session.sendCommand('DATA', 354);
    await session.sendData(buildEmailMessage(config.from, to, subject, body));
    await session.sendCommand('QUIT', 221);
  } finally {
    session.close();
  }
}

function connectSmtp(config: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({
        host: config.host,
        port: config.port,
        servername: config.host,
      }, () => resolve(socket))
      : net.connect({
        host: config.host,
        port: config.port,
      }, () => resolve(socket));

    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    });
    socket.once('error', reject);
  });
}

function buildEmailMessage(from: string, to: string, subject: string, body: string) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const normalizedBody = body
    .split('\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalizedBody,
  ].join('\r\n');
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}
