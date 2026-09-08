import { Injectable, Logger } from '@nestjs/common';

import { type MailMessage, type MailPort, type MailResult } from './mail.port';

/**
 * The driver that sends nothing and says so.
 *
 * Two jobs, and the second is the important one:
 *
 * 1. **Tests.** The e2e suite signs up schools repeatedly. A suite that reaches
 *    a real relay is a suite that is slow, flaky, offline-hostile, and — with a
 *    consumer account behind it — a suite that will eventually get the account
 *    rate-limited for sending hundreds of identical messages to nobody.
 * 2. **A safe default.** `MAIL_DRIVER` defaults to this, so a misconfigured
 *    deployment sends no mail rather than silently sending it from the wrong
 *    address. Failing to send is recoverable; sending from an unintended
 *    identity is not.
 *
 * It logs the subject and the recipient's **domain**, never the body: the body
 * of a verification email contains a working token, and a token in a log file
 * is a credential in a log file.
 */
@Injectable()
export class LogMailer implements MailPort {
  readonly driver = 'log';

  private readonly logger = new Logger(LogMailer.name);

  // Not `async`: there is nothing to await, and the interface only asks for a
  // promise. Marking it async to look symmetrical is how a lint rule earns its
  // keep by refusing.
  send(message: MailMessage): Promise<MailResult> {
    const at = message.to.lastIndexOf('@');
    this.logger.log(
      { subject: message.subject, domain: at === -1 ? 'unknown' : message.to.slice(at + 1) },
      'Mail not sent — MAIL_DRIVER is "log"',
    );
    return Promise.resolve({ sent: true, id: 'log' });
  }
}
