#!/usr/bin/env node
/* ============================================================
   apollo-proxy.js  —  tiny zero-dependency proxy for Apollo.io
   ------------------------------------------------------------
   WHY THIS EXISTS
   - Apollo's API blocks browser (CORS) calls and requires your
     key in a header. Putting the key in front-end JS would leak
     it. This proxy keeps the key server-side and exposes a
     small, CORS-enabled API the app can call.
   - No npm install needed: uses only Node's built-ins (Node 18+
     for global fetch).

   RUN IT
     export APOLLO_API_KEY=your_master_key        # do NOT commit this
     node server/apollo-proxy.js                   # listens on :8787
   Optional:
     PORT=9000 ALLOW_ORIGIN=https://you.github.io node server/apollo-proxy.js
     MOCK=1 node server/apollo-proxy.js            # no key / no network: fake data

   ENDPOINTS (POST, JSON)
     GET  /health
     POST /api/find-buyers
          { name, domain, locations?:[], titles?:[], page?:1,
            perPage?:10, reveal?:false }
          -> { people: [{ name, title, seniority, email, phone,
                          linkedin, locked }], raw_count }
   ============================================================ */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.APOLLO_API_KEY || "";
const PORT = Number(process.env.PORT || 8787);
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const MOCK = process.env.MOCK === "1" || (!API_KEY && process.env.MOCK !== "0");
// Phone numbers are delivered by Apollo ASYNCHRONOUSLY to a webhook, so the
// proxy must be reachable from the public internet for phone reveal to work
// (deploy it, or use a tunnel like `ngrok http 8787`). Set the public base URL:
const WEBHOOK_BASE_URL = (process.env.WEBHOOK_BASE_URL || "").replace(/\/+$/, "");

const APOLLO = "https://api.apollo.io/api/v1";

/* ---------------- Gmail (optional) — auto-detect replies ----------------
   Lets the app sync each buyer's traffic-light status from your inbox:
   a reply from them -> green, you contacted them -> yellow.
   Setup (one time) in Google Cloud Console:
     1. Create an OAuth 2.0 Client ID (type: Web application).
     2. Authorized redirect URI: <this proxy>/api/gmail/callback
        (default http://localhost:8787/api/gmail/callback).
     3. Enable the Gmail API; add yourself as a test user.
     4. Put the client id/secret in .env (GOOGLE_CLIENT_ID / _SECRET).
   Then click "Connect Gmail" in the app's Settings. Read-only scope. */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || ("http://localhost:" + PORT + "/api/gmail/callback");
const APP_RETURN_URL = process.env.APP_RETURN_URL || ""; // where to send the browser back after connecting
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOKEN_FILE = path.join(__dirname, "..", ".gmail-token.json");
const HAS_GOOGLE = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

// In-memory store of phone numbers that arrive via the async webhook.
// Keyed by lowercased "name"; also stored under "domain|name" when known.
const phoneStore = new Map(); // key -> { phone, ts }
function rememberPhone(name, domain, phone) {
  if (!name || !phone) return;
  const ts = Date.now();
  phoneStore.set(name.toLowerCase(), { phone, ts });
  if (domain) phoneStore.set(cleanDomain(domain) + "|" + name.toLowerCase(), { phone, ts });
}
function phonesForDomain(domain) {
  const d = cleanDomain(domain);
  const out = {};
  for (const [key, val] of phoneStore.entries()) {
    if (key.indexOf("|") !== -1) {
      const parts = key.split("|");
      if (parts[0] === d) out[parts[1]] = val.phone;
    }
  }
  return out;
}
function extractPhone(p) {
  return (p.phone_numbers && p.phone_numbers[0] && (p.phone_numbers[0].sanitized_number || p.phone_numbers[0].raw_number)) ||
         p.sanitized_phone || p.phone || "";
}
function personDomain(p) {
  return (p.organization && (p.organization.primary_domain || p.organization.website_url)) ||
         (p.email && p.email.indexOf("@") !== -1 ? p.email.split("@")[1] : "") || "";
}

/* Job titles that indicate someone responsible for BUYING metals.
   Apollo does partial matching, so these broad terms cast a wide net. */
const DEFAULT_TITLES = [
  "procurement", "purchasing", "buyer", "sourcing", "supply chain",
  "trader", "trading", "commodity", "raw materials", "category manager",
  "commercial", "head of metals"
];

/* ---------------- helpers ---------------- */
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN
  });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

