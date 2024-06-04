import { Handlers, PageProps } from "$fresh/server.ts";
import JiraSlot from "../islands/jiraslot.tsx";
import { secondsToHms } from "../utils/duration.ts";
import { getJoinedReports, JoinedReports } from "../utils/reports.ts";

import { State } from "./_middleware.ts";

interface Props {
  reports: JoinedReports;
  startDate: string;
  endDate: string;
  jiraHost: string;
}

function getDateString(dayOffset: number = 0, monthOffset: number = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthOffset);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

export const handler: Handlers<Props, State> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const startDate = url.searchParams.get("start") || getDateString(0, -1);
    const endDate = url.searchParams.get("end") || getDateString(1);

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
      jiraHost: userData.jira.host,
    });
  },
};

function renderTime(duration: number | undefined) {
  if (duration) {
    return secondsToHms(duration);
  }
  return "";
}

function buildJiraIssueURL(jiraHost: string, issueKey: string) {
  return `${jiraHost}/browse/${issueKey}`;
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
                    <a
                      target="_blank"
                      href={buildJiraIssueURL(
                        props.data.jiraHost,
                        report.toggl.taskID,
                      )}
                    >
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
                <JiraSlot data={report} />
              </td>
              <td style={{ width: "10%" }}>
                {report.jira?.taskID
                  ? (
                    <a
                      target="_blank"
                      href={buildJiraIssueURL(
                        props.data.jiraHost,
                        report.jira.taskID,
                      )}
                    >
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
