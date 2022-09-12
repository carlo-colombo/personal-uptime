/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { DateTime, DurationLike } from 'luxon'

export interface Env {
  CHAT_ID: string,
  INTERVAL: DurationLike,
  MESSAGE_TIMEOUT: DurationLike,
  PINGS: KVNamespace,
  TELEGRAM_TOKEN: string,
}

interface Metadata {
  timestamp: number,
  alarm?: number
}

const isOutdated = (env: Env) => ({ timestamp }: Metadata, now: DateTime) => {
  return DateTime.fromMillis(timestamp) < now.minus(env.INTERVAL)
}

const shouldTrigger = (env: Env) => ({ alarm }: Metadata, now: DateTime) => {
  if (!alarm) return true
  return DateTime.fromMillis(alarm) < now.minus(env.MESSAGE_TIMEOUT)
}

async function sendMessage(env: Env, text: string): Promise<void> {
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

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const { pathname } = new URL(request.url);
    const { PINGS } = env

    if (pathname.startsWith("/ping")) {
      const origin = request.headers.get("Origin")

      if (!origin) {
        return new Response("Missing origin header")
      }

      const t = new Date()
      const prev = await PINGS.getWithMetadata<Metadata>(origin)
      if (prev != null && prev.metadata?.alarm) {
        await sendMessage(env, `${origin} recovered`)
      }
      await PINGS.put(origin, "", {
        metadata: { timestamp: t.getTime(), date: t.toString() }
      })
      return new Response("ok");
    }

    if (pathname.startsWith("/list")) {
      const accept = request.headers.get('Accept')
      const pings = PINGS.list()

      if (accept?.includes("text/html")) {
        return new Response(`
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link
            rel="stylesheet"
            href="https://unpkg.com/sakura.css/css/sakura.css"
            type="text/css">
          <script>
            setInterval(()=>window.location.reload(), 5000)
          </script>
          <table>
            ${(await pings).keys.map(p => `
              <tr>
                <td>${p.metadata.alarm ? '🛎': ' '}</td>
                <td>${p.name}</td>
                <td>${p.metadata.date}</td>
              </tr>`).join('')}
          </table>
          `, {
          headers: {
            'content-type': 'text/html;charset=UTF-8',
          },
        })
      }


      return Response.json(await pings)
    }

    return new Response("notok", { status: 404 })
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const { keys: pings } = await env.PINGS.list<Metadata>()
    const now = DateTime.fromMillis(event.scheduledTime)

    const outdated = pings
      .filter(p => isOutdated(env)(p.metadata!, now))
      .filter(p => shouldTrigger(env)(p.metadata!, now))
      .map(async p => {
        console.log('trigger for', p.name)

        await sendMessage(env, `${p.name} is down`)

        return env.PINGS.put(p.name, "", {
          metadata: {
            ...p.metadata,
            alarm: event.scheduledTime
          }
        })
      })

    ctx.waitUntil(Promise.all(outdated))
  },
};
