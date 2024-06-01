import { FreshContext } from "$fresh/server.ts";
import { getCookies } from "$std/http/cookie.ts";

export interface UserData {
  jira: {
    host: string;
    username: string;
    token: string;
  };
  toggl: {
    project: string;
    token: string;
  };
}

export interface State {
  userData: UserData | undefined;
}

export async function handler(
  req: Request,
  ctx: FreshContext<State>,
) {
  const cookies = getCookies(req.headers);
  const { jiraHost, jiraUser, jiraToken, togglToken, togglProject } = cookies;
  if (jiraHost && jiraUser && jiraToken && togglToken && togglProject) {
    ctx.state.userData = {
      jira: {
        host: jiraHost,
        username: jiraUser,
        token: jiraToken,
      },
      toggl: {
        project: togglProject,
        token: togglToken,
      },
    };
  } else {
    ctx.state.userData = undefined;
  }
  return await ctx.next();
}
