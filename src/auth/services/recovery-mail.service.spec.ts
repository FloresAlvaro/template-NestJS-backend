import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { RecoveryMailService } from './recovery-mail.service';

describe('Recovery mail configuration and failure handling', () => {
  const base = {
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    MAIL_FROM: 'sender@example.test',
    PASSWORD_RESET_URL: 'https://shop.example.test/reset',
  };
  const transport = {
    verify: jest.fn(() => Promise.resolve(true)),
    sendMail: jest.fn(() => Promise.resolve({ messageId: 'test' })),
    close: jest.fn(),
  };
  beforeEach(() => {
    jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue(
        transport as unknown as ReturnType<typeof nodemailer.createTransport>,
      );
    transport.verify.mockResolvedValue(true);
    transport.sendMail.mockResolvedValue({ messageId: 'test' });
    transport.close.mockClear();
    transport.sendMail.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());
  it.each([
    'http://public.example.test/reset',
    'https://user:password@example.test/reset',
    'https://example.test/reset?token=unsafe',
    'https://example.test/reset#unsafe',
    'file:///tmp/reset',
    'not-a-url',
  ])(
    'rejects unsafe reset URL %s without connecting to SMTP',
    async (PASSWORD_RESET_URL) => {
      const service = new RecoveryMailService(
        new ConfigService({ ...base, PASSWORD_RESET_URL }),
      );
      await expect(service.ready()).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    },
  );
  it.each(['0', '65536', 'NaN', '1.5'])(
    'rejects invalid SMTP port %s',
    async (SMTP_PORT) => {
      await expect(
        new RecoveryMailService(
          new ConfigService({ ...base, SMTP_PORT }),
        ).ready(),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    },
  );
  it('rejects incomplete SMTP authentication', async () => {
    await expect(
      new RecoveryMailService(
        new ConfigService({ ...base, SMTP_USER: 'user', SMTP_PASSWORD: '' }),
      ).ready(),
    ).rejects.toThrow(ServiceUnavailableException);
  });
  it('requires TLS by default and sends tokens only through the configured URL fragment', async () => {
    const service = new RecoveryMailService(new ConfigService(base));
    const token = 'a'.repeat(64);
    await service.send('recipient@example.test', token);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    const message = transport.sendMail.mock.calls[0] as unknown as [
      { text: string; to: string },
    ];
    expect(message[0].to).toBe('recipient@example.test');
    expect(message[0].text).toContain(
      `https://shop.example.test/reset#token=${token}`,
    );
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
  it.each(['verify', 'sendMail'] as const)(
    'sanitizes a %s failure and closes the transport',
    async (method) => {
      transport[method].mockRejectedValueOnce(
        new Error('SMTP secret credential and token'),
      );
      const service = new RecoveryMailService(new ConfigService(base));
      const result =
        method === 'verify'
          ? service.ready()
          : service.send('recipient@example.test', 'a'.repeat(64));
      await expect(result).rejects.toThrow(
        'Password recovery mail is temporarily unavailable',
      );
      expect(transport.close).toHaveBeenCalledTimes(1);
    },
  );
});
