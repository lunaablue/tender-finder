# UK Public Sector Tender Finder: Build Plan

Nov 6, 2026

## Purpose and scope

This is a personal learning project: a tool that checks UK government procurement notices every day, filters them against my criteria, and uses AI to score the ones worth a closer look. It has no commercial or business use.

In scope: Find a Tender and Contracts Finder; open tenders and early pipeline notices; UK-wide; services primarily.

Out of scope: contract awards, polling and market research work, and the devolved portals (Public Contracts Scotland, Sell2Wales, eSourcing NI) for now.

Output: a password-protected web page ranking new notices by fit score, plus an optional daily email digest.

Open source: the code sits in a public GitHub repo under an open-source licence (MIT); the live tool is private.

## Design decisions

Two choices shape the build: filter in code before any AI call, and start with a small date window.

### 1. Filter in code before the AI step

The AI step is the slow, costly part. Plain code rules cost nothing and run in milliseconds, so they remove obvious misses first and the AI only judges a shortlist.

- **Cost:** the AI is paid per notice read, so sending hundreds of irrelevant notices a day is wasted spend.
- **Quality:** the AI is better at nuanced fit judgement than bulk sorting.
- **Predictability:** if a tender is missing, I can see which rule dropped it.
- **Safety margin:** a bug or a busy day cannot create a surprise bill, because the AI only sees a small number of notices.
- **Trade-off:** a rule can wrongly drop a relevant tender. Mitigation: keep rules broad, and log how many notices each rule removes on every run.

### 2. Small, configurable date window on the first run

The first run fetches 1 to 2 days of notices, not months of history. The window is a setting that can be widened later.

- **Rate limits:** one third-party estimate puts Find a Tender at about 12 requests per 2 minutes (to be checked against the official docs). A large backfill takes a long time and risks being refused part-way.
- **Short-lived jobs:** a Worker is built for short runs, so a long backfill may be cut off and leave a half-complete dataset.
- **Debugging:** problems with field mapping or filters are easier to find on 50 notices than 5,000.
- **AI cost:** a big first batch is also the first big AI bill, before the prompt is proven.
- **Later backfill:** if wanted, a separate script processes one day at a time, pauses between requests, records which days are done, and can resume.

## Search criteria

The pre-filter keeps open tenders and pipeline notices on my topics, with no value floor, and ranks the £5m+ ones highest.

| Rule | Setting |
|---|---|
| Topics | Notice title or description matches at least one include keyword (list below). CPV codes to be added after exploring real data. |
| Exclusions | Drop notices that look like polling, survey or market research work (suggested exclusion terms below). |
| Value | Target is £5m and over. Notices under £5m are kept if they match a topic, and flagged as lower priority. Notices with no stated value are kept. |
| Buyers | All: central government, councils, NHS, police, any public body, and publicly funded academic and research councils. |
| Geography | All of the UK. |
| Notice stages | Open tenders and early notices (pipeline, preliminary market engagement, planned procurement). Contract awards are excluded. |
| Deadline | Drop open tenders closing in fewer than 3 days. Pipeline notices have no bid deadline, so they are kept. |
| Contract type | Services only. Goods and works notices are dropped by the pre-filter, using the notice's procurement category (field to be confirmed in step 2). |

### Include keywords

- **Digital and technology:** digital and data, digital transformation, digital adoption, technological adoption, AI adoption, artificial intelligence, quantum
- **Economy:** economic growth, industrial strategy, economic resilience, supply chain resilience, critical inputs
- **Health and science:** life sciences, health
- **Justice and policing:** justice, policing
- **Energy and climate:** energy security, energy resilience, net zero
- **Defence and security:** dual use (also dual-use), nuclear estate, critical national infrastructure
- **Consultancy:** consultancy

"Health" and "justice" are broad and will let many notices through. That is intended: the AI step does the fine judgement.

### Suggested exclusion terms

These are my starting suggestions, to be tuned once real notices are visible: opinion polling, public attitudes survey, market research, social research, survey fieldwork, focus groups, omnibus survey.

## Data sources

Two official services cover the scope, and both publish free machine-readable data with no API key.

| Source | Covers | Access |
|---|---|---|
| Find a Tender | UK-wide, above-threshold procurements, including all notices under the Procurement Act 2023 (in force since 24 February 2025), such as pipeline and planned-procurement notices | OCDS API, no key |
| Contracts Finder | Mostly England, lower-value opportunities (above £12,000 for central government, £30,000 for other bodies) | OCDS search endpoint, no key |

