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

let transport: Transporter | null | undefined;

/** Messages "sent" while email delivery isn't configured; lets tests and local runs follow the links. */
export const devOutbox: Email[] = [];

/** True when real email delivery is configured; otherwise emails are written to the server log. */
export function emailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function getTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  transport = emailConfigured()
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      })
    : null;
  return transport;
}

/** Absolute link into the web app, e.g. appUrl('/admin/reset-password', { token }). */
export function appUrl(path: string, query: Record<string, string> = {}): string {
  const url = new URL(path, env.PUBLIC_URL.replace(/\/$/, '') + '/');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Sends a transactional email. Without SMTP settings (local development) the message and its
 * link are logged instead, so every flow can still be completed.
 */
export async function sendEmail(email: Email): Promise<void> {
  const smtp = getTransport();
  if (!smtp) {
    devOutbox.push(email);
    if (devOutbox.length > 50) devOutbox.shift();
    logger.warn(
      { to: email.to, subject: email.subject, link: email.action.url },
      'Email delivery is not configured (SMTP_*); logging the message instead',
    );
    return;
  }
  await smtp.sendMail({
    from: env.MAIL_FROM ?? `BitQuiz <${env.SMTP_USER}>`,
    to: email.to,
    subject: email.subject,
    text: [...email.paragraphs, `${email.action.label}: ${email.action.url}`, email.footnote].join('\n\n'),
    html: renderHtml(email),
  });
  logger.info({ to: email.to, subject: email.subject }, 'Email sent');
}

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
