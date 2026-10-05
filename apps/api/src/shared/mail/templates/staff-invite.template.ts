import { BRAND } from '@ilm/utils';

import { type MailMessage } from '../mail.port';

/**
 * "You have been added to <school>. Set your password."
 *
 * The message that replaced an administrator typing a password into a form and
 * then saying it out loud. Same rules as every template here: `BRAND` rather
 * than a literal, a text part that is not an afterthought, inline styles only,
 * and the link written out in full for anyone who will not click a button they
 * cannot read.
 *
 * ## What it deliberately does not say
 *
 * Nothing about what the account can do, and nothing about the school's data.
 * An invitation lands in a mailbox that may be shared, forwarded, or simply the
 * wrong address — a typo at the front desk is the most likely way this arrives
 * somewhere it should not. The one thing it carries is a link, which expires
 * and works once.
 */
export function staffInviteTemplate(input: {
  readonly to: string;
  readonly recipientName: string;
  readonly schoolName: string;
  readonly roleLabel: string;
  readonly inviteUrl: string;
  readonly expiresInHours: number;
}): MailMessage {
  const subject = `Set up your ${input.schoolName} account`;

  const text = [
    `Hello ${input.recipientName},`,
    '',
    `${input.schoolName} has added you as ${article(input.roleLabel)} ${input.roleLabel.toLowerCase()}.`,
    'Choose a password to finish setting up your account:',
    '',
    input.inviteUrl,
    '',
    `This link works once and expires in ${String(input.expiresInHours)} hours. If it has`,
    'expired, ask the school to send another.',
    '',
    'If you were not expecting this, you can ignore it. Nothing happens until you',
    'choose a password.',
    '',
    `— ${BRAND.name}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:'Noto Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2328;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e7eb;border-radius:12px;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;">Hello ${escapeHtml(input.recipientName)},</p>

          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
            <strong>${escapeHtml(input.schoolName)}</strong> has added you as
            ${escapeHtml(article(input.roleLabel))} ${escapeHtml(input.roleLabel.toLowerCase())}.
            Choose a password to finish setting up your account.
          </p>

          <p style="margin:0 0 24px;">
            <a href="${escapeHtml(input.inviteUrl)}"
               style="display:inline-block;padding:12px 20px;background:#147f8a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
              Set my password
            </a>
          </p>

          <p style="margin:0 0 8px;font-size:12px;color:#5c6470;">
            Or paste this into your browser:
          </p>
          <p style="margin:0 0 24px;font-size:12px;word-break:break-all;">
            <a href="${escapeHtml(input.inviteUrl)}" style="color:#147f8a;">${escapeHtml(input.inviteUrl)}</a>
          </p>

          <p style="margin:0 0 16px;font-size:12px;color:#5c6470;">
            This link works once and expires in ${String(input.expiresInHours)} hours. If it has
            expired, ask the school to send another.
          </p>

          <p style="margin:0;font-size:12px;color:#5c6470;">
            If you were not expecting this, you can ignore it — nothing happens until you choose a
            password.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { to: input.to, subject, text, html };
}

/** "an admin", "a teacher". A small thing, and it is read by a person. */
function article(roleLabel: string): string {
  return /^[aeiou]/i.test(roleLabel) ? 'an' : 'a';
}

/**
 * The school's name and the person's name are both typed at a front desk, so
 * both are attacker-controlled as far as this file is concerned. Interpolating
 * them unescaped would let a school called `<script>…` write script into a mail
 * client.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
