import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { smtpTransport } from '../../common/mail/smtp-transport';

@Injectable()
export class RecoveryMailService {
  constructor(private readonly config: ConfigService) {}

  private settings() {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT'));
    const from = this.config.get<string>('MAIL_FROM');
    const resetUrl = this.config.get<string>('PASSWORD_RESET_URL');
    if (
      !host ||
      !from ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !resetUrl
    ) {
      throw new ServiceUnavailableException(
        'Password recovery mail is not configured',
      );
    }
    let url: URL;
    try {
      url = new URL(resetUrl);
    } catch {
      throw new ServiceUnavailableException('Invalid password recovery URL');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol === 'http:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    ) {
      throw new ServiceUnavailableException('Invalid password recovery URL');
    }
    const { transport, from: mailFrom } = smtpTransport(this.config);
    return { transport, from: mailFrom, url };
  }

  async ready() {
    const { transport } = this.settings();
    try {
      await transport.verify();
    } catch {
      throw new ServiceUnavailableException(
        'Password recovery mail is temporarily unavailable',
      );
    } finally {
      transport.close();
    }
  }

  async send(email: string, token: string) {
    const { transport, from, url } = this.settings();
    url.hash = `token=${token}`;
    try {
      await transport.sendMail({
        from,
        to: email,
        subject: 'Recuperar contraseña de Tienda',
        text: `Solicitaste cambiar tu contraseña de Tienda.\n\nAbre este enlace, válido durante 15 minutos y para un solo uso:\n${url.toString()}\n\nSi no solicitaste el cambio, ignora este mensaje.`,
      });
    } catch {
      throw new ServiceUnavailableException(
        'Password recovery mail is temporarily unavailable',
      );
    } finally {
      transport.close();
    }
  }
}
