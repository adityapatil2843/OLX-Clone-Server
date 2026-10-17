export const USER_UPDATABLE_PROFILE_FIELDS = Object.freeze([
  'name',
  'bio',
  'avatarUrl',
  'locationState',
  'locationCity',
]);

// Fields strictly forbidden from user self-modification
export const USER_RESTRICTED_FIELDS = Object.freeze([
  'role',
  'isVerifiedSeller',
  'isActive',
  'deletedAt',
  'createdAt',
  'updatedAt',
]);

export const USER_PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
});