async function apollo(path, body) {
  const r = await fetch(APOLLO + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": API_KEY
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  if (!r.ok) {
    const msg = (json && (json.error || json.message)) || ("Apollo responded " + r.status);
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return json;
}

/* ---------------- core: find buyers at a company ---------------- */
function cleanDomain(d) {
  if (!d) return "";
  return String(d).trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
}

function mapPerson(p, emailMap) {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || "";
  const enriched = emailMap && emailMap[name.toLowerCase()];
  let email = (enriched && enriched.email) || p.email || "";
  const locked = /email_not_unlocked|not_unlocked/i.test(email);
  if (locked) email = "";
  return {
    name,
    title: p.title || "",
    seniority: p.seniority || "",
    email,
    phone: (enriched && enriched.phone) || (p.phone_numbers && p.phone_numbers[0] && p.phone_numbers[0].sanitized_number) || "",
    linkedin: p.linkedin_url || "",
    locked
  };
}

async function findBuyers(opts) {
  const domain = cleanDomain(opts.domain);
  const titles = (Array.isArray(opts.titles) && opts.titles.length) ? opts.titles : DEFAULT_TITLES;
  const perPage = Math.min(Number(opts.perPage || 10), 25);

  if (MOCK) return mockBuyers(opts, titles);

  if (!API_KEY) throw new Error("APOLLO_API_KEY is not set on the proxy.");
  if (!domain) throw new Error("This company has no website/domain. Add one (e.g. aurubis.com) so Apollo can find its people.");

  // 1) People search (no emails returned here)
  const searchBody = {
    person_titles: titles,
    q_organization_domains_list: [domain],
    page: Number(opts.page || 1),
    per_page: perPage
  };
  if (Array.isArray(opts.locations) && opts.locations.length) {
    searchBody.person_locations = opts.locations;
  }
  const search = await apollo("/mixed_people/search", searchBody);
  const people = (search.people || search.contacts || []).slice(0, perPage);

  // 2) Optional enrichment to reveal emails/phones (costs credits)
  let emailMap = null;
  if (opts.reveal && people.length) {
    const details = people.slice(0, 10).map((p) => ({
      first_name: p.first_name, last_name: p.last_name, domain: domain
    }));
    // Phone reveal is async: Apollo posts results to our webhook later.
    const wantPhone = !!opts.revealPhone && !!WEBHOOK_BASE_URL;
    const enrichBody = {
      details,
      reveal_personal_emails: true,
      reveal_phone_number: wantPhone
    };
    if (wantPhone) enrichBody.webhook_url = WEBHOOK_BASE_URL + "/api/apollo-webhook";
    try {
      const enr = await apollo("/people/bulk_match", enrichBody);
      emailMap = {};
      (enr.matches || []).forEach((m) => {
        if (!m) return;
        const nm = [m.first_name, m.last_name].filter(Boolean).join(" ").toLowerCase();
        const phone = extractPhone(m);
        if (phone) rememberPhone(nm, domain, phone);
        emailMap[nm] = {
          email: m.email && !/not_unlocked/i.test(m.email) ? m.email : "",
          phone: phone
        };
      });
    } catch (e) {
      // enrichment is best-effort; return search results even if it fails
      console.warn("[apollo] enrichment failed:", e.message);
    }
  }

  // Merge any phones already received via webhook for this domain.
  const knownPhones = phonesForDomain(domain);
  const mapped = people.map((p) => mapPerson(p, emailMap));
  mapped.forEach((mp) => {
    if (!mp.phone && knownPhones[mp.name.toLowerCase()]) mp.phone = knownPhones[mp.name.toLowerCase()];
  });
  return {
    people: mapped,
    raw_count: (search.pagination && search.pagination.total_entries) || people.length,
    phone_pending: !!opts.revealPhone && !!WEBHOOK_BASE_URL
  };
}

/* ---------------- mock data (no key / no network) ---------------- */
function mockBuyers(opts, titles) {
  const dom = cleanDomain(opts.domain) || "example.com";
  const ph = (opts.reveal && opts.revealPhone) ? [{ sanitized_number: "+49 151 0000000" }] : [];
  const sample = [
    { first_name: "Markus", last_name: "Bauer", title: "Head of Procurement", seniority: "head", email: opts.reveal ? "m.bauer@" + dom : "email_not_unlocked@" + dom, linkedin_url: "https://linkedin.com/in/sample1", phone_numbers: ph },
    { first_name: "Sofia", last_name: "Rossi", title: "Senior Metals Buyer", seniority: "senior", email: opts.reveal ? "s.rossi@" + dom : "email_not_unlocked@" + dom, linkedin_url: "https://linkedin.com/in/sample2", phone_numbers: ph },
    { first_name: "Pieter", last_name: "De Vries", title: "Commodity Trader (Non-Ferrous)", seniority: "manager", email: opts.reveal ? "p.devries@" + dom : "email_not_unlocked@" + dom, linkedin_url: "https://linkedin.com/in/sample3", phone_numbers: ph }
  ];
  return { people: sample.map((p) => mapPerson(p, null)), raw_count: sample.length, mock: true };
}

/* ---------------- Gmail helpers (optional) ---------------- */
function loadToken() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")); } catch (e) { return null; }
}
function saveToken(t) {
  try { fs.writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 2)); } catch (e) { console.error("[gmail] could not save token:", e.message); }
}
function gmailAuthUrl() {
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent"
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}
async function googleToken(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString()
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || "Google token error");
  return j;
}
async function exchangeCode(code) {
  const j = await googleToken({
    code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code"
  });
  j.obtained_at = Date.now();
  saveToken(j);
  return j;
}
async function accessToken() {
  let tok = loadToken();
  if (!tok) throw new Error("Gmail not connected.");
  const ageSec = (Date.now() - (tok.obtained_at || 0)) / 1000;
  if (!tok.access_token || ageSec > (tok.expires_in || 3600) - 90) {
    if (!tok.refresh_token) throw new Error("Gmail session expired — reconnect.");
    const fresh = await googleToken({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tok.refresh_token, grant_type: "refresh_token"
    });
    tok = Object.assign({}, tok, fresh, { obtained_at: Date.now() });
    saveToken(tok);
  }
  return tok.access_token;
}
async function gmailGet(urlPath) {
  const token = await accessToken();
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me" + urlPath, {
    headers: { Authorization: "Bearer " + token }
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || ("Gmail API " + r.status));
  return j;
}
async function gmailProfileEmail() {
  try { const p = await gmailGet("/profile"); return p.emailAddress || ""; } catch (e) { return ""; }
}
async function hasMessage(query) {
  const j = await gmailGet("/messages?maxResults=1&q=" + encodeURIComponent(query));
  return (j.resultSizeEstimate || 0) > 0 || (j.messages && j.messages.length > 0);
}
// For each buyer email: did they reply (from:) and did we contact them (to:)?
async function gmailCheck(emails) {
  const out = {};
  for (const raw of emails) {
    const e = (raw || "").trim();
    if (!e) continue;
    const key = e.toLowerCase();
    if (!HAS_GOOGLE || !loadToken()) {
      if (MOCK) { out[key] = { contacted: true, replied: (key.charCodeAt(0) % 2 === 0), mock: true }; continue; }
      out[key] = { error: "Gmail not connected" }; continue;
    }
    try {
      const replied = await hasMessage("from:" + e);
      const contacted = await hasMessage("to:" + e);
      out[key] = { replied: replied, contacted: contacted };
    } catch (err) {
      out[key] = { error: err.message };
    }
  }
  return out;
}

