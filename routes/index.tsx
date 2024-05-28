import { Handlers, PageProps } from "$fresh/server.ts";
import { jiraCreds, jiraUsername, togglCreds, togglProject } from "../creds.ts";
import { JiraOptions, JiraReports, fetchReports } from "../utils/jira.ts";
import { TimeEntries, fetchTimeEntries } from "../utils/toggl.ts";


async function myJiraReports(fromDate: string, tillDate: string) {
  const reports = await fetchReports(fromDate, tillDate, jiraCreds)
  return reports.filter(report => report.name == jiraUsername);
}

async function projectToggleEntries(fromDate: string, tillDate: string) {
  const entries = await fetchTimeEntries(togglCreds.username, togglCreds.token, fromDate, tillDate);
  return entries.filter(entry => entry.project_name === togglProject);
}

function dateTimeToDate(dateTime: string) {
  return dateTime.slice(0, 10);
}

function align<T>({jira, toggl}: {jira: Map<string, T>; toggl:  Map<string, T>}): {jira?: T, toggl?: T}[] {
  const aligned = new Array<{jira?: T, toggl?: T}>();

  for (const [k, jiraEntry] of jira.entries()) {
    const togglEntry = toggl.get(k);
    if (togglEntry) {
      toggl.delete(k);
    }
    aligned.push({
      jira: jiraEntry,
      toggl: togglEntry
    })
  }

  for (const [k, togglEntry] of toggl.entries()) {
    const jiraEntry = jira.get(k);
    if (jiraEntry) {
      jira.delete(k);
    }
    aligned.push({
      jira: jiraEntry,
      toggl: togglEntry
    })
  }

  return aligned
}

interface ReportEntry {
  description: string; 
  duration: number;
}

function groupByText(reports: ReportEntry[]) {
  const uniqueReports = new Map<string, ReportEntry>;

  reports.forEach(report => {
    const prev = uniqueReports.get(report.description);
    if (prev) {
      prev.duration += report.duration;
    } else {
      uniqueReports.set(report.description, report);
    }
  });

  return uniqueReports;
}

function joinReports(jiraEntries: JiraReports, togglEntries: TimeEntries) {
  const days = new Map<string, {jira: ReportEntry[]; toggl: ReportEntry[]}>();
  togglEntries.forEach(togglEntry => {
    const date = dateTimeToDate(togglEntry.start);
    const value = days.get(date);
    const entry = {description: togglEntry.description, duration: togglEntry.duration};
    if (value) {
      value.toggl.push(entry);
    } else {
      days.set(date, {
        jira: [],
        toggl: [entry],
      })
    }
  });
  jiraEntries.forEach(jiraEntry => {
    const date = jiraEntry.started;
    const value = days.get(date);
    const entry = {description: jiraEntry.comment, duration: jiraEntry.timeSeconds};
    if (value) {
      value.jira.push(entry);
    } else {
      days.set(date, {
        jira: [entry],
        toggl: [],
      })
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

type Reports = ReturnType<typeof joinReports>

function alignReports(reports: Reports) {
  return reports.map(report => ({
    date: report.date,
    reports: align({jira: report.jira, toggl: report.toggl})
  }));
}

async function getJoinedReports(startDate: string, endDate: string) {
  const [togglEntries, jiraEntries] = await Promise.all([
    projectToggleEntries(startDate, endDate),
    myJiraReports(startDate, endDate),
  ])

  const reports = joinReports(jiraEntries, togglEntries);
  return alignReports(reports);
}

type JoinedReports = Awaited<ReturnType<typeof getJoinedReports>>

export const handler: Handlers<JoinedReports> = {
  async GET(_req, ctx) {
    const joined = await getJoinedReports("2024-03-01", "2024-05-01");
    return ctx.render(joined);
  }
};

export default function TogglPage(props: PageProps<JoinedReports>) {
  console.log(props.data)
  return props.data.map(day => <div>
    <div>{day.date}</div>
      <table style={{width: "1024px"}}>
        <thead>
          <tr>
            <th>Toggl</th>
            <th>Jira</th>
          </tr>
        </thead>
        <tbody>
          {day.reports.map(report => (
            <tr>
              <td style={{width: "50%"}}>{report.toggl?.description}</td>
              <td style={{width: "50%"}}>{report.jira?.description}</td>
            </tr>))}
        </tbody>
      </table>
  </div>
  )
}