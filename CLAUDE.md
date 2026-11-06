# Tender Finder

Personal learning project. Finds UK public sector tenders from Find a Tender and Contracts Finder, filters them, scores them with AI, and shows the results on a password-protected page. Read PLAN.md for the full plan and criteria.

## About me

I am a beginner. I use the Claude desktop app on a Mac and GitHub Desktop. Explain what you are doing in plain English, and give exact click-by-click instructions whenever I need to do something myself.

## Rules

- Never write API keys, tokens or passwords into any committed file, and never print the contents of .dev.vars. Secrets live in .dev.vars (local, gitignored) and Cloudflare Worker secrets (production).
- Before any command that costs money or changes production (deploy, setting secrets, AI calls on more than 50 notices), say what it will do and wait my OK.
- Work one build step at a time from PLAN.md. Propose a short plan first, then build.
- Keep code simple, with plain-English comments.
- Write tests for the pre-filter rules.
- The repo is public: no personal data and no private settings.
- Do not run git commit or git push. I save work with GitHub Desktop.

## Stack

Cloudflare Worker (TypeScript) with a cron trigger, D1 database, static assets for the web page, Cloudflare Access for login.
