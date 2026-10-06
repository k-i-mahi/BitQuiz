import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../src/env';
import { appUrl, emailMode, sender } from '../src/lib/mailer';

const original = { ...env };
afterEach(() => Object.assign(env, original));

describe('mailer settings', () => {
  it('prefers the Brevo API over SMTP and falls back to logging', () => {
    Object.assign(env, { BREVO_API_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' });
    expect(emailMode()).toBe('log');
    Object.assign(env, { SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x' });
    expect(emailMode()).toBe('smtp');
    Object.assign(env, { BREVO_API_KEY: 'key' });
    expect(emailMode()).toBe('brevo');
  });

  it('parses the sender from MAIL_FROM in either format', () => {
    Object.assign(env, { MAIL_FROM: 'IEEE CS KUET <club@gmail.com>' });
    expect(sender()).toEqual({ name: 'IEEE CS KUET', email: 'club@gmail.com' });
    Object.assign(env, { MAIL_FROM: 'club@gmail.com' });
    expect(sender()).toEqual({ name: 'BitQuiz', email: 'club@gmail.com' });
    Object.assign(env, { MAIL_FROM: undefined, SMTP_USER: 'relay@gmail.com' });
    expect(sender()).toEqual({ name: 'BitQuiz', email: 'relay@gmail.com' });
  });

  it('builds absolute links from PUBLIC_URL', () => {
    Object.assign(env, { PUBLIC_URL: 'https://bitquiz.example.com/' });
    expect(appUrl('/admin/accept-invite', { token: 'abc' })).toBe(
      'https://bitquiz.example.com/admin/accept-invite?token=abc',
    );
  });
});
