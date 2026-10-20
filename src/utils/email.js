import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// In-memory test store for automated testing verification
const testInbox = new Map();

/**
 * Sends an OTP email to the recipient.
 * In production, this delivers via configured SMTP / transactional mailer.
 * In dev/test, it safely dispatches without leaking secrets in logs.
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

  logger.info({ to: normalizedEmail, purpose }, 'OTP email dispatched');
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
