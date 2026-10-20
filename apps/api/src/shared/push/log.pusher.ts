import { Injectable, Logger } from '@nestjs/common';

import { type PushMessage, type PushPort, type PushResult } from './push.port';

/**
 * The driver that pushes nothing and says so.
 *
 * The default when no Firebase credential is configured, for the same reason
 * `MAIL_DRIVER` defaults to `log`: a deployment that forgot to configure push
 * should send none rather than fail to boot or fail a request. The in-app bell
 * works either way.
 *
 * Logs how many devices, never the title or body — a notification can carry a
 * child's name.
 */
@Injectable()
export class LogPusher implements PushPort {
  readonly driver = 'log';

  private readonly logger = new Logger(LogPusher.name);

  send(message: PushMessage): Promise<PushResult> {
    this.logger.debug({ devices: message.tokens.length }, 'Push not sent — no Firebase credential');
    return Promise.resolve({ invalidTokens: [], sent: 0, failed: 0 });
  }
}
