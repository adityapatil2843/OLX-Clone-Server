import * as repo from './categories.repository.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors.js';
import { CATEGORY_UPDATABLE_FIELDS } from './categories.constants.js';

const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

export const listCategories = async (query) => {
  if (query.tree) {
    const all = await repo.findAllActiveCategories();
    // Build hierarchical tree
    const map = new Map();
    const roots = [];

    all.forEach((cat) => {
      map.set(cat.id, { ...cat, children: [] });
    });

    all.forEach((cat) => {
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId).children.push(map.get(cat.id));
      } else if (!cat.parentId) {
        roots.push(map.get(cat.id));
      }
    });

    return {
      data: roots,
      meta: { totalRoots: roots.length, totalCategories: all.length },
    };
  }

  const { categories, total } = await repo.listCategories(query);
  const { page, limit } = query;

  return {
    data: categories,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  };
};

export const getCategoryByIdOrSlug = async (idOrSlug) => {
  // Check if identifier is UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const category = isUuid
    ? await repo.findCategoryById(idOrSlug)
    : await repo.findCategoryBySlug(idOrSlug);

  if (!category) {
    throw new NotFoundError(`Category '${idOrSlug}' not found`);
  }

  return category;
};

export const createCategory = async (payload) => {
  const slug = payload.slug || slugify(payload.name);

  // Check slug uniqueness
  const existing = await repo.findCategoryBySlug(slug);
  if (existing) {
    throw new ConflictError(`Category with slug '${slug}' already exists`);
  }

  // Validate parent if provided
  if (payload.parentId) {
    const parent = await repo.findCategoryById(payload.parentId);
    if (!parent) {
      throw new BadRequestError(`Parent category '${payload.parentId}' does not exist`);
    }
  }

  return repo.createCategory({
    ...payload,
    slug,
  });
};

export const updateCategory = async (id, payload) => {
  const existing = await repo.findCategoryById(id);
  if (!existing) {
    throw new NotFoundError(`Category '${id}' not found`);
  }

  // Prevent setting parent to itself
  if (payload.parentId && payload.parentId === id) {
    throw new BadRequestError('A category cannot be its own parent');
  }

  // If slug is changed, check uniqueness
  if (payload.slug && payload.slug !== existing.slug) {
    const slugExists = await repo.findCategoryBySlug(payload.slug);
    if (slugExists && slugExists.id !== id) {
      throw new ConflictError(`Category with slug '${payload.slug}' already exists`);
    }
  }

  const safeData = pick(payload, CATEGORY_UPDATABLE_FIELDS);
  return repo.updateCategory(id, safeData);
};

export const deactivateCategory = async (id) => {
  const existing = await repo.findCategoryById(id);
  if (!existing) {
    throw new NotFoundError(`Category '${id}' not found`);
  }

  return repo.softDeleteCategory(id);
};
