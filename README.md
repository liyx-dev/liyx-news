# LIYX — live world news, everywhere you are

A premium, location-aware news feed. Vanilla HTML/CSS/JS, no framework, no build step for the web version, wrapped with Capacitor for a real Android app with AdMob ads.

**Built by Liyog Bartoos O.** · Open source (MIT)

---

## What this is

- A live news feed pulled directly from public RSS sources (BBC, Reuters, Al Jazeera, NPR, and country-specific outlets for Nigeria, South Africa, UK, Kenya, Ghana, Egypt, and more) — no API key, no signup.
- Feed scope auto-detects the user's country (IP-based, no permission prompt) and shows locally relevant news alongside world/global stories.
- An on-device "LiyX AI" engine (`www/js/insight.js`) generates a one-line extractive summary and topic tags per story — **zero API calls, zero cost, runs entirely in the browser/app.**
- A thin Supabase backend (one table) tracks anonymous view/share counts per story, auto-expiring every 48 hours — nothing accumulates.
- Sharing a story generates a LIYX-branded link (`liyx.app/#/go/:id`) that opens LIYX first, then continues to the original source — this is the viral loop. The story's title/image/link is attached to its Supabase row *only when shared*, so the link resolves correctly for anyone who taps it — not just the person who originally cached it. If a link is too old or was never actually shared, the person is dropped straight into the live feed instead of a dead end.
- Wrapped with Capacitor for Android, with real AdMob banner, interstitial, native feed, and app-open ads, ready for Play Store submission.

## Quick start (web only, no backend needed to try it)

Open `www/index.html` in any browser. It works immediately — Supabase and ads are optional layers that degrade gracefully when not configured.

## Full setup

Read these in order:

1. [`docs/00-REPO-STRUCTURE.md`](docs/00-REPO-STRUCTURE.md) — what every file does
2. [`docs/01-SUPABASE-SETUP.md`](docs/01-SUPABASE-SETUP.md) — backend setup, from scratch
3. [`docs/02-ADMOB-SETUP.md`](docs/02-ADMOB-SETUP.md) — AdMob + Capacitor + Play Store submission
4. [`docs/03-GITHUB-SETUP.md`](docs/03-GITHUB-SETUP.md) — getting this repo live from a phone

## Roadmap (intentionally deferred, per project plan)

- [ ] Daily quote card in the feed
- [ ] Live video news pulled from YouTube
- [ ] Expand country-specific source lists (Ireland, more of West/East Africa, wider EU)

## Philosophy

- **No accounts.** Nobody signs up. Ever.
- **Nothing lives forever.** Local cache and backend rows both expire within 48 hours.
- **The backend only ever sees a story's content if it's shared.** Views stay anonymous numbers; the moment-of-share content snapshot is what powers the "our URL first" viral loop, not general tracking.
- **No paid APIs.** RSS is free, the summarizer runs on-device, Supabase free tier covers the thin backend.
- **The web version and the app are the same code.** `www/` is the whole app — Capacitor just wraps it.
