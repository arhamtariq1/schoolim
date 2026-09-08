import { BRAND } from '@ilm/utils';

import { type MailMessage } from '../mail.port';

/**
 * "Confirm your email address."
 *
 * Written as a plain function returning both parts rather than as a React Email
 * component. docs/05 reserves `@ilm/email` for React Email templates shared by
 * the API and a preview app; that package earns its keep at about the fourth
 * template, and this is the first. Moving one function later is cheap. Standing
 * up a package, a build step and a preview harness for one message is not.
 *
 * ## Rules this template obeys
 *
 * - **`BRAND`, never a literal.** The product name is decision D4 and every
 *   user-visible string reads from one constant (CLAUDE.md). CI greps for it.
 * - **The text part is not an afterthought.** Some people read it, and every
 *   spam filter does; an HTML-only message scores badly before anyone sees it.
 * - **No images, no external CSS, no tracking pixel.** Inline styles only —
 *   every mail client strips a `<style>` block, and half of them block remote
 *   images by default, so a design that needs either is a design that arrives
 *   broken.
 * - **The link is written out in full**, because a person who does not trust a
 *   button should be able to read where it goes before clicking it.
 */
export function verifyEmailTemplate(input: {
  readonly to: string;
  readonly recipientName: string;
  readonly schoolName: string;
  readonly verifyUrl: string;
  readonly expiresInHours: number;
}): MailMessage {
  const subject = `Confirm your email for ${input.schoolName}`;

  const text = [
    `Hello ${input.recipientName},`,
    '',
    `You created ${input.schoolName} on ${BRAND.name}. Confirm this email address so you can`,
    'reset your password if you ever lose it, and so we can reach you about your account.',
    '',
    input.verifyUrl,
    '',
    `This link works once and expires in ${String(input.expiresInHours)} hours.`,
    '',
    'If you did not create this account, you can ignore this message — nothing will be sent',
    'to you again.',
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
            You created <strong>${escapeHtml(input.schoolName)}</strong> on ${escapeHtml(BRAND.name)}.
            Confirm this email address so you can reset your password if you ever lose it, and so we
            can reach you about your account.
          </p>

          <p style="margin:0 0 24px;">
            <a href="${escapeHtml(input.verifyUrl)}"
               style="display:inline-block;padding:12px 20px;background:#1f7a5a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
              Confirm email address
            </a>
          </p>

          <p style="margin:0 0 8px;font-size:12px;color:#5c6470;">
            Or paste this into your browser:
          </p>
          <p style="margin:0 0 24px;font-size:12px;word-break:break-all;">
            <a href="${escapeHtml(input.verifyUrl)}" style="color:#1f7a5a;">${escapeHtml(input.verifyUrl)}</a>
          </p>

          <p style="margin:0 0 16px;font-size:12px;color:#5c6470;">
            This link works once and expires in ${String(input.expiresInHours)} hours.
          </p>

          <p style="margin:0;font-size:12px;color:#5c6470;">
            If you did not create this account, you can ignore this message — nothing will be sent to
            you again.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { to: input.to, subject, text, html };
}

/**
 * The school name and the recipient's name are attacker-controlled: both come
 * straight from a public signup form. Interpolating them into HTML unescaped
 * would let a school called `<script>…` write script into a mail client.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
