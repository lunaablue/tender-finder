// This is the Worker's main file. Cloudflare runs this code when someone visits
// the Worker's address, and when the daily cron trigger fires.

import { runOnce } from "./run.ts";

// The settings and bindings the Worker can use.
// DAYS_BACK comes from wrangler.jsonc. DB is the D1 database.
export interface Env {
  DAYS_BACK?: string;
  DB: D1Database;
}

export default {
  // Runs when someone opens the Worker's web address in a browser.
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /run fetches the notices, saves the new ones, and logs the run.
    // For local testing only. Lock it behind Cloudflare Access (PLAN.md step 10) before deploying.
    if (url.pathname === "/run") {
      const summary = await runOnce(env, new Date());
      return new Response(JSON.stringify(summary, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // Anywhere else, reply with "hello".
    return new Response("hello", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },

  // Runs on the daily schedule set in wrangler.jsonc.
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const summary = await runOnce(env, new Date(event.scheduledTime));
    console.log(`Daily run: ${summary.new} new, ${summary.kept} kept`);
  },
} satisfies ExportedHandler<Env>;