/* ---------------- Live prices (optional) ----------------
   LME/SMM official data is licensed, so this adapter pulls from a
   provider you configure and normalizes everything to USD/tonne.
   Providers (env PRICE_PROVIDER):
     • metals-api  — metals-api.com, LME-* symbols (free tier available)
     • custom      — PRICE_FEED_URL returns our normalized JSON directly
     • mock        — sample numbers, no key/network (default in MOCK mode)
   It caches results and refreshes at most once per PRICE_REFRESH_HOURS
   (a daily scan), so the app can show "today's price" without burning
   your provider quota. Calibration knobs (PRICE_INVERT / PRICE_UNIT /
   PRICE_MULT) let you match LME exactly regardless of provider units. */
const PRICE_PROVIDER = (process.env.PRICE_PROVIDER || (MOCK ? "mock" : "")).toLowerCase();
const PRICE_API_KEY = process.env.PRICE_API_KEY || "";
const PRICE_BASE = process.env.PRICE_BASE || "USD";
const PRICE_FEED_URL_CUSTOM = process.env.PRICE_FEED_URL || "";
const PREMIUM_FEED_URL = process.env.PREMIUM_FEED_URL || "";
const PRICE_REFRESH_MS = Math.max(1, Number(process.env.PRICE_REFRESH_HOURS || 12)) * 3600 * 1000;
const PRICE_INVERT = /^(1|yes|true)$/i.test(process.env.PRICE_INVERT || (PRICE_PROVIDER === "metals-api" ? "yes" : "no"));
const PRICE_UNIT = (process.env.PRICE_UNIT || "tonne").toLowerCase();
const UNIT_MULT = PRICE_UNIT === "lb" ? 2204.62 : (PRICE_UNIT === "oz" ? 32150.7 : 1);
const PRICE_MULT = Number(process.env.PRICE_MULT || 1);
const METALS_API_SYM = { copper: "LME-XCU", aluminium: "LME-ALU", zinc: "LME-ZNC", lead: "LME-LEAD", nickel: "LME-NI" };
let priceCache = { data: null, ts: 0 };

