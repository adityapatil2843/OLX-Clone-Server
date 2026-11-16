import { z } from 'zod';

const uuid = z.string().uuid('Must be a valid UUID');

export const boostPackageIdParamSchema = z.object({
  id: uuid,
});
