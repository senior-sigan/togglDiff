import { z } from "zod";
import { basicAuth } from "./auth.ts";

export interface JiraOptions {
  host: string;
  username: string; // email
  token: string;
}

const SearchResponse = z.object({
  issues: z.array(
    z.object({
      key: z.string(),
    }),
  ),
});

const baseContentSchema = z.object({
  // Обычно это делают как discriminated-unions, но это не заработало вместе с рекурсивным типом.
  type: z.string(),
  text: z.string().optional(), // если type = text
});

type Content = z.infer<typeof baseContentSchema> & {
  content?: Content[]; // не определено, если тип листовой, например text
};

// see: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
const ContentSchema: z.ZodType<Content> = baseContentSchema.extend({
  content: z.lazy(() => ContentSchema.array().optional()),
});

const WorklogResponse = z.object({
  worklogs: z.array(
    z.object({
      author: z.object({
        displayName: z.string(),
      }),
      timeSpent: z.string(),
      timeSpentSeconds: z.number(),
      started: z.string(),
      comment: ContentSchema.optional(),
    }),
  ),
});

function flattenContent(content: Content | undefined): string {
  // Flattens recursive atlassian document format
  if (!content) {
    return "";
  }

  if (content.type === "text") {
    return content.text ?? "";
  }

  const parts = content.content?.map((child) => flattenContent(child));
  return parts?.join("; ") ?? "";
}

async function fetchIssueKeysPage(
  page: number,
  fromDate: string,
  tillDate: string,
  jiraOptions: JiraOptions,
) {
  const q = new URLSearchParams({
    fields: "key",
    startAt: `${page}`,
    jql: `worklogDate >= "${fromDate}" and worklogDate < "${tillDate}"`,
  }).toString();
  const url = new URL(`/rest/api/3/search?${q}`, jiraOptions.host);
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(jiraOptions.username, jiraOptions.token),
    },
  });
  const rawData = await resp.json();
  const data = SearchResponse.parse(rawData);
  return data.issues.map((issue) => issue.key);
}

async function* fetchIssueKeysGen(
  fromDate: string,
  tillDate: string,
  jiraOptions: JiraOptions,
) {
  let page = 0;
  while (true) {
    const issueKeys = await fetchIssueKeysPage(
      page,
      fromDate,
      tillDate,
      jiraOptions,
    );
    page += issueKeys.length;
    if (issueKeys.length === 0) {
      return;
    }
    yield issueKeys;
  }
}

async function fetchIssueKeys(
  fromDate: string,
  tillDate: string,
  jiraOptions: JiraOptions,
) {
  const keysIterator = fetchIssueKeysGen(fromDate, tillDate, jiraOptions);

  const keys = new Array<string>();
  for await (const key of keysIterator) {
    keys.push(...key);
  }
  return keys;
}

async function fetchWorkload(
  issueKey: string,
  fromDate: string,
  tillDate: string,
  jiraOptions: JiraOptions,
) {
  const url = new URL(
    `/rest/api/3/issue/${issueKey}/worklog`,
    jiraOptions.host,
  );
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(jiraOptions.username, jiraOptions.token),
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Failed to get worklog: status=${resp.statusText} body="${text}"`,
    );
  }

  const rawData = await resp.json();
  const data = WorklogResponse.parse(rawData);

  return data.worklogs
    .filter((wl) => wl.started >= fromDate && wl.started < tillDate)
    .map((wl) => ({
      issueKey: issueKey,
      name: wl.author.displayName.toLowerCase().trim(),
      timeSeconds: wl.timeSpentSeconds,
      time: wl.timeSpent,
      started: wl.started.substring(0, 10),
      comment: flattenContent(wl.comment),
    }));
}

export async function fetchReports(
  fromDate: string,
  tillDate: string,
  jiraOptions: JiraOptions,
) {
  const keys = await fetchIssueKeys(fromDate, tillDate, jiraOptions);

  const jobs = keys.map((key) =>
    fetchWorkload(key, fromDate, tillDate, jiraOptions)
  );
  const results = (await Promise.all(jobs)).flatMap((el) => el);
  return results;
}

export type JiraReports = Awaited<ReturnType<typeof fetchReports>>;
