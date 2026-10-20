export const CATEGORY_PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 200,
});

export const CATEGORY_UPDATABLE_FIELDS = Object.freeze([
  'name',
  'slug',
  'description',
  'iconUrl',
  'parentId',
  'isActive',
  'displayOrder',
  'attributes',
]);