function calibrate(raw) {
  if (raw == null || isNaN(raw)) return null;
  let v = Number(raw);
  if (PRICE_INVERT && v !== 0) v = 1 / v;
  v = v * UNIT_MULT * PRICE_MULT;
  return Math.round(v);
}

async function fetchMetalsApi() {
  if (!PRICE_API_KEY) throw new Error("PRICE_API_KEY not set for metals-api.");
  const syms = Object.values(METALS_API_SYM).join(",") + ",XAU";
  const url = "https://metals-api.com/api/latest?access_key=" + encodeURIComponent(PRICE_API_KEY) +
              "&base=" + encodeURIComponent(PRICE_BASE) + "&symbols=" + encodeURIComponent(syms);
  const r = await fetch(url);
  const j = await r.json();
  if (!j || j.success === false) throw new Error((j && j.error && (j.error.info || j.error.message)) || "metals-api error");
  const rates = j.rates || {};
  const out = { currency: PRICE_BASE, source: "Metals-API (LME, delayed)", asOf: Date.now(), delayed: true };
  for (const metal in METALS_API_SYM) {
    const sym = METALS_API_SYM[metal];
    let raw = rates[sym];
    if (raw == null) raw = rates[PRICE_BASE + sym]; // some plans key as "USDLME-XCU"
    out[metal] = calibrate(raw);
  }
  let graw = rates["XAU"]; if (graw == null) graw = rates[PRICE_BASE + "XAU"];
  if (graw != null && !isNaN(graw)) out.gold = Math.round(Number(graw) < 1 ? 1 / graw : Number(graw)); // per troy oz
  return out;
}

async function fetchCustomPrices() {
  if (!PRICE_FEED_URL_CUSTOM) throw new Error("PRICE_FEED_URL not set for custom provider.");
  const r = await fetch(PRICE_FEED_URL_CUSTOM);
  const j = await r.json();
  j.asOf = j.asOf || Date.now();
  j.source = j.source || "Custom feed";
  return j;
}

async function fetchPremiums() {
  if (!PREMIUM_FEED_URL) return null;
  try {
    const r = await fetch(PREMIUM_FEED_URL);
    const j = await r.json();
    return (j && (j.premiums || j)) || null; // { aluminium: 290, copper: ... } USD/MT
  } catch (e) { console.warn("[prices] premium feed failed:", e.message); return null; }
}

function mockPrices() {
  // small random drift each call so the live ticker visibly updates
  const j = (n, p) => Math.round(n * (1 + (Math.random() - 0.5) * p));
  return {
    copper: j(13270, 0.01), aluminium: j(3164, 0.01), zinc: j(3434, 0.01),
    lead: j(1913, 0.01), nickel: j(16500, 0.01), gold: j(4085, 0.01),
    premium: 585, premiums: { aluminium: 585, copper: 135 },
    currency: "USD", source: "MOCK (sample prices)", asOf: Date.now(), delayed: true
  };
}

async function getPrices(force) {
  if (!force && priceCache.data && (Date.now() - priceCache.ts) < PRICE_REFRESH_MS) {
    return Object.assign({}, priceCache.data, { cached: true });
  }
  let data;
  if (PRICE_PROVIDER === "mock") data = mockPrices();
  else if (PRICE_PROVIDER === "custom") data = await fetchCustomPrices();
  else if (PRICE_PROVIDER === "metals-api") data = await fetchMetalsApi();
  else throw new Error("No price provider configured. Set PRICE_PROVIDER (metals-api | custom | mock) in .env.");

  const prem = await fetchPremiums();
  if (prem) {
    data.premiums = Object.assign({}, data.premiums || {}, prem);
    if (prem.aluminium != null) data.premium = prem.aluminium;
  }
  priceCache = { data: data, ts: Date.now() };
  return data;
}

