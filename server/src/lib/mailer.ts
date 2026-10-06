import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env';
import { logger } from './logger';

export interface Email {
  to: string;
  subject: string;
  /** Short plain-text intro paragraphs. */
  paragraphs: string[];
  action: { label: string; url: string };
  /** Small print under the button, e.g. expiry and "ignore this if…". */
  footnote: string;
}

/**
 * How email leaves the server:
 * - `brevo`: Brevo's HTTPS API. Works on hosts that block SMTP ports (e.g. Render's free plan).
 * - `smtp`: any SMTP server (Gmail app password, a VPS relay, …).
 * - `log`: nothing is sent; messages go to the server log (local development and tests).
 */
export type EmailMode = 'brevo' | 'smtp' | 'log';

export function emailMode(): EmailMode {
  if (env.BREVO_API_KEY) return 'brevo';
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) return 'smtp';
  return 'log';
}

/** True when real email delivery is configured; otherwise emails are written to the server log. */
export function emailConfigured(): boolean {
  return emailMode() !== 'log';
}

/** Messages "sent" while email delivery isn't configured; lets tests and local runs follow the links. */
export const devOutbox: Email[] = [];

/** Sender as { name, email }, from MAIL_FROM ("Name <address>" or a bare address) or SMTP_USER. */
export function sender(): { name: string; email: string } {
  const raw = env.MAIL_FROM?.trim() || env.SMTP_USER || '';
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return match ? { name: match[1]?.trim() || 'BitQuiz', email: match[2]!.trim() } : { name: 'BitQuiz', email: raw };
}

/** Absolute link into the web app, e.g. appUrl('/admin/reset-password', { token }). */
export function appUrl(path: string, query: Record<string, string> = {}): string {
  const url = new URL(path, env.PUBLIC_URL.replace(/\/$/, '') + '/');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Sends a transactional email, or logs it when delivery isn't configured so every flow can
 * still be completed locally. Throws when a configured provider rejects or times out.
 */
export async function sendEmail(email: Email): Promise<void> {
  const mode = emailMode();
  if (mode === 'log') {
    devOutbox.push(email);
    if (devOutbox.length > 50) devOutbox.shift();
    logger.warn(
      { to: email.to, subject: email.subject, link: email.action.url },
      'Email delivery is not configured; logging the message instead',
    );
    return;
  }
  const text = [...email.paragraphs, `${email.action.label}: ${email.action.url}`, email.footnote].join('\n\n');
  const html = renderHtml(email);
  if (mode === 'brevo') await sendWithBrevo(email, text, html);
  else await sendWithSmtp(email, text, html);
  logger.info({ to: email.to, subject: email.subject, via: mode }, 'Email sent');
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function sendWithBrevo(email: Email, text: string, html: string): Promise<void> {
  const from = sender();
  if (!from.email) throw new Error('MAIL_FROM must be set to a sender address verified in Brevo');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: from,
      to: [{ email: email.to }],
      subject: email.subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo rejected the email (${response.status}): ${detail.slice(0, 300)}`);
  }
}

let smtpTransport: Transporter | undefined;

async function sendWithSmtp(email: Email, text: string, html: string): Promise<void> {
  smtpTransport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const from = sender();
  await smtpTransport.sendMail({
    from: { name: from.name, address: from.email },
    to: email.to,
    subject: email.subject,
    text,
    html,
  });
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function renderHtml(email: Email): string {
  const paragraphs = email.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#1f2937">${escapeHtml(p)}</p>`)
    .join('');
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px" cellpadding="0" cellspacing="0">
      <tr><td>
        <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#070b16">Bit<span style="color:#0891b2">Quiz</span></p>
        ${paragraphs}
        <p style="margin:24px 0">
          <a href="${escapeHtml(email.action.url)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${escapeHtml(email.action.label)}</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all;color:#0891b2">${escapeHtml(email.action.url)}</span></p>
        <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b7280">${escapeHtml(email.footnote)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
