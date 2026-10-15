import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
export function smtpTransport(config: ConfigService) {
  const host = config.get<string>('SMTP_HOST'),
    port = Number(config.get<string>('SMTP_PORT')),
    from = config.get<string>('MAIL_FROM');
  const user = config.get<string>('SMTP_USER'),
    pass = config.get<string>('SMTP_PASSWORD');
  if (
    !host ||
    !from ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    Boolean(user) !== Boolean(pass)
  )
    throw new ServiceUnavailableException('SMTP is not configured correctly');
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
    requireTLS: config.get<string>('SMTP_REQUIRE_TLS', 'true') === 'true',
    ...(user && pass ? { auth: { user, pass } } : {}),
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return { transport, from };
}