// Daily background scan (best-effort; only when a real provider is set).
if (PRICE_PROVIDER && PRICE_PROVIDER !== "mock") {
  const t = setInterval(function () {
    getPrices(true).catch(function (e) { console.warn("[prices] scheduled refresh failed:", e.message); });
  }, PRICE_REFRESH_MS);
  if (t.unref) t.unref();
}

/* ---------------- Company discovery (Apollo org search) ----------------
   Finds REAL companies per country/industry so you can build a buyer list
   without inventing anything. Pair with /api/find-buyers to get emails. */
async function findCompanies(opts) {
  const perPage = Math.min(Number(opts.perPage || 25), 25);
  if (MOCK) return mockCompanies(opts, perPage);
  if (!API_KEY) throw new Error("APOLLO_API_KEY is not set on the proxy.");
  const body = {
    q_organization_keyword_tags: (opts.keywords && opts.keywords.length) ? opts.keywords : ["non-ferrous metals", "metals", "aluminium", "copper", "metal recycling"],
    page: Number(opts.page || 1),
    per_page: perPage
  };
  if (opts.country) body.organization_locations = [opts.country];
  const r = await apollo("/mixed_companies/search", body);
  const orgs = r.organizations || r.accounts || [];
  return {
    companies: orgs.slice(0, perPage).map(function (o) {
      return {
        name: o.name || "",
        domain: cleanDomain(o.primary_domain || o.website_url || ""),
        city: o.organization_city || o.city || "",
        linkedin: o.linkedin_url || ""
      };
    }),
    total: (r.pagination && r.pagination.total_entries) || orgs.length
  };
}
function mockCompanies(opts, perPage) {
  const loc = opts.country || "the EU";
  const base = [
    { name: "[MOCK] " + loc + " Copper Works", domain: "example-copper.com", city: loc },
    { name: "[MOCK] " + loc + " Aluminium Recycling", domain: "example-alu.com", city: loc },
    { name: "[MOCK] " + loc + " Non-Ferrous Trading", domain: "example-nf.com", city: loc }
  ];
  return { companies: base.slice(0, perPage), total: base.length, mock: true };
}

/* ---------------- Team data store (optional) ----------------
   Shares the app's whole state between teammates. File-backed
   (.data-store.json, git-ignored), last-write-wins, with an
   optional shared-secret token. Point every teammate's app at
   this proxy URL and enable "Team sync" in Settings. */
const DATA_FILE = path.join(__dirname, "..", ".data-store.json");
const DATA_AUTH_TOKEN = process.env.DATA_AUTH_TOKEN || "";
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (e) { return { state: null, rev: 0, updatedAt: 0 }; }
}
function saveData(obj) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(obj)); } catch (e) { console.error("[data] save failed:", e.message); }
}
function dataAuthOK(req) {
  if (!DATA_AUTH_TOKEN) return true;
  return (req.headers["x-data-token"] || "") === DATA_AUTH_TOKEN;
}

