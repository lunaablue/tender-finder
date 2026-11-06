// This is the Worker's main file. Cloudflare runs this code when someone visits
// the Worker's address, and when the daily cron trigger fires.

export default {
  // Runs when someone opens the Worker's web address in a browser.
  async fetch(request: Request): Promise<Response> {
    // For now, just reply with the word "hello".
    return new Response("hello", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },

  // Runs on the daily schedule set in wrangler.jsonc.
  // Placeholder: the real fetch-filter-score job is added in later build steps.
  async scheduled(event: ScheduledController): Promise<void> {
    console.log(`Daily run triggered at ${new Date(event.scheduledTime).toISOString()} (placeholder, no work yet)`);
  },
} satisfies ExportedHandler;
