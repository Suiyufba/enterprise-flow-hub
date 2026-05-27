import { z } from "zod";

export const FileSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  storagePath: z.string(),
  uploadedBy: z.string().nullable(),
  relatedType: z.string().nullable(),
  relatedId: z.string().nullable(),
  createdAt: z.string(),
});

export type FileRecord = z.infer<typeof FileSchema>;