OCDS (Open Contracting Data Standard) is a fixed JSON layout, so every notice has the same labelled fields. Data is published under the Open Government Licence v3.0.

- **No keyword search.** Third-party wrappers report that the official APIs cannot search by keyword, so the tool fetches by date and stage and filters the results itself.
- **Paging.** Contracts Finder returns up to 100 notices per page; the search takes parameters such as `publishedFrom`, `publishedTo` and `stages`.
- **Rate limits.** One third-party source reports about 12 requests per 2 minutes on Find a Tender. This is unverified and must be checked in the official docs during step 2.
- **Volume.** One wrapper reports roughly 2,350 Find a Tender notices across all stages in a week (late September 2026), so a daily fetch is only a few requests.
- **Not covered yet:** the Scottish, Welsh and Northern Irish portals; large above-threshold notices from those nations still appear on Find a Tender.

Sources: Contracts Finder OCDS guide, UK Tenders Scraper (Apify), TenderFeed (Apify), UK Contracts Finder (Apify).

## Architecture and stack

A scheduled Cloudflare Worker does the work. The same Worker also serves the login-protected web page from its static assets, which shows the results.

The Worker (highlighted in the architecture diagram) runs daily: it fetches notices from both government APIs, filters them, sends the shortlist to the AI model, and saves scores to D1. The web page, served by the same Worker from static assets, reads from D1 with Cloudflare Access in front of it, and an optional email digest is built from the top scores.

| Component | Role |
|---|---|
| GitHub repo | Stores the code (public, MIT licence) and deploys it to Cloudflare |
| Cloudflare Worker and cron | Runs the daily job: fetch, pre-filter, call the AI, save results |
| Worker static assets | Serves the web page that lists notices by score, from the same Worker |
| D1 | Small SQL database holding notices, scores and reasons |
| Cloudflare Access | Login in front of the page, so the live tool is private |
| Worker secret | Holds the AI API key outside the repo |

## Build steps

The build takes eleven steps; each ends with a check I can see, and building moves to Claude Code from step 1.

