var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/http.ts
var PAUSE_MS = 10500;
var RETRY_WAITS_MS = [3e4, 6e4, 12e4];
var MAX_PAGES = 50;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");
async function getJsonWithRetry(url) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (error) {
      if (attempt >= RETRY_WAITS_MS.length) throw error;
      console.log(`Network error, retrying in ${RETRY_WAITS_MS[attempt] / 1e3}s: ${error}`);
      await sleep(RETRY_WAITS_MS[attempt]);
      continue;
    }
    if (response.ok) {
      return response.json();
    }
    const refused = response.status === 429 || response.status >= 500;
    if (refused && attempt < RETRY_WAITS_MS.length) {
      console.log(`HTTP ${response.status} from ${url}, retrying in ${RETRY_WAITS_MS[attempt] / 1e3}s`);
      await sleep(RETRY_WAITS_MS[attempt]);
      continue;
    }
    const body = (await response.text()).slice(0, 300);
    throw new Error(`HTTP ${response.status} from ${url}: ${body}`);
  }
}
__name(getJsonWithRetry, "getJsonWithRetry");
async function fetchAllReleases(firstUrl, label) {
  const all = [];
  let url = firstUrl;
  for (let page = 1; url && page <= MAX_PAGES; page++) {
    console.log(`[${label}] downloading page ${page}`);
    const data = await getJsonWithRetry(url);
    const releases = data.releases ?? [];
    all.push(...releases);
    url = releases.length > 0 ? data.links?.next ?? null : null;
    if (url) await sleep(PAUSE_MS);
  }
  console.log(`[${label}] downloaded ${all.length} releases`);
  return all;
}
__name(fetchAllReleases, "fetchAllReleases");

// src/window.ts
function daysBackFrom(env) {
  const raw = env.DAYS_BACK ?? "2";
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`DAYS_BACK must be a whole number of 0 or more, but it is "${raw}"`);
  }
  return days;
}
__name(daysBackFrom, "daysBackFrom");
function ymd(date) {
  return date.toISOString().slice(0, 10);
}
__name(ymd, "ymd");
function isoNoZone(date) {
  return date.toISOString().slice(0, 19);
}
__name(isoNoZone, "isoNoZone");
function windowFor(now, daysBack) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const start = new Date(Date.UTC(y, m, d - daysBack));
  const tomorrow = new Date(Date.UTC(y, m, d + 1));
  return {
    fromIso: isoNoZone(start),
    toIso: isoNoZone(now),
    fromDate: ymd(start),
    toDate: ymd(tomorrow)
  };
}
__name(windowFor, "windowFor");

// src/sources.ts
function findTenderUrl(fromIso, toIso) {
  const params = new URLSearchParams({ updatedFrom: fromIso, updatedTo: toIso, limit: "100" });
  return `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?${params}`;
}
__name(findTenderUrl, "findTenderUrl");
function contractsFinderUrl(fromDate, toDate) {
  const params = new URLSearchParams({ publishedFrom: fromDate, publishedTo: toDate, limit: "100" });
  return `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?${params}`;
}
__name(contractsFinderUrl, "contractsFinderUrl");
function fetchFindTender(fromIso, toIso) {
  return fetchAllReleases(findTenderUrl(fromIso, toIso), "find-tender");
}
__name(fetchFindTender, "fetchFindTender");
function fetchContractsFinder(fromDate, toDate) {
  return fetchAllReleases(contractsFinderUrl(fromDate, toDate), "contracts-finder");
}
__name(fetchContractsFinder, "fetchContractsFinder");

