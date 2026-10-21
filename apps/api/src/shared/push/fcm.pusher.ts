import { Logger } from '@nestjs/common';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import { type PushMessage, type PushPort, type PushResult } from './push.port';

/** FCM accepts at most 500 tokens in one multicast. */
const FCM_BATCH = 500;

/** Error codes that mean the token is dead for good, not that FCM had a bad moment. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** The fields of a Firebase service-account key this driver reads. */
export interface FirebaseServiceAccount {
  readonly project_id: string;
  readonly client_email: string;
  readonly private_key: string;
}

/** Parses the service-account JSON from the environment, or says why it cannot. */
export function parseServiceAccount(raw: string): FirebaseServiceAccount {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['project_id'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['client_email'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['private_key'] !== 'string'
  ) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain project_id, client_email and private_key.');
  }
  const record = parsed as Record<string, string>;
  return {
    project_id: record['project_id'] ?? '',
    client_email: record['client_email'] ?? '',
    /**
     * A PEM key pasted into `.env` usually arrives double-escaped.
     *
     * `JSON.parse` already turns a single `\n` inside the JSON string into a
     * real newline, so a correctly-escaped credential needs nothing here. What
     * this handles is the common paste mistake — `\\n` in the file, which
     * survives parsing as a literal backslash and an `n`, and makes the PEM
     * unreadable to `crypto` with an error that names neither the file nor the
     * variable.
     *
     * This read `/\n/g` — a newline replaced by a newline, which is a no-op
     * that left the case the comment described still broken.
     */
    private_key: (record['private_key'] ?? '').replace(/\\n/g, '\n'),
  };
}

/**
 * Firebase Cloud Messaging, through the Admin SDK.
 *
 * Delivery errors never throw: they are reported in the result so the caller
 * can drop dead tokens, and logged without the token (it is a credential to
 * push to that device).
 */
export class FcmPusher implements PushPort {
  readonly driver = 'fcm';

  private readonly logger = new Logger(FcmPusher.name);
  private readonly messaging: Messaging;

  constructor(account: FirebaseServiceAccount) {
    const app: App =
      getApps().find((candidate) => candidate.name === 'ilm-push') ??
      initializeApp(
        {
          credential: cert({
            projectId: account.project_id,
            clientEmail: account.client_email,
            privateKey: account.private_key,
          }),
        },
        'ilm-push',
      );
    this.messaging = getMessaging(app);
  }

  async send(message: PushMessage): Promise<PushResult> {
    const invalidTokens: string[] = [];
    let sent = 0;
    let failed = 0;

    for (let start = 0; start < message.tokens.length; start += FCM_BATCH) {
      const tokens = message.tokens.slice(start, start + FCM_BATCH);
      try {
        const response = await this.messaging.sendEachForMulticast({
          tokens,
          // A data-only message: the service worker draws the notification
          // itself, so foreground and background look the same and a click can
          // be routed by the app rather than by a URL baked in here.
          data: { title: message.title, ...(message.body === undefined ? {} : { body: message.body }), ...message.data },
          webpush: { headers: { Urgency: 'high', TTL: '86400' } },
        });
        sent += response.successCount;
        failed += response.failureCount;
        response.responses.forEach((result, index) => {
          const token = tokens[index];
          if (!result.success && token !== undefined && DEAD_TOKEN_CODES.has(result.error?.code ?? '')) {
            invalidTokens.push(token);
          }
        });
      } catch (error) {
        failed += tokens.length;
        this.logger.warn({ err: error instanceof Error ? error.message : 'unknown' }, 'FCM batch failed');
      }
    }

    return { invalidTokens, sent, failed };
  }
}
