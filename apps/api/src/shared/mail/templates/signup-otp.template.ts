import { BRAND } from '@ilm/utils';

import { type MailMessage } from '../mail.port';

/**
 * Six-digit signup OTP — the address proof that runs before a school exists.
 *
 * ## Rules (same as every mail template here)
 *
 * - **`BRAND`, never a literal product name** (CLAUDE.md / D4).
 * - **Text + HTML** — spam filters and plain-text clients both matter.
 * - **Inline styles only, no remote images** — mail clients strip `<style>` and
 *   block remote assets by default; a design that needs either arrives broken.
 * - **Escape attacker-controlled names** — the recipient name comes from signup.
 *
 * Colours match the portal brand ramp (`#147f8a` primary, `#013131` deep).
 */
export function signupOtpTemplate(input: {
  readonly to: string;
  readonly recipientName: string;
  readonly code: string;
  readonly expiresInMinutes: number;
}): MailMessage {
  const subject = `Your ${BRAND.name} verification code`;
  const spacedCode = input.code.split('').join(' ');
  const expires = String(input.expiresInMinutes);

  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Welcome to ${BRAND.name}. Enter this code to verify your email and continue setting up your school:`,
    '',
    input.code,
    '',
    `This code expires in ${expires} minutes. Do not share it with anyone.`,
    '',
    'If you did not start a signup, you can ignore this message — nothing else will be sent.',
    '',
    `— ${BRAND.name}`,
  ].join('\n');

  // Table layout + inline styles only. Nested tables beat flex/grid in Outlook.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f3f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1d21;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f0f3f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;border-collapse:separate;">

          <!-- Brand header -->
          <tr>
            <td style="background-color:#013131;background-image:linear-gradient(145deg,#013131 0%,#147f8a 100%);border-radius:16px 16px 0 0;padding:28px 32px;">
              <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.72);">
                ${escapeHtml(BRAND.name)}
              </p>
              <p style="margin:8px 0 0;font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">
                Verify your email
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-left:1px solid #e4e8eb;border-right:1px solid #e4e8eb;">
              <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a1d21;">
                Hello ${escapeHtml(input.recipientName)},
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#4a5560;">
                Use the code below to confirm your email and continue setting up your school on ${escapeHtml(BRAND.name)}.
              </p>

              <!-- Code card -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
                <tr>
                  <td align="center" style="background-color:#f0fafb;border:1px solid #c5e4e8;border-radius:12px;padding:24px 16px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#147f8a;">
                      Verification code
                    </p>
                    <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.4em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#013131;line-height:1.2;">
                      ${escapeHtml(spacedCode)}
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#f7f8fa;border-radius:8px;padding:14px 16px;">
                    <p style="margin:0;font-size:13px;line-height:1.5;color:#5c6470;">
                      <strong style="color:#1a1d21;">Expires in ${escapeHtml(expires)} minutes.</strong>
                      Enter it on the verification screen — do not share it with anyone.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;line-height:1.55;color:#8a929c;">
                If you did not start a signup, you can ignore this message. Nothing else will be sent to this address.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#fafbfc;border:1px solid #e4e8eb;border-top:0;border-radius:0 0 16px 16px;padding:20px 32px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8a929c;text-align:center;">
                Sent by ${escapeHtml(BRAND.name)} · Your school's data stays yours
              </p>
            </td>
          </tr>

        </table>
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
