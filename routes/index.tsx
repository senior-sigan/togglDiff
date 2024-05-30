import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    // TODO: check cookies and data and redirect to /app
    return await ctx.render();
  },
  async POST(req, ctx) {
    const form = await req.formData();
    const jiraHost = form.get("jiraHost")?.toString();
    const jiraToken = form.get("jiraToken")?.toString();
    const togglToken = form.get("togglToken")?.toString();
    console.log({ jiraHost, jiraToken, togglToken });
    // TODO: validate data

    // Redirect user to thank you page.
    const headers = new Headers();
    headers.set("location", "/app");
    return new Response(null, {
      status: 303, // See Other
      headers,
    });
  },
};

export default function RegisterPage() {
  return (
    <div>
      <h1>Registration</h1>
      <p>We don't persist data in a DB but put it in cookies.</p>
      <form method="POST">
        <label for="jiraHost">Jira Host</label>
        <input
          id="jiraHost"
          name="jiraHost"
          type="text"
          placeholder="myproject.atlassian.net"
        >
        </input>

        <label for="jiraToken">Jira Token</label>
        <input id="jiraToken" name="jiraToken" type="text"></input>

        <label for="togglToken">Toggl Token</label>
        <input id="togglToken" name="togglToken" type="text"></input>

        <button type="submit">Let me in!!!</button>
      </form>
    </div>
  );
}
