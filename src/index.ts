// This is the Worker's main file. Cloudflare runs this code when someone visits
// the Worker's address, and when the daily cron trigger fires.

import { collectNotices } from "./collect.ts";

// The settings the Worker can read. DAYS_BACK comes from wrangler.jsonc.
export interface Env {
  DAYS_BACK?: string;
}

export default {
  // Runs when someone opens the Worker's web address in a browser.
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /notices fetches the notices and shows them as JSON.
    // For local testing only. Lock it behind Cloudflare Access (PLAN.md step 10) before deploying.
    if (url.pathname === "/notices") {
      const result = await collectNotices(env, new Date());
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // Anywhere else, reply with "hello".
    return new Response("hello", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },

  // Runs on the daily schedule set in wrangler.jsonc.
  // For now it fetches and logs the counts. Saving to the database comes in step 4.
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const result = await collectNotices(env, new Date(event.scheduledTime));
    console.log(`Daily run kept ${result.counts.kept} notices`);
  },
} satisfies ExportedHandler<Env>;
