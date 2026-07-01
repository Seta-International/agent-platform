import { z } from 'zod';

const ACCOUNT_STATUS = ['none', 'active', 'suspended'] as const;
const EMPLOYMENT = ['active', 'terminated'] as const;

/** URL search schema for the admin Directory (server-side filters, cached in the URL). */
export const directorySearchSchema = z.object({
  q: z.string().optional(),
  status: z.enum(ACCOUNT_STATUS).optional(),
  employment: z.enum(EMPLOYMENT).optional(),
  group: z.string().optional(),
  page: z.coerce.number().int().nonnegative().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export type DirectorySearch = z.infer<typeof directorySearchSchema>;
