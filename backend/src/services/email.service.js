import nodemailer from 'nodemailer';

import { env } from '../config/env.js';

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function createEmailService({ transport, fromAddress, verificationUrl, passwordResetUrl }) {
  return Object.freeze({
    async sendEmailVerification({ recipientEmail, recipientName, token }) {
      const url = new URL(verificationUrl);
      url.searchParams.set('token', token);

      const safeName = escapeHtml(recipientName);
      const verificationLink = url.toString();
      const safeVerificationLink = escapeHtml(verificationLink);

      await transport.sendMail({
        from: fromAddress,
        to: recipientEmail,
        subject: 'Verify your email address',
        text: `Hello ${recipientName},\n\nVerify your email address using this link (valid for 24 hours):\n${verificationLink}\n\nIf you did not create this account, ignore this email.`,
        html: `<p>Hello ${safeName},</p><p>Verify your email address using the link below. It is valid for 24 hours.</p><p><a href="${safeVerificationLink}">Verify email</a></p><p>If you did not create this account, ignore this email.</p>`,
      });
    },

    async sendPasswordReset({ recipientEmail, recipientName, token }) {
      const url = new URL(passwordResetUrl);
      url.searchParams.set('token', token);

      const safeName = escapeHtml(recipientName);
      const resetLink = url.toString();
      const safeResetLink = escapeHtml(resetLink);

      await transport.sendMail({
        from: fromAddress,
        to: recipientEmail,
        subject: 'Reset your password',
        text: `Hello ${recipientName},\n\nReset your password using this link (valid for 30 minutes):\n${resetLink}\n\nIf you did not request this change, ignore this email.`,
        html: `<p>Hello ${safeName},</p><p>Reset your password using the link below. It is valid for 30 minutes.</p><p><a href="${safeResetLink}">Reset password</a></p><p>If you did not request this change, ignore this email.</p>`,
      });
    },
  });
}

export function createSmtpTransportOptions(configuration) {
  const auth = configuration.SMTP_USER
    ? {
        user: configuration.SMTP_USER,
        pass: configuration.SMTP_PASSWORD,
      }
    : undefined;

  return {
    host: configuration.SMTP_HOST,
    port: configuration.SMTP_PORT,
    secure: configuration.SMTP_SECURE,
    requireTLS: configuration.NODE_ENV === 'production' && !configuration.SMTP_SECURE,
    connectionTimeout: configuration.SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: configuration.SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: configuration.SMTP_SOCKET_TIMEOUT_MS,
    auth,
    tls:
      configuration.NODE_ENV === 'production'
        ? {
            minVersion: 'TLSv1.2',
          }
        : undefined,
  };
}

function createRuntimeTransport() {
  if (env.EMAIL_PROVIDER === 'memory') {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport(createSmtpTransportOptions(env));
}

export const emailService = createEmailService({
  transport: createRuntimeTransport(),
  fromAddress: env.EMAIL_FROM,
  verificationUrl: env.EMAIL_VERIFICATION_URL,
  passwordResetUrl: env.PASSWORD_RESET_URL,
});
