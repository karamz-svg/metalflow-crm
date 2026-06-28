# Metals Trading CRM — EU Non-Ferrous Sales Desk

A lightweight, **zero-dependency** sales CRM for a non-ferrous metals trader selling into the
European Union. It runs entirely in your browser — no install, no build step, no server required.

> Built to track the **top buyers in each of the 27 EU member states**, the **products** they buy
> from you, their **contacts**, today's **LME prices + EU premium**, and the **email status** of
> every buyer with a one-click "Send email" button.

---

## ✨ What it does

| Feature | Status |
|---|---|
| Catalog of all **25 products** grouped by base metal | ✅ |
| All **27 EU countries** with per-country buyer lists and coverage tiles | ✅ |
| **Buyer CRM** — name, country, city, website, contact, email, phone, materials, notes | ✅ |
| **LME price bar** pinned to the top (Copper, Aluminium, Zinc, Lead, Nickel) | ✅ |
| **Live daily price scan** — auto-fetch from a provider (Metals-API / custom) | ✅ |
| **EU aluminium duty-paid premium** shown next to the aluminium price | ✅ |
| **"Send email"** → opens Gmail with a **pre-written** message (products + today's prices) | ✅ |
| **Traffic-light status** 🔴 not contacted · 🟡 awaiting reply · 🟢 replied | ✅ |
| **Per-contact traffic lights** — each procurement contact tracked separately; company rolls up | ✅ |
| Click 🟢 / **View thread** → jumps to that buyer's Gmail conversation | ✅ |
| **Import** buyers from CSV (incl. Apollo.io exports) · **Export** JSON backup | ✅ |
| Search & filter, dashboard stats, reply notifications | ✅ |
| **Apollo.io buyer finder** — pulls procurement/buyer/trader contacts per company via a secure local proxy | ✅ |
| **EU starter list** — one click loads ~50 real EU non-ferrous producers/recyclers as research leads | ✅ |
| **Gmail auto-status** — connect Gmail (read-only) to auto-set 🟡/🟢 from your inbox | ✅ |
| **Auto-deploy** to GitHub Pages on every push (included workflow) | ✅ |
| **Custom countries** — add markets outside the EU (UK, Türkiye, USA…); empty EU countries auto-hide | ✅ |
| **Custom Sheet** — a free-form Excel-style tab for product/country/material rows | ✅ |

Your data is saved locally in your browser (`localStorage`). Use **Export** to back it up or move
it between devices.

---

## ▶️ How to run it

**Option A — open locally (quickest)**

Because the app loads its scripts as plain files, the most reliable way is a tiny local server:

```bash
cd metals-crm
python3 -m http.server 8000
# then open http://localhost:8000 in Chrome
```

**Option B — host free on GitHub Pages (recommended, gives you a shareable URL)**

This repo ships with a GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) that
**auto-deploys on every push to `main`**. To turn it on (one time):

1. Repo **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
2. Push anything to `main` (or run the workflow manually from the **Actions** tab).
3. Your site goes live at `https://<your-user>.github.io/metals-crm/` and updates on every push.

> The "Send email" and "View thread" buttons open **Gmail in a new tab**, so make sure you're
> logged into your Google work account in the same browser.

---

## 🚦 How the traffic lights work

- 🔴 **Red** — you haven't emailed this buyer yet.
- 🟡 **Yellow** — email sent, awaiting reply. *(Clicking "Send email" auto-moves a red buyer to yellow.)*
- 🟢 **Green** — they replied. A pulsing **"📬 Read reply"** badge appears; click it (or **View thread**)
  to jump straight to the Gmail conversation with that buyer.

**Per-contact lights:** once you add procurement contacts (via Apollo), each person gets their **own**
mini traffic light, ✉️ email button and 🔎 thread link. The company's headline light automatically
**rolls up** to the best of its contacts (🟢 if anyone replied, else 🟡 if anyone was emailed).

You set the status with one click on any light. Fully **automatic** reply-detection (inbox →
auto-green) requires the Gmail API — see *Upgrade paths* below.

---

## 📥 Importing buyers (incl. Apollo.io)

Click **Import CSV** and paste a CSV with a header row. Recognised columns:

```
name, country, city, contact, email, phone, website, materials, notes
```

- `country` is a 2-letter code (`DE`, `FR`, `IT`, …).
- `materials` is a `;`-separated list of **product names or ids**, e.g.
  `copper-cathode;Aluminium ingots;cu-scrap-millberry`. The importer matches by id *or* name.

Example:

```csv
name,country,city,contact,email,phone,website,materials
Aurubis AG,DE,Hamburg,Procurement,buyer@example.com,+49...,aurubis.com,copper-cathode;cu-scrap-millberry
```

**To use Apollo.io:** see the dedicated section below — it's built in.

### Quick start: the EU starter list
Don't want to type companies in? Click **Import → "Load EU starter list"** to drop in ~75 real EU
non-ferrous producers, smelters and recyclers (Aurubis, Boliden, KGHM, AMAG, Atlantic Copper,
ElvalHalcor, Wieland, KME, Constellium, Talum, Alro…) across ~24 countries, with their public
domains. These are **research leads** — contact emails are left blank on purpose; run **👥 Find
buyers** to pull verified procurement contacts, and verify the indicative material tags before pitching.

### 🔎 Discover more companies (Apollo org search)
On any country page, click **🔎 Discover companies** to have Apollo return **real companies** in that
country/industry (name + website). Tick the ones you want → they're added → then **Find buyers (all)**
fills their verified emails. This is the non-fabricated way to build toward ~25 buyers per country
without inventing anything. (Needs your Apollo key; works in `MOCK=1` to preview the flow.)

### On the Apollo FREE plan (important)
Apollo's **search/enrichment API requires a "master API key", and API access is a paid feature** —
the free plan blocks those endpoints. So the in-app **Find buyers** / **Discover companies** buttons
(which call the API) **won't work on a free plan**. You do **not** need to type companies one-by-one,
though — use Apollo's website to bulk-export, then import:
1. In the **Apollo web app**, run a People search with filters (job titles like *procurement/buyer/
   trader*, plus company location/industry).
2. **Select results in bulk → Save to a list → Export to CSV** (the free plan includes a limited
   monthly allotment of email/export credits — check your account's Credits page).
3. In this app: **Import → paste the CSV** (it maps name, country, email, phone, website, materials).

To use the one-click in-app automation instead, you'd need a paid Apollo tier that includes API
access + a master key.

---

## 👥 Finding buyer contacts with Apollo.io

The app can pull **procurement managers, buyers, traders, and sourcing/supply-chain people**
for each company straight from Apollo — the roles responsible for buying metals.

### Why a proxy?
Apollo's API **requires your key in a request header and blocks direct browser calls (CORS)**.
Putting the key in front-end JavaScript would expose it to anyone. So a tiny **local proxy**
(`server/apollo-proxy.js`) holds your key server-side and the app calls the proxy. The proxy has
**zero dependencies** — just Node 18+ (for built-in `fetch`).

### Setup (one time)
1. In Apollo: **Settings → Integrations → API** and create a **master API key**
   (People Search requires a *master* key).
2. Copy the key into a local env file — **this file is git-ignored and never committed**:
   ```bash
   cp .env.example .env
   # edit .env and set:  APOLLO_API_KEY=your_master_key
   ```
3. Start the proxy:
   ```bash
   # loads .env automatically on Node 20.6+:
   node --env-file=.env server/apollo-proxy.js
   # (older Node:  export APOLLO_API_KEY=your_master_key && node server/apollo-proxy.js)
   ```
   You should see `Apollo proxy listening on http://localhost:8787 … mode: LIVE | key: set`.
4. In the app: **Settings → Apollo.io contact finder**, confirm the proxy URL
   (`http://localhost:8787`) and click **Test proxy connection**.

### Using it
- On any company card, make sure the **website/domain is filled in**, then click **👥 Find buyers**.
- A picker lists matching contacts (name, title, seniority, LinkedIn). Tick the ones you want and
  **Add selected** — they attach to the company, and the first one becomes the primary contact.
- Each saved person with an email gets a **✉️** to open a pre-written Gmail draft *to that person*.
- **Bulk mode:** on any country (or "All buyers"), click **👥 Find buyers (all)** to enrich every
  company in one go. It runs sequentially with a polite delay to respect Apollo rate limits and
  auto-adds the contacts it finds.

### Emails locked? (`🔒`)
Apollo's **People Search returns people but not emails/phones** by design. To unlock them, tick
**“Reveal emails/phones”** in Settings — the proxy will then call Apollo's **enrichment** endpoint
(`reveal_personal_emails`), which **spends Apollo credits**. Leave it off to browse names/titles for free.

### Phone numbers (asynchronous)
Apollo delivers phone numbers **asynchronously to a webhook**, so the proxy must be reachable from
the public internet. Set `WEBHOOK_BASE_URL` to your proxy's public URL (deploy it, or run a tunnel
such as `ngrok http 8787`), then tick **“Also reveal phone numbers”** in Settings. Phones arrive a
little after the search — click **↻ phones** on a company card to pull in any that have landed.

