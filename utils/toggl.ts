import { z } from "zod";
import { basicAuth } from "./auth.ts";

const TOGGL_USER = "api_token";
const baseURL = "https://api.track.toggl.com/api/v9/me/time_entries";

export interface TogglOptions {
  token: string;
  project: string;
}

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

export async function fetchTimeEntries(
  startDate: string,
  endDate: string,
  token: string,
) {
  const q = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    meta: "true",
  });
  const url = baseURL + "?" + q.toString();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": basicAuth(token, TOGGL_USER),
    },
  });
  if (res.ok) {
    const rawData = await res.json();
    return TimeEntries.parseAsync(rawData);
  }

  const text = await res.text();
  throw new Error(
    `Failed to fetch timeEntries: status=${res.statusText} message=${text}`,
  );
}
