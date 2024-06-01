import { Handlers, PageProps } from "$fresh/server.ts";
import { secondsToHms } from "../utils/duration.ts";
import {
  fetchMyself,
  fetchReports,
  JiraOptions,
  JiraReports,
} from "../utils/jira.ts";
import { fetchTimeEntries, TimeEntries, TogglOptions } from "../utils/toggl.ts";
import { State } from "./_middleware.ts";

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

interface ReportEntry {
  description: string;
  duration: number;
  taskID: string | undefined;
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
      taskID: id,
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

async function getJoinedReports(
  startDate: string,
  endDate: string,
  jiraOptions: JiraOptions,
  togglOptions: TogglOptions,
) {
  const [togglEntries, jiraEntries] = await Promise.all([
    projectToggleEntries(startDate, endDate, togglOptions),
    myJiraReports(startDate, endDate, jiraOptions),
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

interface Props {
  reports: JoinedReports;
  startDate: string;
  endDate: string;
}

function getDateString(monthOffset: number = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthOffset);
  return date.toISOString().slice(0, 10);
}

export const handler: Handlers<Props, State> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const startDate = url.searchParams.get("start") || getDateString(-1);
    const endDate = url.searchParams.get("end") || getDateString();

    const userData = ctx.state.userData;
    if (!userData) {
      return ctx.renderNotFound();
    }
    const reports = await getJoinedReports(
      startDate,
      endDate,
      userData.jira,
      userData.toggl,
    );
    return ctx.render({
      endDate: endDate,
      startDate: startDate,
      reports: reports,
    });
  },
};

function renderTime(duration: number | undefined) {
  if (duration) {
    return secondsToHms(duration);
  }
  return "";
}

export default function TogglPage(props: PageProps<Props>) {
  // TODO: if no cookies - redirect to /
  const table = props.data.reports.map((day) => (
    <div>
      <h3>{day.date}</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Toggl</th>
            <th>{renderTime(day.togglDuration)}</th>
            <th>{renderTime(day.jiraDuration)}</th>
            <th>Jira</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {day.reports.map((report) => (
            <tr>
              <td style={{ width: "10%" }}>
                {report.toggl?.taskID
                  ? (
                    <a target="_blank" href="#">
                      {report.toggl?.taskID}
                    </a>
                  )
                  : ""}
              </td>
              <td style={{ width: "30%" }}>
                {report.toggl?.description}
              </td>
              <td style={{ width: "10%" }}>
                {renderTime(report.toggl?.duration ?? 0)}
              </td>
              <td style={{ width: "10%" }}>
                {renderTime(report.jira?.duration ?? 0)}
              </td>
              <td style={{ width: "30%" }}>
                {report.jira?.description ?? <button>Create</button>}
              </td>
              <td style={{ width: "10%" }}>
                {report.jira?.taskID
                  ? (
                    <a target="_blank" href="#">
                      {report.jira?.taskID}
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

  return (
    <div>
      <h1>Reports {props.data.startDate} ... {props.data.endDate}</h1>
      {table}
    </div>
  );
}
