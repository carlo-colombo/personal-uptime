/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  CHAT_ID: string,
  TELEGRAM_TOKEN: string,
  DB: D1Database,
  INTERVAL: string,
  ALARM_TIMEOUT: string
}

interface Metadata {
  timestamp: number,
  alarm?: number
}

async function sendMessage(env: Env, text: string): Promise<void> {
  console.log('sendMessage', text)
  const baseURL = new URL(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`)
  const u = Object.assign(baseURL, {
    search: new URLSearchParams({
      text,
      chat_id: env.CHAT_ID
    })
  })

  await fetch(u.toString())

  return
}

interface Host {
  name: string,
  pinged: string,
  alarmed?: string,
  interval?: string
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith("/ping")) {
      const origin = request.headers.get("Origin")
      const interval = request.headers.get("x-interval")

      if (!origin) {
        return new Response("Missing origin header")
      }

      const alarmed = await env.DB.prepare(`
        SELECT alarmed
        FROM hosts
        WHERE name = ?
      `)
        .bind(origin)
        .first('alarmed')

      await env.DB.prepare(`
        INSERT INTO hosts(name, pinged, alarmed, interval)
        VALUES (?, datetime('now'), '', ?)
        ON CONFLICT(name) DO UPDATE SET
          pinged=datetime('now'),
          alarmed='',
          interval=?
      `)
        .bind(origin, interval, interval)
        .run()


      if (alarmed) {
        await sendMessage(env, `${origin} recovered from alarm (${alarmed})`)
      }

      return new Response("ok");
    }

    if (pathname.startsWith("/list")) {
      const accept = request.headers.get('Accept')
      const { results: hosts } = await env.DB.prepare(`
        SELECT name, pinged, alarmed
        FROM Hosts
      `).all()

      if (accept?.includes("text/html")) {
        return new Response(`
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link
            rel="stylesheet"
            href="https://unpkg.com/sakura.css/css/sakura.css"
            type="text/css">

          <table id="table"
                 data-now=${Date()}
                 hx-get="/list"
                 hx-trigger="every 5s"
                 hx-headers='{"Accept": "text/html"}'
                 hx-swap="outerHTML"
                 hx-select="#table">
            ${(hosts as Host[]).map(p => `
              <tr>
                <td>${p.alarmed ? '🛎 ' + p.alarmed : ' '}</td>
                <td>${p.name}</td>
                <td>${p.pinged}</td>
              </tr>`).join('')}
          </table>

          <script src="https://unpkg.com/htmx.org@1.9.4"
            integrity="sha384-zUfuhFKKZCbHTY6aRR46gxiqszMk5tcHjsVFxnUo8VMus4kHGVdIYVbOYYNlKmHV"
            crossorigin="anonymous"></script>

          `, {
          headers: {
            'content-type': 'text/html;charset=UTF-8',
          },
        })
      }

      return Response.json(hosts)
    }

    return new Response("notok", { status: 404 })
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const { results } = await env.DB.prepare(`
        SELECT name, pinged
        FROM hosts
        WHERE
            (
                (interval IS NOT NULL AND interval != '' AND pinged < datetime('now', interval)) OR
                ((interval IS NULL OR interval = '') AND pinged < datetime('now', ?))
            )
            AND
            alarmed < datetime('now', ?)
      `)
      .bind(env.INTERVAL, env.ALARM_TIMEOUT)
      .all() as { results: Host[] }

    if (results) {
      const downs = results?.map(async ({ name, pinged }) => {
        await sendMessage(env, `${name} is down, last seen: ${pinged}`)

        return env.DB.prepare(`
          UPDATE hosts
          SET alarmed = datetime('now')
          WHERE name = ?
        `)
          .bind(name)
          .run()
      })

      ctx.waitUntil(Promise.all(downs))
    }
  },
};
