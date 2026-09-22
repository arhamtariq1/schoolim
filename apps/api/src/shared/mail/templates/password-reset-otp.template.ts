import { BRAND } from '@ilm/utils';

import { type MailMessage } from '../mail.port';

/**
 * Six-digit password-reset OTP.
 *
 * Same rules as the signup OTP template: `BRAND` only, text + HTML, no remote
 * assets, escape attacker-controlled names.
 */
export function passwordResetOtpTemplate(input: {
  readonly to: string;
  readonly recipientName: string;
  readonly code: string;
  readonly expiresInMinutes: number;
}): MailMessage {
  const subject = `Your ${BRAND.name} password reset code`;

  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Your password reset code for ${BRAND.name} is:`,
    '',
    input.code,
    '',
    `It expires in ${String(input.expiresInMinutes)} minutes. Do not share it.`,
    '',
    'If you did not ask to reset your password, you can ignore this message.',
    '',
    `— ${BRAND.name}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2328;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e7eb;border-radius:12px;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;">Hello ${escapeHtml(input.recipientName)},</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
            Your password reset code for ${escapeHtml(BRAND.name)} is:
          </p>
          <p style="margin:0 0 24px;font-size:28px;letter-spacing:0.35em;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
            ${escapeHtml(input.code)}
          </p>
          <p style="margin:0 0 16px;font-size:12px;color:#5c6470;">
            It expires in ${String(input.expiresInMinutes)} minutes. Do not share it with anyone.
          </p>
          <p style="margin:0;font-size:12px;color:#5c6470;">
            If you did not ask to reset your password, you can ignore this message.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { to: input.to, subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