| # | Step | What I do | Done when |
|---|---|---|---|
| 1 | Accounts and setup | Create a public GitHub repo (MIT licence, `.gitignore` covering secrets), a free Cloudflare account, and an AI API key with a spend limit. Install Git, Node and Wrangler (Cloudflare's command-line tool). | I can push code to GitHub and deploy a "hello world" Worker. |
| 2 | Explore the data | Call both APIs by hand for one day. Read the JSON, note the fields I need, and check the official docs for rate limits. | I have a field list and one sample notice from each source. |
| 3 | Fetch and normalise | Write a Worker that fetches the latest notices from both services, pages through results with a pause between requests, retries if refused, converts both to one common shape, and removes duplicates. The date window is a setting, defaulting to 1 to 2 days. | One run returns clean, combined notices. |
| 4 | Store | Create a D1 table (ID, source, title, buyer, value, deadline, stage, CPV codes, region, link, score, reason, timestamps). Save only notices not seen before. | Re-running does not create duplicates. |
| 5 | Pre-filter | Apply the search criteria in code (topics, exclusions, stage, deadline, contract type, value flag) before any AI call. Log how many notices each rule removes. | Most irrelevant notices are dropped for free, and the log shows which rules did it. |
| 6 | AI scoring | Send each notice that passed the pre-filter to the AI with the fit profile. Ask for a structured reply (score 1 to 10 and a one or two sentence reason) and save it. Score each notice once. | Every kept notice has a score and a reason. |
| 7 | Schedule | Add a cron trigger so the Worker runs daily, plus basic logging of each run and any errors. | It runs unattended and the log shows what happened. |
| 8 | Front end | Build a simple web page, served by the Worker's static assets, listing notices by score, with filters and a link to the original notice. | I can browse the day's best matches. |
| 9 | Daily email digest (optional) | Send a short daily email of the top-scoring new notices, using an email service to be chosen. | A digest arrives each morning with the top matches. |
| 10 | Lock it down | Put Cloudflare Access in front of the site, confirm the AI key is a Worker secret, and check the public repo holds no secrets or private criteria. | The code is public and the live tool needs a login. |
| 11 | Test and refine | Compare the AI scores with my own judgement on a sample. Loosen any pre-filter rule that drops relevant notices. If I want history, write a separate backfill script that does one day at a time. | Scores broadly match what I would pick myself. |

## AI scoring

The AI scores each shortlisted notice from 1 to 10 against a fit profile, and returns a one or two sentence reason.

### Fit profile

The target is work with government and associated public bodies in these areas:

- Digital transformation, AI services, and technology, digital and AI adoption
- Public sector innovation and economic growth
- Economic resilience and supply chain resilience, including critical inputs
- Dual-use technologies across the defence and nuclear estate, and net zero
- Quantum technologies
- Critical national infrastructure

**Red flags:** work that is typically the remit of polling and research companies such as Ipsos, including opinion polling, attitude surveys and market research.

### Draft scoring bands

These are my starting suggestion, to be tuned in step 11.

| Score | Meaning |
|---|---|
| 9 to 10 | Strong fit with the profile, and £5m or more or clearly strategic |
| 7 to 8 | Good fit; worth reading the notice in full |
| 4 to 6 | Partial fit, or fits the profile but is small |
| 1 to 3 | Weak fit, or looks like polling or research work |

### Draft prompt

```text
You are helping me find UK public sector tenders worth pursuing.

My fit profile: [fit profile above]

Red flags: opinion polling, attitude surveys, market research and
social research. Score these 1 to 3.

Score the notice below from 1 to 10 using these bands: [bands above].
Notices under 5 million pounds can still score highly if the topic fits.
Goods and works notices have already been filtered out.

Reply with JSON only: {"score": <1-10>, "reason": "<one or two sentences>"}

Notice:
[title, buyer, value, stage, deadline, description]
```

The reply is saved as two fields, `score` and `reason`, against the notice in the database.

## Security

The one secret in this project is the AI API key, and the main risk is leaking it through a public repo. The government tender APIs need no key.

- **Storage in production:** as a Cloudflare Worker secret (set with `wrangler secret put`, or in the Cloudflare dashboard). The code reads it at runtime and the value is never in the repo.
- **Storage while developing:** in a local `.env` or `.dev.vars` file that is listed in `.gitignore`, so Git never uploads it.
- **Never commit a key.** Bots scan public repos for keys within minutes. Turn on GitHub secret scanning and push protection.
- **Keep the key server-side.** The web page calls my Worker, and the Worker calls the AI. A key in browser code can be copied by anyone.
- **Set a spend limit** on the AI account so a leak or a bug cannot run up a large bill.
- **Rotate on any doubt.** If the key may have leaked, delete it and create a new one straight away.
- **Public code, private tool.** Cloudflare Access puts a login in front of the live site. The repo stays public under an open-source licence.
- **Keep private settings out of the repo.** My tuned criteria and prompt can be loaded as a secret or stored in the database, if I would rather not publish them.

## Assumptions and open questions

Seven points in this plan are my own defaults rather than stated requirements, and are open for review.

### Assumptions

- Notices with no stated value are kept.
- Notices under £5m are kept if they match a topic, and flagged as lower priority.
- Pipeline notices have no bid deadline, so the 3-day rule does not remove them.
- Goods and works are dropped by the pre-filter, using the notice's procurement category (field to be confirmed in step 2).
- The exclusion terms for polling and research work are my suggestions.
- The scoring bands and the draft prompt are starting points to tune.
- The Find a Tender rate limit (about 12 requests per 2 minutes) comes from a third party and is unverified.

### Open questions

- Which email service to use for the optional digest.
- Which CPV codes to add to the topic filter, once real notices have been inspected.
- **Decided:** add the Scottish, Welsh and Northern Irish portals later, once the tool is proven on Find a Tender and Contracts Finder.

### Decisions from the step 2 data check

- **Duplicates across sources:** match notices on title and buyer (ignoring case and extra spaces), then keep one copy. The notice IDs differ between the two services, so IDs cannot be used.
- **Value:** use the value before tax (`tender.value.amount`), not the gross figure. Check this against Contracts Finder before relying on it.
- **No category:** drop notices with no `mainProcurementCategory`.
- **Awards:** filter out award notices (the `award`, `contract`, `awardUpdate` and `contractUpdate` tags). Other non-open tags (cancellations, termination and implementation notices) are not covered by this decision and still need a rule.
