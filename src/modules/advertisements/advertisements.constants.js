export const AD_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
});

export const AD_TARGET_TYPE = Object.freeze({
  LISTING: 'LISTING',
  REEL: 'REEL',
});

export const AD_PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

export const AD_MESSAGES = Object.freeze({
  INSUFFICIENT_COINS: 'Insufficient coins for this boost package',
  ACTIVE_BOOST_EXISTS: 'An active boost already exists for this target',
  TARGET_NOT_FOUND: 'Target content not found',
  FORBIDDEN_TARGET: 'You can only boost your own content',
  INVALID_TARGET_STATUS: 'Target content is not eligible for boosting',
  PACKAGE_NOT_FOUND: 'Boost package not found',
  PACKAGE_INACTIVE: 'Selected boost package is currently inactive',
  AD_NOT_FOUND: 'Advertisement not found',
  FORBIDDEN_VIEW: 'You do not have permission to view this advertisement',
  FORBIDDEN_ACTION: 'You do not have permission to perform this action on this advertisement',
});