// src/normalise.ts
var AWARD_TAGS = ["award", "contract", "awardUpdate", "contractUpdate"];
function stageOf(tags = []) {
  if (tags.some((t) => AWARD_TAGS.includes(t))) return "award";
  if (tags.some((t) => t === "tender" || t === "tenderUpdate")) return "tender";
  if (tags.some((t) => t === "planning" || t === "planningUpdate")) return "pipeline";
  return tags.join(",") || "unknown";
}
__name(stageOf, "stageOf");
function cpvCodesOf(tender) {
  const found = /* @__PURE__ */ new Set();
  const add = /* @__PURE__ */ __name((c) => {
    if (c?.id && (!c.scheme || c.scheme === "CPV")) found.add(c.id);
  }, "add");
  add(tender.classification);
  for (const item of tender.items ?? []) {
    add(item.classification);
    for (const extra of item.additionalClassifications ?? []) add(extra);
  }
  return [...found];
}
__name(cpvCodesOf, "cpvCodesOf");
function normaliseRelease(release, source) {
  const tender = release.tender ?? {};
  const buyerParty = release.parties?.find((p) => p.roles?.includes("buyer"));
  const deliveryRegion = (tender.items ?? []).flatMap((item) => item.deliveryAddresses ?? []).find((address) => address.region)?.region;
  const documentUrl = tender.documents?.find((d) => d.url)?.url;
  const fallbackUrl = source === "find-tender" ? `https://www.find-tender.service.gov.uk/Notice/${release.id}` : null;
  const publishedDate = tender.documents?.find((d) => d.datePublished)?.datePublished ?? release.date ?? null;
  return {
    id: release.id,
    source,
    ocid: release.ocid ?? null,
    title: tender.title ?? "(no title)",
    description: tender.description ?? null,
    buyer: release.buyer?.name ?? buyerParty?.name ?? null,
    value: tender.value?.amount ?? null,
    currency: tender.value?.currency ?? null,
    deadline: tender.tenderPeriod?.endDate ?? null,
    stage: stageOf(release.tag),
    cpvCodes: cpvCodesOf(tender),
    procurementCategory: tender.mainProcurementCategory ?? null,
    region: buyerParty?.address?.region ?? deliveryRegion ?? null,
    url: documentUrl ?? fallbackUrl,
    publishedDate
  };
}
__name(normaliseRelease, "normaliseRelease");
function dropAwards(notices) {
  return notices.filter((n) => n.stage !== "award");
}
__name(dropAwards, "dropAwards");
function comparable(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
__name(comparable, "comparable");
function removeDuplicates(notices) {
  const newestFirst = [...notices].sort((a, b) => (b.publishedDate ?? "").localeCompare(a.publishedDate ?? ""));
  const seenIds = /* @__PURE__ */ new Set();
  const seenTitleBuyer = /* @__PURE__ */ new Set();
  const kept = [];
  for (const notice of newestFirst) {
    if (seenIds.has(notice.id)) continue;
    const titleBuyerKey = notice.buyer ? `${comparable(notice.title)}|${comparable(notice.buyer)}` : null;
    if (titleBuyerKey && seenTitleBuyer.has(titleBuyerKey)) continue;
    seenIds.add(notice.id);
    if (titleBuyerKey) seenTitleBuyer.add(titleBuyerKey);
    kept.push(notice);
  }
  return kept;
}
__name(removeDuplicates, "removeDuplicates");

// src/collect.ts
async function collectNotices(env, now) {
  const daysBack = daysBackFrom(env);
  const w = windowFor(now, daysBack);
  console.log(`Fetching notices from ${w.fromIso} to ${w.toIso} (DAYS_BACK=${daysBack})`);
  const findTender = await fetchFindTender(w.fromIso, w.toIso);
  await sleep(PAUSE_MS);
  const contractsFinder = await fetchContractsFinder(w.fromDate, w.toDate);
  const normalised = [
    ...findTender.map((r) => normaliseRelease(r, "find-tender")),
    ...contractsFinder.map((r) => normaliseRelease(r, "contracts-finder"))
  ];
  const withoutAwards = dropAwards(normalised);
  const kept = removeDuplicates(withoutAwards);
  const counts = {
    findTenderReleases: findTender.length,
    contractsFinderReleases: contractsFinder.length,
    normalised: normalised.length,
    awardsDropped: normalised.length - withoutAwards.length,
    duplicatesRemoved: withoutAwards.length - kept.length,
    kept: kept.length
  };
  console.log("Counts:", JSON.stringify(counts));
  return {
    daysBack,
    window: { from: w.fromIso, to: w.toIso },
    counts,
    notices: kept
  };
}
__name(collectNotices, "collectNotices");

// src/index.ts
var src_default = {
  // Runs when someone opens the Worker's web address in a browser.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/notices") {
      const result = await collectNotices(env, /* @__PURE__ */ new Date());
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
    return new Response("hello", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  },
  // Runs on the daily schedule set in wrangler.jsonc.
  // For now it fetches and logs the counts. Saving to the database comes in step 4.
  async scheduled(event, env) {
    const result = await collectNotices(env, new Date(event.scheduledTime));
    console.log(`Daily run kept ${result.counts.kept} notices`);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-vZwKDL/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-vZwKDL/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
