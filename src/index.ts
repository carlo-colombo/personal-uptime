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
  alarmed?: string
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
        INSERT INTO hosts(name, pinged, alarmed)
        VALUES (?, datetime('now'), '')
        ON CONFLICT(Name) DO UPDATE SET 
          pinged=datetime('now'),
          alarmed=''
          WHERE name = ?
      `)
        .bind(origin, origin)
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
          <table>
            ${(hosts as Host[]).map(p => `
              <tr>
                <td>${p.alarmed ? '🛎 ' + p.alarmed : ' '}</td>
                <td>${p.name}</td>
                <td>${p.pinged}</td>
              </tr>`).join('')}
          </table>
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
        select name, pinged
        from hosts
        where
          pinged < datetime('now', ?) 
          and
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
