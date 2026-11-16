import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// In-memory test store for automated testing verification
const testInbox = new Map();

// Initialize nodemailer transporter with Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS ? env.EMAIL_PASS.replace(/\s+/g, '') : '',
  },
});

/**
 * Sends an OTP email to the recipient.
 * Delivers via Gmail SMTP when EMAIL_USER and EMAIL_PASS are configured.
 *
 * @param {{ to: string, otp: string, purpose: string }} params
 */
export const sendOtpEmail = async ({ to, otp, purpose }) => {
  const normalizedEmail = to.trim().toLowerCase();

  // In non-production environments, record in memory for test verification
  if (env.NODE_ENV !== 'production') {
    testInbox.set(`${normalizedEmail}:${purpose}`, {
      otp,
      purpose,
      sentAt: new Date(),
    });
  }

  // If email credentials are provided, send the real email via Nodemailer
  if (env.EMAIL_USER && env.EMAIL_PASS) {
    try {
      const subject =
        purpose === 'REGISTRATION'
          ? 'Verify your account - Bazarr 360'
          : purpose === 'PASSWORD_RESET'
          ? 'Reset your password - Bazarr 360'
          : 'Your Verification Code - Bazarr 360';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
          <h2 style="color: #002f34; margin-bottom: 8px;">Bazarr 360</h2>
          <p style="font-size: 15px; color: #4a5568; line-height: 1.5;">
            Use the verification code below to complete your ${purpose.toLowerCase().replace('_', ' ')}:
          </p>
          <div style="margin: 28px 0; text-align: center;">
            <span style="display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #002f34; background: #f0fdf4; padding: 14px 28px; border-radius: 8px; border: 1px dashed #22c55e;">
              ${otp}
            </span>
          </div>
          <p style="font-size: 13px; color: #718096; margin-top: 16px;">
            This code will expire in 10 minutes. If you did not request this, please ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #edf2f7; margin: 24px 0;" />
          <p style="font-size: 12px; color: #a0aec0; text-align: center;">
            &copy; ${new Date().getFullYear()} Bazarr 360. All rights reserved.
          </p>
        </div>
      `;

      await transporter.sendMail({
        from: `"Bazarr 360" <${env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject,
        html,
      });

      logger.info({ to: normalizedEmail, purpose }, 'Real OTP email dispatched via Gmail SMTP');
      return true;
    } catch (error) {
      logger.error({ error: error.message, to: normalizedEmail }, 'Failed to deliver OTP email via Gmail');
      throw error;
    }
  }

  logger.warn({ to: normalizedEmail, purpose }, 'EMAIL_USER or EMAIL_PASS not set; email dispatch skipped');
  return true;
};

/**
 * Test helper: retrieves the latest sent OTP for a given email and purpose.
 * Available strictly in non-production environments for automated testing.
 */
export const getTestSentOtp = (email, purpose = 'REGISTRATION') => {
  const normalizedEmail = email.trim().toLowerCase();
  const entry = testInbox.get(`${normalizedEmail}:${purpose}`);
  return entry ? entry.otp : null;
};
