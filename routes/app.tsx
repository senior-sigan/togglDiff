import { Handlers, PageProps } from "$fresh/server.ts";
import { jiraCreds, jiraUsername, togglCreds, togglProject } from "../creds.ts";
import { secondsToHms } from "../utils/duration.ts";
import { fetchReports, JiraOptions, JiraReports } from "../utils/jira.ts";
import { fetchTimeEntries, TimeEntries } from "../utils/toggl.ts";

async function myJiraReports(fromDate: string, tillDate: string) {
  const reports = await fetchReports(fromDate, tillDate, jiraCreds);
  return reports.filter((report) => report.name == jiraUsername);
}

async function projectToggleEntries(fromDate: string, tillDate: string) {
  const entries = await fetchTimeEntries(
    togglCreds.username,
    togglCreds.token,
    fromDate,
    tillDate,
  );
  return entries.filter((entry) => entry.project_name === togglProject);
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

interface ReportEntry {
  description: string;
  duration: number;
  jiraLink?: {
    name: string;
    link: string;
  };
}

function groupByText(reports: ReportEntry[]) {
  const uniqueReports = new Map<string, ReportEntry>();

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

function buildJiraLink(host: string, jiraId: string | undefined) {
  if (!jiraId) {
    return undefined;
  }
  return { link: `https://${host}/browse/${jiraId}`, name: jiraId };
}

function joinReports(jiraEntries: JiraReports, togglEntries: TimeEntries) {
  const days = new Map<string, { jira: ReportEntry[]; toggl: ReportEntry[] }>();
  togglEntries.forEach((togglEntry) => {
    const date = dateTimeToDate(togglEntry.start);
    const value = days.get(date);
    const { id, description } = parseDescription(togglEntry.description);
    const entry = {
      duration: togglEntry.duration,
      description,
      jiraLink: buildJiraLink(jiraCreds.host, id),
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
      jiraLink: buildJiraLink(jiraCreds.host, jiraEntry.issueKey),
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

  const reports = Array.from(days.entries(), ([date, value]) => ({
    date,
    jira: groupByText(value.jira),
    toggl: groupByText(value.toggl),
  }));
  reports.sort((a, b) => a.date.localeCompare(b.date));
  return reports;
}

type Reports = ReturnType<typeof joinReports>;

function alignReports(reports: Reports) {
  return reports.map((report) => ({
    date: report.date,
    reports: align({ jira: report.jira, toggl: report.toggl }),
  }));
}

async function getJoinedReports(startDate: string, endDate: string) {
  const [togglEntries, jiraEntries] = await Promise.all([
    projectToggleEntries(startDate, endDate),
    myJiraReports(startDate, endDate),
  ]);

  const reports = joinReports(jiraEntries, togglEntries);
  return alignReports(reports).map((entry) => {
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
}

type JoinedReports = Awaited<ReturnType<typeof getJoinedReports>>;

export const handler: Handlers<JoinedReports> = {
  async GET(_req, ctx) {
    const joined = await getJoinedReports("2024-04-01", "2024-04-15");
    return ctx.render(joined);
  },
};

function renderTime(duration: number | undefined) {
  if (duration) {
    return secondsToHms(duration);
  }
  return "";
}

export default function TogglPage(props: PageProps<JoinedReports>) {
  // TODO: if no cookies - redirect to /
  return props.data.map((day) => (
    <div>
      <h3>{day.date}</h3>
      <table>
        <thead>
          <tr>
            <th style={{ width: "10%" }}>ID</th>
            <th style={{ width: "30%" }}>Toggl</th>
            <th style={{ width: "10%" }}>{renderTime(day.togglDuration)}</th>
            <th style={{ width: "10%" }}>{renderTime(day.jiraDuration)}</th>
            <th style={{ width: "30%" }}>Jira</th>
            <th style={{ width: "10%" }}>ID</th>
          </tr>
        </thead>
        <tbody>
          {day.reports.map((report) => (
            <tr>
              <td>
                {report.toggl?.jiraLink
                  ? (
                    <a target="_blank" href={report.toggl?.jiraLink?.link}>
                      {report.toggl?.jiraLink?.name}
                    </a>
                  )
                  : ""}
              </td>
              <td>{report.toggl?.description}</td>
              <td>{renderTime(report.toggl?.duration ?? 0)}</td>
              <td>{renderTime(report.jira?.duration ?? 0)}</td>
              <td>
                {report.jira?.description ?? <button>Create</button>}
              </td>
              <td>
                {report.jira?.jiraLink
                  ? (
                    <a target="_blank" href={report.jira?.jiraLink?.link}>
                      {report.jira?.jiraLink?.name}
                    </a>
                  )
                  : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ));
}
