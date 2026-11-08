import * as repo from './users.repository.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import { USER_UPDATABLE_PROFILE_FIELDS } from './users.constants.js';
import { uploadBufferToCloudinary, optimizeCloudinaryUrl } from '../../integrations/storage/cloudinary.service.js';

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

const formatUser = (user) => {
  if (!user) return user;
  return {
    ...user,
    avatarUrl: user.avatarUrl ? optimizeCloudinaryUrl(user.avatarUrl) : null,
  };
};

export const getUserProfile = async (userId, isSelf = false) => {
  const user = await repo.findUserById(userId, !isSelf);
  if (!user) {
    throw new NotFoundError(`User '${userId}' not found`);
  }
  return formatUser(user);
};

export const listUsers = async (query) => {
  const { users, total } = await repo.listUsers(query);
  const { page, limit } = query;

  return {
    data: users.map(formatUser),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  };
};

export const updateUserProfile = async (userId, payload, file = null) => {
  const existing = await repo.findUserById(userId, false);
  if (!existing) {
    throw new NotFoundError(`User '${userId}' not found`);
  }

  // Allowlist updatable fields only
  const safeData = pick(payload, USER_UPDATABLE_PROFILE_FIELDS);

  // If an avatar image file is uploaded, stream it to Cloudinary and update avatarUrl
  if (file && file.buffer) {
    const uploaded = await uploadBufferToCloudinary(file.buffer, {
      folder: `avatars/${userId}`,
      publicId: `avatar_${Date.now()}`,
      resourceType: 'image',
    });
    safeData.avatarUrl = uploaded.secure_url || uploaded.url || `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${uploaded.public_id}`;
  }

  if (Object.keys(safeData).length === 0) {
    throw new BadRequestError('No valid profile fields provided for update');
  }

  const updated = await repo.updateUserProfile(userId, safeData);
  return formatUser(updated);
};

export const deleteUser = async (userId) => {
  const existing = await repo.findUserById(userId, false);
  if (!existing) {
    throw new NotFoundError(`User '${userId}' not found`);
  }

  return repo.softDeleteUser(userId);
};
