import { z } from "zod";

export const ReportEntry = z.object({
  description: z.string(),
  duration: z.number(),
  taskID: z.string(),
  date: z.string(),
});

export type ReportEntry = z.infer<typeof ReportEntry>;

export interface ReportPreview {
  description: string;
  duration: number;
  taskID: string | undefined;
  date: string;
}
