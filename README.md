# Churn-retention dashboard for subscription brands — v1

Local, zero-cost, dependency-free foundation. A Shopify subscription brand
(beauty, supplements, meal kits, pet food) can see churn risk across its
subscriber base, get a prioritized win-back action list, and see what the
at-risk revenue is worth — before any integration exists.

## What v1 is

- **Landing page** (`index.html`) — problem, how it works, transparent scoring rules.
- **Dashboard** (`dashboard.html`) — summary cards (subscribers, High/Medium risk,
  Healthy, MRR at risk, estimated recoverable value), a priority action list, and
  a filterable churn-risk table with a reason for every flag.
- **CSV upload** — a brand uploads a subscribers CSV and scoring runs locally in
  the browser. Nothing is sent anywhere: no backend, no API calls, no tracking.
- **Demo data** — the dashboard loads with realistic demo subscribers so the
  product is visible and clickable with zero setup.

## How to run (local only)

```bash
cd v1
python3 server.py
```

Then open:

- Landing: http://127.0.0.1:8000/
- Dashboard: http://127.0.0.1:8000/dashboard.html

No install step. No accounts, no API keys, no paid tier. Any static file server
(`python3 -m http.server 8000`) works the same way.

## CSV format

```csv
customer,plan,start_date,status,last_order_date,monthly_price
Ava Martinez,Glow Monthly,2026-04-05,active,2026-10-29,29
```

Required columns: `customer`, `status`, `last_order_date`.
Optional: `plan`, `start_date`, `monthly_price`.
Header names are matched case-insensitively (`customer_name`, `last order`, … work too).
A ready sample is in `demo-subscribers.csv` (also downloadable from the dashboard).

## v1 scoring rules (rule-based only — clearly labeled, no AI)

Reference date for an uploaded CSV = the **latest last-order date in the file**
(deterministic and documented). Demo data uses today.

| Flag | Rule |
|---|---|
| Healthy | Ordered within 14 days |
| Watch | No order in 15–29 days |
| Medium | No order in 30–45 days |
| High | No order in 45+ days |
| New-subscriber bump | Tenure < 60 days with a 15+ day gap → one tier up |
| Paused / Churned | Shown separately; never counted as "at risk" |

ROI summary: MRR at risk = monthly price of High + Medium subscribers.
Estimated recoverable = 20% of MRR at risk — a **labeled assumption**, not a
promise. If the CSV has no price column, ROI uses a $30/month assumption and
says so in the UI. Paused/cancelled subscribers are excluded from both numbers.

## What is stubbed (deliberately, v1 scope)

| Area | v1 status | Later phase |
|---|---|---|
| Shopify OAuth + store data sync | Stubbed — CSV upload instead | Phase 1 (free app) |
| Recharge subscription sync | Stubbed | Phase 1 |
| Klaviyo email sending | Stubbed — actions are suggestions only, nothing is sent | Phase 2 |
| Supabase (Postgres + Auth) | Stubbed — no accounts, no stored data | Phase 1 |
| Stripe billing | Stubbed — no payments of any kind | Phase 3 |
| AI inference (churn prediction, win-back copy) | Stubbed — rule-based scoring only, no model calls | Phase 2 |
| Hosting / public URL | Local only — nothing deployed | See "going live" below |

## Packaging this as a Shopify app later (pending-owner actions)

These steps need the owner's accounts and decisions, so they are listed here
and **not** attempted in v1:

1. **Shopify Partner account** — owner creates it (free) at partners.shopify.com.
2. **Create the app** in the Partner dashboard (App setup → choose "Public app",
   set App URL / redirect URLs to the hosted app once deployed).
3. **OAuth scopes** — request the minimum needed: read customers, read orders,
   read subscriptions (Recharge data comes via Recharge's own OAuth).
4. **Replace CSV import with live sync** — Shopify Admin API + Recharge API
   pull subscribers/orders on install and on a schedule; keep the same scoring
   function and table UI.
5. **Add accounts + persistence** — Supabase free tier for Auth + Postgres;
   store per-shop subscriber snapshots, not raw PII beyond what the app needs.
6. **Billing** — Shopify Billing API (free tier up to 500 subscribers, then
   $99/month + usage) replaces the stubbed Stripe plan; or Stripe if sold
   off-Shopify.
7. **App Store listing** — name, description, screenshots (dashboard + upload
   flow), pricing page, privacy policy, support contact; submit for review.
8. **Shopify app review** — address review feedback (data-use disclosures,
   GDPR webhooks for data erasure/redaction are mandatory for public apps).
9. **Launch wedge** — free tier only, target 100 installs in 30 days via store
   search, r/shopify, Product Hunt, and direct outreach to subscription-brand
   communities. Phase 2 (AI win-back) and Phase 3 (usage pricing) are gated on
   Phase 1 proving demand — do not build them early.

## Project structure

```text
v1/
├── index.html            Landing page
├── dashboard.html        Dashboard UI (table, actions, ROI summary, upload)
├── app.js                Demo data, rule-based scoring, CSV parsing, rendering
├── style.css             All styling (no external assets)
├── demo-subscribers.csv  Sample upload file
├── server.py             Zero-dependency local server (stdlib only)
└── README.md             This file
```

## Next step to get it live (single step)

Deploy this exact folder to a free static host (e.g. Vercel, Netlify, or
GitHub Pages — all free tiers, no code changes needed since there is no
backend), then share the public URL. Real Shopify data, accounts, and billing
come only after the owner actions above.
