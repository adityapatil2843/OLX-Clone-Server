export const AUTH_MESSAGES = {
  REGISTER_SUCCESS: 'User registered successfully',
  LOGIN_SUCCESS: 'Logged in successfully',
  LOGOUT_SUCCESS: 'Logged out successfully',
  REFRESH_SUCCESS: 'Token refreshed successfully',
  OTP_SENT_SUCCESS: 'Verification code sent to your email',
  OTP_VERIFIED_SUCCESS: 'Email verified successfully',
  PASSWORD_RESET_SUCCESS: 'Password reset successfully',
  INVALID_CREDENTIALS: 'Email or password is incorrect',
  USER_INACTIVE: 'Account is deactivated or suspended',
  INVALID_REFRESH_TOKEN: 'Invalid, expired, or revoked refresh token',
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists',
  PHONE_ALREADY_EXISTS: 'An account with this phone number already exists',
  UNAUTHORIZED: 'Authentication required',
  INVALID_OTP: 'Invalid or expired verification code',
  OTP_MAX_ATTEMPTS: 'Maximum verification attempts exceeded. Please request a new code.',
  OTP_EXPIRED: 'Verification code has expired. Please request a new code.',
};

export const OTP_PURPOSES = {
  REGISTRATION: 'REGISTRATION',
  LOGIN: 'LOGIN',
  PASSWORD_RESET: 'PASSWORD_RESET',
};
