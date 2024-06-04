import { Handlers } from "$fresh/server.ts";
import { submitWorklog } from "../../utils/jira.ts";
import { ReportEntry } from "../../utils/models.ts";
import { State } from "../_middleware.ts";

export const handler: Handlers<ReportEntry, State> = {
  async POST(req, ctx) {
    const userData = ctx.state.userData;
    if (!userData) {
      return new Response(null, {
        status: 401, // Unauthorized
      });
    }
    const report = ReportEntry.parse(await req.json());

    const res = await submitWorklog({
      issueIdOrKey: report.taskID,
      started: report.date,
      text: report.description,
      timeSpentSeconds: report.duration,
    }, userData.jira);
    return new Response(JSON.stringify(res));
  },
};
