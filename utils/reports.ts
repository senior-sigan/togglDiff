import {
  fetchMyself,
  fetchReports,
  JiraOptions,
  JiraReports,
} from "../utils/jira.ts";
import { ReportEntry, ReportPreview } from "../utils/models.ts";
import { fetchTimeEntries, TimeEntries, TogglOptions } from "../utils/toggl.ts";

async function myJiraReports(
  fromDate: string,
  tillDate: string,
  options: JiraOptions,
) {
  const [me, reports] = await Promise.all([
    fetchMyself(options),
    fetchReports(fromDate, tillDate, options),
  ]);
  return reports.filter((report) => report.name == me.displayName);
}

async function projectToggleEntries(
  fromDate: string,
  tillDate: string,
  options: TogglOptions,
) {
  const entries = await fetchTimeEntries(
    fromDate,
    tillDate,
    options.token,
  );
  return entries.filter((entry) => entry.project_name === options.project);
}

function dateTimeToDate(dateTime: string) {
  return dateTime.slice(0, 10);
}

function align<T>({
  jira,
  toggl,
}: {
  jira: Map<string, T>;
  toggl: Map<string, T>;
}): { jira?: T; toggl?: T }[] {
  const aligned = new Array<{ jira?: T; toggl?: T }>();

  for (const [k, jiraEntry] of jira.entries()) {
    const togglEntry = toggl.get(k);
    if (togglEntry) {
      toggl.delete(k);
    }
    aligned.push({
      jira: jiraEntry,
      toggl: togglEntry,
    });
  }

  for (const [k, togglEntry] of toggl.entries()) {
    const jiraEntry = jira.get(k);
    if (jiraEntry) {
      jira.delete(k);
    }
    aligned.push({
      jira: jiraEntry,
      toggl: togglEntry,
    });
  }

  return aligned;
}

function groupByText(reports: ReportPreview[]) {
  const uniqueReports = new Map<string, ReportPreview>();

  reports.forEach((report) => {
    const prev = uniqueReports.get(report.description);
    if (prev) {
      prev.duration += report.duration;
    } else {
      uniqueReports.set(report.description, report);
    }
  });

  return uniqueReports;
}

function splitDescription(text: string, reg: RegExp) {
  const m = text.match(reg);
  if (!m) {
    return null;
  }
  const id = m[0].trim();
  const description = text.slice(m[0].length).trim();
  return { id, description };
}

function parseDescription(description: string) {
  if (description.length == 0) {
    return { id: undefined, description: "" };
  }

  const r1 = splitDescription(description, /^#([a-zA-Z0-9_\-]+)\s+/g); // #DEV-42 text
  if (r1) {
    r1.id = r1.id.slice(1);
    return r1;
  }

  const r2 = splitDescription(description, /^([a-zA-Z0-9_\-]+):\s+/g); // DEV-42: text
  if (r2) {
    r2.id = r2.id.slice(0, -1);
    return r2;
  }

  return { id: undefined, description };
}

function joinReports(jiraEntries: JiraReports, togglEntries: TimeEntries) {
  const days = new Map<
    string,
    { jira: ReportEntry[]; toggl: ReportPreview[] }
  >();
  togglEntries.forEach((togglEntry) => {
    const date = dateTimeToDate(togglEntry.start);
    const value = days.get(date);
    const { id, description } = parseDescription(togglEntry.description);
    const entry = {
      duration: togglEntry.duration,
      description,
      taskID: id,
      date: togglEntry.start,
    };
    if (value) {
      value.toggl.push(entry);
    } else {
      days.set(date, {
        jira: [],
        toggl: [entry],
      });
    }
  });
  jiraEntries.forEach((jiraEntry) => {
    const date = jiraEntry.started;
    const value = days.get(date);
    const entry = {
      duration: jiraEntry.timeSeconds,
      description: jiraEntry.comment,
      taskID: jiraEntry.issueKey,
      date,
    };
    if (value) {
      value.jira.push(entry);
    } else {
      days.set(date, {
        jira: [entry],
        toggl: [],
      });
    }
  });

  return Array.from(days.entries(), ([date, value]) => ({
    date,
    jira: groupByText(value.jira),
    toggl: groupByText(value.toggl),
  }));
}

export async function getJoinedReports(
  startDate: string,
  endDate: string,
  jiraOptions: JiraOptions,
  togglOptions: TogglOptions,
) {
  const [togglEntries, jiraEntries] = await Promise.all([
    projectToggleEntries(startDate, endDate, togglOptions),
    myJiraReports(startDate, endDate, jiraOptions),
  ]);

  const reports = joinReports(jiraEntries, togglEntries).map((report) => ({
    date: report.date,
    reports: align({ jira: report.jira, toggl: report.toggl }),
  })).map((entry) => {
    let jiraDuration = 0;
    let togglDuration = 0;
    entry.reports.forEach((report) => {
      jiraDuration += report.jira?.duration ?? 0;
      togglDuration += report.toggl?.duration ?? 0;
    });
    return {
      ...entry,
      jiraDuration: jiraDuration,
      togglDuration: togglDuration,
    };
  });

  reports.sort((a, b) => b.date.localeCompare(a.date));

  return reports;
}

export type JoinedReports = Awaited<ReturnType<typeof getJoinedReports>>;
