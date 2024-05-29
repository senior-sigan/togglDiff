import { type PageProps } from "$fresh/server.ts";
export default function App({ Component }: PageProps) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>Toggl DIFF</title>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
        />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <header>
          <div class="container">
            <a aria-label="Toggl DIFF homepage" href="/">Toggl DIFF</a>
          </div>
        </header>
        <main class="container">
          <Component />
        </main>
      </body>
    </html>
  );
}