### No key yet? Try MOCK mode
```bash
MOCK=1 node server/apollo-proxy.js
```
Returns realistic sample contacts so you can see the whole flow without a key or credits.

---

## 📥 Gmail auto-status (optional)

Connect your Gmail **read-only** so the app updates each buyer's traffic light automatically:
a reply from them → 🟢 green, you've emailed them → 🟡 yellow. The same local proxy handles it;
your Google tokens stay server-side in a git-ignored file (`.gmail-token.json`).

### Setup (one time) — Google Cloud Console
1. Create a project, then **APIs & Services → Enable APIs → enable the *Gmail API***.
2. **Credentials → Create credentials → OAuth client ID → type: Web application.**
3. Add an **Authorized redirect URI**: `http://localhost:8787/api/gmail/callback`
   (or your deployed proxy's `/api/gmail/callback`).
4. On the OAuth consent screen, add yourself as a **test user**.
5. Put the client id/secret in `.env`:
   ```bash
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   # GOOGLE_REDIRECT_URI=http://localhost:8787/api/gmail/callback   # only if non-default
   ```
6. Restart the proxy, then in the app: **Settings → Gmail auto-status → Connect Gmail**, approve,
   and click **Sync now** (or the **📥 Sync Gmail** button on any list).

The read-only scope means the app can *detect* replies but never send or modify mail — sending
still happens through the Gmail compose button you review yourself. Try it without credentials by
running the proxy in `MOCK=1` to see the sync flow.

---

## 👥 Team sync (shared data, optional)

By default each browser keeps its own data. To let a **team share one buyer list**, the proxy can
store the whole app state and serve it to everyone pointed at the same proxy.

### Setup
1. Run the proxy somewhere your team can reach (locally for one machine, or deploy it / tunnel it).
2. (Recommended) protect it with a shared secret in `.env`:
   ```bash
   DATA_AUTH_TOKEN=choose-a-long-random-string
   ```
3. In each teammate's app: **Settings → Team sync → Enable**, set the **Sync server URL** (blank uses
   the Apollo proxy URL) and the **same token**, then **Save**.

### How it behaves
- On load, the app **pulls** the shared state. Local edits are **pushed** automatically (debounced).
- Buttons **⬇ Pull from team** / **⬆ Push to team** let you sync on demand.
- It's **last-write-wins** — ideal for a small desk (1–3 people). Click **Pull** before a big editing
  session so you start from the latest. For heavy concurrent editing, move to a real database
  (the `Store` module is the single integration point).

---

## 💱 Prices (live ticker, scanned daily)

The board at the **top of every page** is a trading-desk style **ticker**: LME Copper, Aluminium,
Zinc, Lead, Nickel (3M), Gold spot, plus **AL premium DP-EU** and **CU eq premium CIF-EU** — each
with its price, a green/red **% change**, and a `/MT · date` subline. It **auto-refreshes live**
(interval set in **Settings → Live prices**, default 60s; set 0 to stop — mind your API quota) and
also does a daily scan. Prices feed straight into every email draft.