/* ---------------- server ---------------- */
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const path = req.url.split("?")[0];

  if (req.method === "GET" && path === "/health") {
    return send(res, 200, { ok: true, mock: MOCK, hasKey: !!API_KEY, webhookConfigured: !!WEBHOOK_BASE_URL, gmailConfigured: HAS_GOOGLE, priceProvider: PRICE_PROVIDER || "none", teamSync: true, teamSyncProtected: !!DATA_AUTH_TOKEN });
  }

  if (req.method === "GET" && path === "/api/prices") {
    try {
      const force = /[?&]force=1/.test(req.url);
      const data = await getPrices(force);
      return send(res, 200, data);
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  // ---- Team data store (shared state) ----
  if (path === "/api/data") {
    if (!dataAuthOK(req)) return send(res, 401, { error: "Bad or missing X-Data-Token." });
    if (req.method === "GET") {
      return send(res, 200, loadData());
    }
    if (req.method === "PUT" || req.method === "POST") {
      try {
        const body = await readBody(req);
        if (!body.state || !Array.isArray(body.state.companies)) return send(res, 400, { error: "Missing/invalid state." });
        const prev = loadData();
        const rec = { state: body.state, rev: (prev.rev || 0) + 1, updatedAt: Date.now() };
        saveData(rec);
        return send(res, 200, { rev: rec.rev, updatedAt: rec.updatedAt });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }
  }

  // ---- Gmail OAuth + reply detection ----
  if (req.method === "GET" && path === "/api/gmail/status") {
    if (!HAS_GOOGLE && !MOCK) return send(res, 200, { configured: false, connected: false });
    const tok = loadToken();
    const connected = MOCK ? true : !!tok;
    const email = connected && HAS_GOOGLE ? await gmailProfileEmail() : (MOCK ? "you@example.com" : "");
    return send(res, 200, { configured: HAS_GOOGLE || MOCK, connected: connected, email: email, mock: MOCK && !HAS_GOOGLE });
  }
  if (req.method === "GET" && path === "/api/gmail/auth") {
    if (!HAS_GOOGLE) return sendHtml(res, 400, "<p>Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the proxy's .env (see README).</p>");
    res.writeHead(302, { Location: gmailAuthUrl() });
    return res.end();
  }
  if (req.method === "GET" && path === "/api/gmail/callback") {
    const q = new URLSearchParams(req.url.split("?")[1] || "");
    const code = q.get("code");
    if (!code) return sendHtml(res, 400, "<p>Missing authorization code.</p>");
    try {
      await exchangeCode(code);
      const back = APP_RETURN_URL ? ('<p><a href="' + APP_RETURN_URL + '">Return to the app</a></p>') : "";
      return sendHtml(res, 200, "<html><body style='font-family:sans-serif;background:#0f1620;color:#e7eef6;text-align:center;padding:60px'>" +
        "<h2>✅ Gmail connected</h2><p>You can close this tab and click <strong>Sync Gmail</strong> in the app.</p>" + back +
        "</body></html>");
    } catch (e) {
      return sendHtml(res, 400, "<p>Gmail connection failed: " + e.message + "</p>");
    }
  }
  if (req.method === "POST" && path === "/api/gmail/check") {
    try {
      const body = await readBody(req);
      const results = await gmailCheck(body.emails || []);
      return send(res, 200, { results: results });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  if (req.method === "POST" && path === "/api/find-buyers") {
    try {
      const body = await readBody(req);
      const result = await findBuyers(body);
      return send(res, 200, result);
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (req.method === "POST" && path === "/api/find-companies") {
    try {
      const body = await readBody(req);
      const result = await findCompanies(body);
      return send(res, 200, result);
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  // Apollo posts async phone-reveal results here.
  if (req.method === "POST" && path === "/api/apollo-webhook") {
    try {
      const body = await readBody(req);
      const list = body.people || body.matches || body.contacts || (body.person ? [body.person] : (Array.isArray(body) ? body : []));
      let n = 0;
      list.forEach((p) => {
        if (!p) return;
        const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || "";
        const phone = extractPhone(p);
        if (name && phone) { rememberPhone(name, personDomain(p), phone); n++; }
      });
      console.log("[apollo] webhook received", n, "phone(s)");
      return send(res, 200, { ok: true, stored: n });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  // Frontend polls this to pick up phones that arrived via the webhook.
  if (req.method === "GET" && path === "/api/phones") {
    const q = req.url.indexOf("?") !== -1 ? req.url.split("?")[1] : "";
    const params = new URLSearchParams(q);
    return send(res, 200, { phones: phonesForDomain(params.get("domain") || "") });
  }

  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log("Apollo proxy listening on http://localhost:" + PORT);
  console.log("  mode:", MOCK ? "MOCK (no real Apollo calls)" : "LIVE", "| key:", API_KEY ? "set" : "MISSING");
  console.log("  phone webhook:", WEBHOOK_BASE_URL ? (WEBHOOK_BASE_URL + "/api/apollo-webhook") : "disabled (set WEBHOOK_BASE_URL)");
  console.log("  gmail:", HAS_GOOGLE ? ("configured · redirect " + GOOGLE_REDIRECT_URI) : "disabled (set GOOGLE_CLIENT_ID/SECRET)");
  console.log("  prices:", PRICE_PROVIDER ? (PRICE_PROVIDER + " · refresh every " + (PRICE_REFRESH_MS / 3600000) + "h") : "disabled (set PRICE_PROVIDER)");
  console.log("  team sync:", "enabled" + (DATA_AUTH_TOKEN ? " (token-protected)" : " (open — set DATA_AUTH_TOKEN to protect)"));
  console.log("  endpoints: GET /health, POST /api/find-buyers, POST /api/apollo-webhook, GET /api/phones, GET /api/prices, GET|PUT /api/data,");
  console.log("             GET /api/gmail/status, GET /api/gmail/auth, GET /api/gmail/callback, POST /api/gmail/check");
});
