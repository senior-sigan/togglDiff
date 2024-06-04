import { date } from "zod";
import { ReportEntry, ReportPreview } from "../utils/models.ts";

import { useSignal } from "@preact/signals";

interface Props {
  data: {
    jira?: ReportPreview;
    toggl?: ReportPreview;
  };
}

async function submitJiraEntry(entry: ReportEntry) {
  const res = await fetch("/api/jira", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  return res.json();
}

function ensureHasId(report: ReportPreview | undefined): ReportEntry {
  if (report?.taskID) {
    return report as ReportEntry;
  }
  throw new Error(`Must have taskID: ${report}`);
}

export default function JiraSlot(props: Props) {
  const jiraData = useSignal(props.data.jira);
  const status = useSignal<"" | "loading" | "error" | "done">("");

  const handleSubmit = async (report: ReportEntry) => {
    if (report && status.value === "") {
      status.value = "loading";
      try {
        const res = await submitJiraEntry(report);
        jiraData.value = report;
        status.value = "done";
      } catch (err) {
        status.value = "error";
        console.error(err);
      }
    }
  };

  if (jiraData.value) {
    return <>{jiraData.value.description}</>;
  }
  if (props.data.toggl?.taskID && status.value === "") {
    return (
      <button onClick={() => handleSubmit(ensureHasId(props.data.toggl))}>
        Save
      </button>
    );
  }

  return <>{status.value}</>;
}
