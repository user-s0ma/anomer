# Anomer

Ask why your shop's numbers changed. "Why did orders drop last week?" gets a breakdown of the causes and how much each one contributed, with a range for each.

**Live:** https://anomer.magnificentrue.workers.dev — press **Try the demo** to use a shared demo shop with no sign-up.

Built for the Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026), Build for Your World.

## What it does

A small shop has its numbers spread across places: orders at the checkout, Meta ads, Instagram, the weather outside. When a number moves, the owner wants to know why, and how much each thing mattered.

Anomer answers two kinds of questions:

- **Why did a number change?** You point at a change ("orders Oct 12–18 vs the week before"). Anomer splits the difference into causes, for example ads paused −133 ± 27 orders, paydays +27, Instagram +5, weather +2, and what it could not explain.
- **Anything else about the data.** "Is there a weekly cycle?", "What was revenue in September?", "Do ad spend and orders move together?" Anomer runs the matching analyses (summary, day of the week, cycles, trend, correlation with a lag, highest and lowest days) and answers from their results.

In both cases the numbers come from code. Muse Spark reads the question and explains the results; it never produces a figure itself.

## How it works

1. **Muse Spark reads the question** (`src/lib/ai/question.ts`). It picks the number, the period that changed and the period to compare with, and sets aside numbers that cannot be causes because they are tied to the target by arithmetic (for revenue: orders and average order value). For other questions it chooses up to four analyses. Its answer is checked in code and sent back once with the problems if it does not pass.
2. **Code computes** (`src/lib/analysis/`).
   - Every connected number is shifted 0–7 days and placed next to the day of the week, the day of the month and a long-term trend.
   - One Lasso regression (coordinate descent, regularization chosen by time-ordered cross-validation) keeps the columns that matter.
   - The kept columns are refit by least squares, and the change between the two periods is split column by column and grouped by data source. Each group gets a 95% range; what is left over is shown as "Unexplained".
   - Nothing about paydays or weekends is hard-coded: a day-of-month column survives only if the data supports it.
3. **Muse Spark explains** (`src/lib/ai/explain.ts`). It gets only the computed breakdown and writes a short answer for the shop owner. Ranges that cross zero are described as possible noise.

The model is `muse-spark-1.3` through the Meta Model API, with structured output (a JSON schema, checked again with zod).

## Data sources

Each source is a plugin (`src/lib/sources/`) that describes its numbers (meaning, unit, how to sum a day, reporting delay) and returns daily values. The core knows nothing about any source.

| Source | Read through | Numbers |
|---|---|---|
| Orders | CSV upload (`order_id, created_at, customer_id, total`) | orders, revenue, average order value, new and returning customers |
| Meta ads | Marketing API Insights (Graph API v26.0) | spend, impressions, reach, clicks, CTR, CPC, CPM, purchases |
| Instagram | Instagram Graph API v26.0 | reach, views, likes, comments, saves, shares, profile link taps, feed posts, reels |
| Weather | NOAA GHCN-Daily (real data, 25 US cities) | high and low temperature, precipitation |

The demo shop uses real Portland weather and 400 days of history. Its ads, Instagram and orders are simulated with causes planted in them, so the answers can be checked: the ads are paused for a week, a reel goes viral, orders rise on paydays and fall on rainy days. The simulator answers in the same shape as the Graph API, and its orders go through the same CSV import, so the demo runs the same code a real shop would. Entering access tokens for real Meta accounts is not built yet.

## Built during the hackathon

- The analysis: lagged candidates, the Lasso with time-ordered cross-validation, the breakdown with ranges, and the analyses for other questions (`src/lib/analysis/`)
- The Muse Spark flow: reading the question, setting aside numbers that cannot be causes, and explaining the results (`src/lib/ai/`)
- The data sources: the Graph API and CSV readers, the simulator behind the demo, and NOAA weather (`src/lib/sources/`)

## Run it locally

Requires Node.js 22 and a Meta Model API key.

```sh
npm install
cp .dev.vars.example .dev.vars   # set BETTER_AUTH_SECRET and META_MODEL_API_KEY
npm run db:migrate:local
npm run dev                      # http://localhost:5190
```

Turnstile is skipped on `http://localhost`. `npm test` runs the analysis tests. `npx tsx scripts/try-demo.ts` computes the demo shop's breakdown from the command line and prints the planted ad effect next to it.

To deploy to Cloudflare Workers: create the D1 database named in `wrangler.jsonc`, run `npm run db:migrate`, set `BETTER_AUTH_SECRET`, `META_MODEL_API_KEY` and `TURNSTILE_SECRET_KEY` with `wrangler secret put`, put your URL and Turnstile site key in `.env.production`, and run `npm run deploy`.

## License

[Apache License 2.0](LICENSE).
