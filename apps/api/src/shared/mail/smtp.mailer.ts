import { BRAND } from '@ilm/utils';
import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { type Env } from '../../config/env';

import { type MailMessage, type MailPort, type MailResult } from './mail.port';

/**
 * SMTP, via nodemailer. ADR-0011.
 *
 * One transport for two very different destinations, which is the reason to
 * prefer SMTP over a provider SDK for the first driver: mailpit on
 * `localhost:1025` in development, and a real relay in deployment. The same
 * code path runs in both, so "it worked locally" means something.
 *
 * ## What this is not
 *
 * It is not the answer for bulk messaging. The Phase 6 comms module sends
 * notices to every parent at every school, and a consumer relay will refuse
 * that volume long before the product needs it to. This driver exists to send
 * the handful of transactional messages the product sends today — verification,
 * invitations, password resets — and to be replaced behind `MailPort` when
 * volume arrives, without any caller changing.
 */
@Injectable()
export class SmtpMailer implements MailPort {
  readonly driver = 'smtp';

  private readonly logger = new Logger(SmtpMailer.name);
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(env: Env) {
    // The display name comes from `BRAND`, not from configuration, so renaming
    // the product (decision D4) changes the From line of every email without
    // anyone remembering to edit an environment variable. A `MAIL_FROM` that
    // already carries its own display name is left exactly as written — some
    // relays are particular about it.
    this.from = env.MAIL_FROM.includes('<') ? env.MAIL_FROM : `${BRAND.name} <${env.MAIL_FROM}>`;

    this.transport = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // `secure` means implicit TLS from the first byte, which is port 465.
      // Port 587 starts in the clear and upgrades, so it is `secure: false`
      // plus `requireTLS` — and the two are not interchangeable: setting
      // `secure: true` on 587 hangs until the socket times out.
      secure: env.SMTP_SECURE,
      requireTLS: !env.SMTP_SECURE,
      ...(env.SMTP_USER === undefined
        ? // mailpit accepts anything and wants no credentials. Passing an empty
          // user makes nodemailer attempt AUTH and get refused.
          {}
        : { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } }),
      // A mail server that is not answering must not hold a web request open.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: MailMessage): Promise<MailResult> {
    try {
      // nodemailer types `sendMail`'s result as `any`, so it is narrowed here
      // rather than being allowed to spread untyped values through the return.
      const info = (await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })) as { messageId?: unknown };

      return {
        sent: true,
        ...(typeof info.messageId === 'string' ? { id: info.messageId } : {}),
      };
    } catch (error) {
      // Resolved, not thrown — see `MailPort`. The caller's work is already
      // committed and must not be undone because a relay was unreachable.
      const reason = error instanceof Error ? error.message : 'unknown mail error';
      this.logger.error({ err: error, to: redact(message.to) }, 'Could not send mail');
      return { sent: false, error: reason };
    }
  }
}

/**
 * Log the domain, not the person.
 *
 * A failed send is worth investigating and the recipient's address is not worth
 * putting in a log that ships to an error tracker (docs/17 §2). The domain is
 * enough to tell "our relay is down" from "that one school's mail server".
 */
function redact(address: string): string {
  const at = address.lastIndexOf('@');
  return at === -1 ? '<redacted>' : `<redacted>@${address.slice(at + 1)}`;
}
