import * as repo from './users.repository.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import { USER_UPDATABLE_PROFILE_FIELDS } from './users.constants.js';

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

export const getUserProfile = async (userId, isSelf = false) => {
  const user = await repo.findUserById(userId, !isSelf);
  if (!user) {
    throw new NotFoundError(`User '${userId}' not found`);
  }
  return user;
};

export const listUsers = async (query) => {
  const { users, total } = await repo.listUsers(query);
  const { page, limit } = query;

  return {
    data: users,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  };
};

export const updateUserProfile = async (userId, payload) => {
  const existing = await repo.findUserById(userId, false);
  if (!existing) {
    throw new NotFoundError(`User '${userId}' not found`);
  }

  // Allowlist updatable fields only
  const safeData = pick(payload, USER_UPDATABLE_PROFILE_FIELDS);

  if (Object.keys(safeData).length === 0) {
    throw new BadRequestError('No valid profile fields provided for update');
  }

  return repo.updateUserProfile(userId, safeData);
};

export const deleteUser = async (userId) => {
  const existing = await repo.findUserById(userId, false);
  if (!existing) {
    throw new NotFoundError(`User '${userId}' not found`);
  }

  return repo.softDeleteUser(userId);
};
