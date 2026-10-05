import type { AdminRole } from '@bitquiz/shared';
import { appUrl, sendEmail } from '../lib/mailer';

const ROLE_LABEL: Record<AdminRole, string> = { OWNER: 'an owner', OPERATOR: 'an organizer' };

export function sendInvitationEmail(input: {
  to: string;
  token: string;
  role: AdminRole;
  organizationName: string;
  invitedBy: string;
}) {
  return sendEmail({
    to: input.to,
    subject: `You're invited to ${input.organizationName} on BitQuiz`,
    paragraphs: [
      `${input.invitedBy} invited you to join ${input.organizationName} on BitQuiz as ${ROLE_LABEL[input.role]}.`,
      'Open the link to choose your name and password. You can then create and run live quiz competitions.',
    ],
    action: { label: 'Accept invitation', url: appUrl('/admin/accept-invite', { token: input.token }) },
    footnote: "This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.",
  });
}

export function sendPasswordResetEmail(input: { to: string; token: string }) {
  return sendEmail({
    to: input.to,
    subject: 'Reset your BitQuiz password',
    paragraphs: ['Someone asked to reset the password for your BitQuiz organizer account.'],
    action: { label: 'Choose a new password', url: appUrl('/admin/reset-password', { token: input.token }) },
    footnote:
      "This link works once and expires in 1 hour. If you didn't ask for it, ignore this email; your password stays the same.",
  });
}

export function sendVerificationEmail(input: { to: string; token: string }) {
  return sendEmail({
    to: input.to,
    subject: 'Confirm your email for BitQuiz',
    paragraphs: ['Confirm that this address belongs to your BitQuiz organizer account.'],
    action: { label: 'Confirm email', url: appUrl('/admin/verify-email', { token: input.token }) },
    footnote: "This link expires in 24 hours. If you didn't request it, ignore this email.",
  });
}
