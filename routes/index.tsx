import { Handlers } from "$fresh/server.ts";
import { getCookies, setCookie } from "$std/http/cookie.ts";
import { error } from "$fresh/src/dev/error.ts";
import { useCSP } from "$fresh/runtime.ts";

function cookieAdder(headers: Headers, domain: string) {
  return (name: string, value: string) => {
    setCookie(headers, {
      name,
      value,
      domain,
      maxAge: 2592000,
      sameSite: "Lax", // prevents CSRF attacks
      path: "/",
      secure: true,
    });
  };
}

function extractCokies(headers: Headers) {
  const cookies = getCookies(headers);
  const { jiraHost, jiraToken, togglToken } = cookies;
  return { jiraHost, jiraToken, togglToken };
}

function normalizeBaseURL(base: string) {
  if (base.startsWith("https://") || base.startsWith("http://")) {
    return base;
  }
  return `https://${base}`;
}

export const handler: Handlers = {
  async GET(req, ctx) {
    const userData = extractCokies(req.headers);
    if (userData.jiraHost && userData.jiraToken && userData.togglToken) {
      const headers = new Headers();
      headers.set("location", "/app");
      return new Response(null, {
        status: 303, // See Other
        headers,
      });
    }
    return await ctx.render();
  },
  async POST(req, ctx) {
    const form = await req.formData();
    const jiraHost = form.get("jiraHost")?.toString() ?? "";
    const jiraToken = form.get("jiraToken")?.toString() ?? "";
    const togglToken = form.get("togglToken")?.toString() ?? "";
    console.log({ jiraHost, jiraToken, togglToken });

    const errors = [];
    if (!jiraHost) {
      errors.push({ field: "jiraHost", message: "should not be empty" });
    }
    if (!jiraToken) {
      errors.push({ field: "jiraToken", message: "should not be empty" });
    }
    if (!togglToken) {
      errors.push({ field: "togglToken", message: "should not be empty" });
    }
    if (errors.length > 0) {
      console.log(errors);
      return await ctx.render(errors, {
        status: 400,
      });
    }

    const headers = new Headers();
    const url = new URL(req.url);
    const addCookie = cookieAdder(headers, url.hostname);
    addCookie("jiraHost", normalizeBaseURL(jiraHost));
    addCookie("jiraToken", jiraToken);
    addCookie("togglToken", togglToken);

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