**No setup needed:** the default source is a **free web feed (no API key)** that pulls Gold, Copper
and Aluminium from public market data via a CORS relay. Each metal card shows a small **sparkline**
of its recent trend. LME Zinc/Lead/Nickel and the premiums aren't available free anywhere reliable,
so enter those once via **Edit** (they're saved). Want all metals auto-fetched? add a free Metals-API
key in **Settings → Live prices**.

The board at the **top of every page** shows LME Copper, Aluminium (+ EU duty-paid premium), Zinc,
Lead and Nickel, and is embedded into every email draft. You can always click **Update prices** to
enter values by hand, but the app can also **scan a price provider once a day automatically**.

### Why a provider (and why "delayed")
LME's own data feed is licensed (~$2,490/yr) and SMM is paid too — there's **no free official
real-time feed**, and the premium webpage can't be reliably or legally scraped. So the proxy pulls
from a provider **you** choose and normalizes everything to **USD/tonne**. Most affordable feeds are
**delayed/indicative** — fine for outreach, but confirm the exact number at contract.

### Setup (Metals-API example — has a free tier)
1. Get a key at metals-api.com (LME symbols: `LME-XCU`, `LME-ALU`, `LME-ZNC`, `LME-LEAD`, `LME-NI`).
2. In the proxy `.env`:
   ```bash
   PRICE_PROVIDER=metals-api
   PRICE_API_KEY=your_key
   PRICE_BASE=USD
   PRICE_REFRESH_HOURS=12      # daily-ish scan; cached so you don't burn quota
   ```
3. Restart the proxy. The app auto-scans on load (toggle in **Settings → Live prices**) and you can
   hit **↻ Live now** anytime. The bar shows the source + "delayed/indicative" + last-updated.

### Calibrating to match LME
Providers differ in units (per-tonne vs per-lb) and quoting (some return `base/symbol`), so there
are knobs to line the numbers up exactly — no code changes:
```bash
PRICE_INVERT=yes     # use 1/rate (default yes for metals-api)
PRICE_UNIT=tonne     # tonne | lb | oz  (lb/oz auto-converted to per-tonne)
PRICE_MULT=1         # final fine-tune multiplier
```
Sanity-check the first result against the LME site and adjust if needed.

### Bring your own feed
Prefer your own data source (or a licensed SMM/Fastmarkets feed)? Set `PRICE_PROVIDER=custom` and
`PRICE_FEED_URL=` to any endpoint returning normalized JSON:
```json
{ "copper":9250, "aluminium":2350, "zinc":2700, "lead":2050, "nickel":16500,
  "premium":290, "premiums":{"aluminium":290,"copper":120}, "source":"SMM", "asOf":1730000000000 }
```

### EU premiums (aluminium + others)
The aluminium **EU duty-paid premium** ([reference: LME premium page](https://www.lme.com/metals/non-ferrous/lme-aluminium-premiums/lme-aluminium-premium-duty-paid-european-fastmarkets-mb)) shows next to the aluminium price.
Premiums are **licensed data** (Fastmarkets), so to automate them point `PREMIUM_FEED_URL` at a feed
you're licensed for (or your own endpoint) returning `{ "aluminium":290, "copper":120, ... }` in
USD/MT — any metals you include appear as extra chips on the bar. Otherwise enter the premium by
hand under **Update prices**. (No key needed to try it: run the proxy with `MOCK=1`.)

---

## ⏫ Upgrade paths (the bits that need credentials / a backend)

| You want… | What it needs |
|---|---|
| **Real top-50 buyer lists + verified contacts** | An Apollo.io paid plan/API, or your own sourced list, imported via CSV. The app ships with a few clearly-labelled `[SAMPLE]` rows — delete them and import your real data. |
| **Procurement/buyer contacts per company** | ✅ Built in via the Apollo proxy (see above). Emails/phones need the *Reveal* toggle (uses credits). |
| **Auto "replied → green"** + status sync | ✅ Built in via Gmail read-only OAuth (see "Gmail auto-status"). |
| **Live LME / SMM prices** | ✅ Built in via the proxy price adapter (Metals-API or your own feed; scanned daily). Official real-time LME/SMM still needs a licensed feed. |
| **Multi-user / shared team data** | ✅ Built in via the proxy `/api/data` store (last-write-wins). For heavy concurrent use, swap in a hosted database — the `Store` module is the single integration point. |

---

## 🗂️ Project structure

```
metals-crm/
├── index.html              # app shell
├── README.md
├── .env.example            # copy to .env, add Apollo/Google keys (git-ignored)
├── .github/workflows/
│   └── deploy-pages.yml    # auto-deploy to GitHub Pages on push to main
├── server/
│   └── apollo-proxy.js     # zero-dep backend: Apollo key + Gmail OAuth
└── assets/
    ├── css/styles.css      # all styling (no framework)
    └── js/
        ├── data.js         # 25 products, 27 countries, price rows, buyer titles
        ├── seed-eu.js      # ~50 EU non-ferrous firms (research leads)
        ├── store.js        # localStorage state + CSV/JSON import-export + people
        ├── prices.js       # price formatting, all-in/derived values, live-feed hook
        ├── email.js        # Gmail compose + thread links, pre-written drafts
        ├── apollo.js       # front-end client for the Apollo proxy
        ├── gmail.js        # front-end client for Gmail auto-status
        ├── sync.js         # front-end client for team sync (shared data)
        └── app.js          # views, routing, all interactivity
```

No frameworks, no `npm install`, no build. Edit a file, refresh the page.

---

## ⚠️ Notes & good practice

- The seeded buyers are marked **`[SAMPLE]`** with `example.com` addresses — replace them with your
  real, verified data before sending anything.
- Always **review** each email in Gmail before hitting send (the app only pre-fills the draft).
- Keep your outreach compliant with GDPR / anti-spam rules for B2B contact in the EU.
