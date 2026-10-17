import { prisma } from '../../db/prisma.js';

export const findCategoryById = async (id) => {
  return prisma.category.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: {
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      },
    },
  });
};

export const findCategoryBySlug = async (slug) => {
  return prisma.category.findUnique({
    where: { slug },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: {
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      },
    },
  });
};

export const listCategories = async ({ includeInactive = false, parentId, page = 1, limit = 50 }) => {
  const where = {
    ...(!includeInactive ? { isActive: true } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
  };

  const skip = (page - 1) * limit;

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      skip,
      take: limit,
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { children: true } },
      },
    }),
    prisma.category.count({ where }),
  ]);

  return { categories, total };
};

export const findAllActiveCategories = async () => {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });
};

export const createCategory = async (data) => {
  return prisma.category.create({
    data,
    include: {
      parent: { select: { id: true, name: true, slug: true } },
    },
  });
};

export const updateCategory = async (id, data) => {
  return prisma.category.update({
    where: { id },
    data,
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: true,
    },
  });
};

export const softDeleteCategory = async (id) => {
  return prisma.category.update({
    where: { id },
    data: { isActive: false },
  });
};
