import { z } from "zod";
import { basicAuth } from "./auth.ts";

const baseURL = 'https://api.track.toggl.com/api/v9/me/time_entries';

export const TimeEntry = z.object({
  id: z.number(),
  project_name: z.string().optional(),
  tags: z.string().array(),
  workspace_id: z.number(),
  duration: z.number(),
  description: z.string(),
  start: z.string(),
  stop: z.string().nullable(),
});
export type TimeEntry = z.infer<typeof TimeEntry>;

export const TimeEntries = z.array(TimeEntry);
export type TimeEntries = z.infer<typeof TimeEntries>;

export async function fetchTimeEntries(user: string, password: string, startDate: string, endDate: string) {
  const q = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    meta: "true",
  })
  const url = baseURL + '?' + q.toString()
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      "Content-Type": "application/json",
      "Authorization": basicAuth(user, password),
    },
  });
  if (res.ok) {
    const rawData = await res.json();
    return TimeEntries.parseAsync(rawData);
  }

  const text = await res.text();
  throw new Error(`Failed to fetch timeEntries: status=${res.statusText} message=${text}`);
}