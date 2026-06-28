/* ============================================================
   store.js  —  localStorage-backed state + import/export
   ============================================================ */
window.App = window.App || {};

(function (App) {
  "use strict";

  var KEY = "metals-crm-state-v1";

  var DEFAULT_SETTINGS = {
    senderName: "Your Name",
    senderTitle: "Sales / Trading",
    companyName: "Your Company Ltd.",
    senderEmail: "",            // your Gmail work address (used to build thread links)
    phone: "",
    website: "",
    signature: "",              // optional extra signature lines
    apolloProxyUrl: "http://localhost:8787",  // address of your local Apollo proxy
    revealContacts: false,      // if true, proxy spends Apollo credits to unlock emails
    revealPhone: false,         // if true, also request phone numbers (async; needs public proxy)
    autoScanPrices: true,       // auto-fetch live prices daily on app load (needs a price provider)
    priceSource: "free",        // free | metalsapi | custom | proxy | manual
    priceApiKey: "",            // Metals-API key (only if you choose the metalsapi source)
    priceCustomUrl: "",         // any CORS JSON endpoint returning normalized prices
    priceInvert: true,          // Metals-API returns base/symbol -> use 1/rate
    priceUnit: "tonne",         // tonne | lb | oz (converted to per-tonne)
    priceMult: 1,               // final calibration multiplier
    priceLiveSeconds: 60,       // auto-refresh interval for the live ticker (0 = off)
    teamSync: false,            // share data with teammates via the proxy /api/data
    syncServerUrl: "",          // defaults to the Apollo proxy URL when blank
    syncToken: "",              // optional shared secret (matches proxy DATA_AUTH_TOKEN)
    displayCurrency: "USD",     // USD | EUR (ticker display toggle; prices stored in USD)
    margins: {},                // productId -> margin % applied over the metal price for offers
    templates: [],              // [{ id, name, subject, body }] email templates
    defaultTemplateId: "",      // template used by default when composing
    followUpDays: 4,            // a buyer stuck on 'awaiting reply' longer than this needs follow-up
    alertPct: 2                 // flag a metal on the dashboard when it moves more than this %
  };

  // LME prices are entered manually (or via the optional live adapter).
  // Values in USD per metric tonne. Aluminium premium in USD/MT (EU duty paid).
  var DEFAULT_PRICES = {
    currency: "USD",
    unit: "per MT",
    updatedAt: null,
    source: "Manual entry",
    delayed: false,
    premiums: {},
    fx: null,                   // EUR/USD rate (USD per 1 EUR) for the currency toggle
    rows: {
      copper:    { value: null, prev: null, premium: null },
      aluminium: { value: null, prev: null, premium: null },
      zinc:      { value: null, prev: null },
      lead:      { value: null, prev: null },
      nickel:    { value: null, prev: null },
      gold:      { value: null, prev: null }
    }
  };

  function uid() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  App.uid = uid;

  /* ---- Clearly-labelled SAMPLE rows. Replace with real Apollo/CSV data. ---- */
  function sampleCompanies() {
    return [
      {
        id: uid(), name: "[SAMPLE] Rheinmetall Recycling GmbH", country: "DE",
        city: "Düsseldorf", website: "example.com",
        contactName: "Procurement Desk", email: "buyer@example.com", phone: "+49 000 000",
        materials: ["copper-cathode", "cu-scrap-millberry", "aluminium-ingots"],
        status: "red", lastEmailSubject: "", lastEmailAt: null, lastReplyAt: null,
        notes: "Sample row — replace with real verified contact."
      },
      {
        id: uid(), name: "[SAMPLE] Lombardia Metalli S.p.A.", country: "IT",
        city: "Milan", website: "example.com",
        contactName: "Purchasing", email: "acquisti@example.com", phone: "+39 000 000",
        materials: ["brass-scrap-honey", "zinc-ingot-hg", "lead-refined"],
        status: "yellow", lastEmailSubject: "Q3 supply — copper & brass", lastEmailAt: Date.now() - 86400000, lastReplyAt: null,
        notes: "Sample row — replace with real verified contact."
      },
      {
        id: uid(), name: "[SAMPLE] Iberia Nonferrous SL", country: "ES",
        city: "Bilbao", website: "example.com",
        contactName: "Trading", email: "trading@example.com", phone: "+34 000 000",
        materials: ["al-scrap-ubc", "al-sows", "ss-304"],
        status: "green", lastEmailSubject: "Aluminium sows availability", lastEmailAt: Date.now() - 172800000, lastReplyAt: Date.now() - 3600000,
        notes: "Sample row — replied, follow up."
      }
    ];
  }

  function freshState() {
    var companies = sampleCompanies();
    companies.forEach(function (c) { if (!Array.isArray(c.people)) c.people = []; });
    return {
      version: 1,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      prices: JSON.parse(JSON.stringify(DEFAULT_PRICES)),
      companies: companies,
      customCountries: [],
      sheet: []
    };
  }

  var state = null;

  // Backfill/repair a state object (after upgrades or a remote pull).
  function normalize(s) {
    s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
    s.prices = Object.assign({}, DEFAULT_PRICES, s.prices || {});
    s.prices.rows = Object.assign({}, DEFAULT_PRICES.rows, s.prices.rows || {});
    if (!Array.isArray(s.companies)) s.companies = [];
    s.companies.forEach(function (c) {
      if (!Array.isArray(c.people)) c.people = [];
      c.people.forEach(function (p) { if (!p.status) p.status = "red"; });
      if (!Array.isArray(c.activity)) c.activity = [];
    });
    if (!Array.isArray(s.settings.templates)) s.settings.templates = [];
    if (!s.settings.margins || typeof s.settings.margins !== "object") s.settings.margins = {};
    if (!Array.isArray(s.customCountries)) s.customCountries = [];
    if (!Array.isArray(s.sheet)) s.sheet = [];
    if (typeof s.rev !== "number") s.rev = 0;
    return s;
  }

  // Optional change hook (used by team sync to push after local edits).
  var changeHook = null, suppressHook = false;

  function load() {
    if (state) return state;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        state = normalize(JSON.parse(raw));
        return state;
      }
    } catch (e) {
      console.warn("Could not read saved state, starting fresh.", e);
    }
    state = freshState();
    save();
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Save failed (storage full or blocked).", e);
    }
    if (changeHook && !suppressHook) { try { changeHook(); } catch (e) {} }
  }

  var Store = {
    get: function () { return load(); },
    save: save,

    /* ---------- Companies ---------- */
    companies: function () { return load().companies; },
    companiesByCountry: function (code) {
      return load().companies.filter(function (c) { return c.country === code; });
    },
    companyById: function (id) {
      return load().companies.find(function (c) { return c.id === id; });
    },
    addCompany: function (data) {
      var c = Object.assign({
        id: uid(), name: "", country: "DE", city: "", website: "",
        contactName: "", email: "", phone: "", materials: [], people: [],
        status: "red", lastEmailSubject: "", lastEmailAt: null, lastReplyAt: null, notes: "", activity: []
      }, data || {});
      load().companies.push(c);
      save();
      return c;
    },
    updateCompany: function (id, patch) {
      var c = this.companyById(id);
      if (c) { Object.assign(c, patch); save(); }
      return c;
    },
    deleteCompany: function (id) {
      var s = load();
      s.companies = s.companies.filter(function (c) { return c.id !== id; });
      save();
    },
    setStatus: function (id, status, extra) {
      this.updateCompany(id, Object.assign({ status: status }, extra || {}));
    },

    // Append a dated entry to a buyer's activity timeline.
    logActivity: function (id, type, text) {
      var c = this.companyById(id);
      if (!c) return;
      if (!Array.isArray(c.activity)) c.activity = [];
      c.activity.unshift({ ts: Date.now(), type: type, text: text });
      c.activity = c.activity.slice(0, 50);
      save();
    },

    // Merge Apollo-discovered people into a company (dedupe by name/email).
    // If the company has no primary email yet, promote the first emailed person.
    addPeople: function (id, people) {
      var c = this.companyById(id);
      if (!c) return 0;
      if (!Array.isArray(c.people)) c.people = [];
      var added = 0;
      (people || []).forEach(function (p) {
        if (!p || (!p.name && !p.email)) return;
        var dup = c.people.some(function (x) {
          return (p.email && x.email && x.email.toLowerCase() === p.email.toLowerCase()) ||
                 (!p.email && x.name && p.name && x.name.toLowerCase() === p.name.toLowerCase());
        });
        if (dup) return;
        c.people.push({
          name: p.name || "", title: p.title || "", seniority: p.seniority || "",
          email: p.email || "", phone: p.phone || "", linkedin: p.linkedin || "",
          locked: !!p.locked,
          status: "red", lastEmailAt: null, lastReplyAt: null
        });
        added++;
      });
      if (!c.contactName && c.people.length) {
        var primary = c.people.find(function (x) { return x.email; }) || c.people[0];
        c.contactName = primary.name;
        if (!c.email && primary.email) c.email = primary.email;
        if (!c.phone && primary.phone) c.phone = primary.phone;
      }
      save();
      return added;
    },
    removePerson: function (id, index) {
      var c = this.companyById(id);
      if (c && c.people) { c.people.splice(index, 1); rollupCompany(c); save(); }
    },

    // Set a single contact's traffic-light status, then roll the company up.
    setPersonStatus: function (id, index, status, extra) {
      var c = this.companyById(id);
      if (!c || !c.people || !c.people[index]) return;
      Object.assign(c.people[index], { status: status }, extra || {});
      rollupCompany(c);
      save();
    },

    // Merge a {nameLower: phone} map (from the async webhook) into a company's people.
    mergePhones: function (id, phoneMap) {
      var c = this.companyById(id);
      if (!c || !c.people || !phoneMap) return 0;
      var n = 0;
      c.people.forEach(function (p) {
        var key = (p.name || "").toLowerCase();
        if (!p.phone && phoneMap[key]) { p.phone = phoneMap[key]; n++; }
      });
      if (n) {
        if (!c.phone && c.people[0] && c.people[0].phone) c.phone = c.people[0].phone;
        save();
      }
      return n;
    },

    /* ---------- Settings ---------- */
    settings: function () { return load().settings; },
    updateSettings: function (patch) {
      Object.assign(load().settings, patch); save();
    },

    /* ---------- Prices ---------- */
    prices: function () { return load().prices; },
    updatePrices: function (patch) {
      Object.assign(load().prices, patch);
      load().prices.updatedAt = Date.now();
      save();
    },
    setPriceRow: function (key, partial) {
      var p = load().prices;
      var cur = p.rows[key] || {};
      if (partial && partial.value != null && cur.value != null && Number(partial.value) !== Number(cur.value)) {
        partial = Object.assign({ prev: cur.value }, partial);
      }
      p.rows[key] = Object.assign({}, cur, partial);
      p.updatedAt = Date.now();
      save();
    },

    // Apply a normalized feed result from the proxy /api/prices endpoint.
    applyPriceFeed: function (d) {
      if (!d) return;
      var p = load().prices;
      ["copper", "aluminium", "zinc", "lead", "nickel", "gold"].forEach(function (k) {
        if (d[k] != null && !isNaN(d[k])) {
          var old = p.rows[k] && p.rows[k].value;
          var prev = (d.prevs && d.prevs[k] != null && !isNaN(d.prevs[k]))
            ? Number(d.prevs[k])                                   // daily close from the feed
            : (old != null ? old : (p.rows[k] && p.rows[k].prev)); // else roll the last value
          // sparkline series: prefer the feed's history, else append to a rolling buffer
          var series;
          if (d.series && Array.isArray(d.series[k]) && d.series[k].length) {
            series = d.series[k].slice(-40);
          } else {
            series = ((p.rows[k] && p.rows[k].series) || []).slice();
            series.push(Number(d[k]));
            series = series.slice(-40);
          }
          p.rows[k] = Object.assign({}, p.rows[k], { prev: prev, value: Number(d[k]), series: series });
        }
      });
      // premiums: aluminium (duty-paid EU) and copper (CIF-EU equivalent)
      if (d.premium != null && !isNaN(d.premium)) p.rows.aluminium = Object.assign({}, p.rows.aluminium, { premium: Number(d.premium) });
      var prem = d.premiums || {};
      if (prem.aluminium != null) p.rows.aluminium = Object.assign({}, p.rows.aluminium, { premium: Number(prem.aluminium) });
      if (prem.copper != null) p.rows.copper = Object.assign({}, p.rows.copper, { premium: Number(prem.copper) });
      p.premiums = prem;
      if (d.fx != null && !isNaN(d.fx)) p.fx = Number(d.fx);
      if (d.currency) p.currency = d.currency;
      p.delayed = !!d.delayed;
      p.source = d.source || "Live feed";
      p.updatedAt = Date.now();
      save();
    },

    /* ---------- Import / Export ---------- */
    exportJSON: function () {
      return JSON.stringify(load(), null, 2);
    },
    importJSON: function (text) {
      var obj = JSON.parse(text);
      if (!obj || !Array.isArray(obj.companies)) throw new Error("Invalid backup file.");
      state = Object.assign(freshState(), obj);
      save();
    },
    // Load the bundled EU starter list (research leads), skipping any
    // company that already exists (matched by name + country).
    importSeed: function (seed) {
      var existing = load().companies;
      var added = 0;
      (seed || []).forEach(function (s) {
        var dup = existing.some(function (c) {
          return (c.name || "").toLowerCase() === (s.name || "").toLowerCase() && c.country === s.country;
        });
        if (dup) return;
        Store.addCompany({
          name: s.name, country: s.country, city: s.city || "", website: s.website || "",
          email: s.email || "", materials: (s.materials || []).slice(), notes: s.notes || ""
        });
        added++;
      });
      return added;
    },

    // Bulk add companies from parsed CSV rows (objects keyed by header).
    importCompanyRows: function (rows) {
      var added = 0;
      rows.forEach(function (r) {
        if (!r.name && !r.email) return;
        Store.addCompany({
          name: r.name || "",
          country: (r.country || "").toUpperCase().slice(0, 2) || "DE",
          city: r.city || "",
          website: r.website || "",
          contactName: r.contact || r.contactname || r.contact_name || "",
          email: r.email || "",
          phone: r.phone || "",
          materials: parseMaterials(r.materials),
          notes: r.notes || ""
        });
        added++;
      });
      return added;
    },
    resetAll: function () {
      state = freshState();
      save();
    },

    /* ---------- Custom countries ---------- */
    customCountries: function () { var s = load(); if (!s.customCountries) s.customCountries = []; return s.customCountries; },
    addCustomCountry: function (name, flag) {
      var s = load(); if (!s.customCountries) s.customCountries = [];
      var code = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
      var c = { code: code, name: (name || "New country").trim(), flag: (flag || "🌍").trim() || "🌍", custom: true };
      s.customCountries.push(c); save(); return c;
    },
    removeCustomCountry: function (code) {
      var s = load();
      s.customCountries = (s.customCountries || []).filter(function (c) { return c.code !== code; });
      s.companies = s.companies.filter(function (c) { return c.country !== code; });
      save();
    },

    /* ---------- Custom sheet ---------- */
    sheetRows: function () { var s = load(); if (!s.sheet) s.sheet = []; return s.sheet; },
    addSheetRow: function (data) {
      var s = load(); if (!s.sheet) s.sheet = [];
      var r = Object.assign({ id: uid(), product: "", country: "", material: "", qty: "", notes: "" }, data || {});
      s.sheet.push(r); save(); return r;
    },
    updateSheetRow: function (id, patch) {
      var r = (load().sheet || []).find(function (x) { return x.id === id; });
      if (r) { Object.assign(r, patch); save(); }
    },
    deleteSheetRow: function (id) {
      var s = load(); s.sheet = (s.sheet || []).filter(function (x) { return x.id !== id; }); save();
    },

    /* ---------- Team sync hooks ---------- */
    setChangeHook: function (fn) { changeHook = fn; },
    rev: function () { return load().rev || 0; },
    // Replace local state with a teammate's pulled state (no push echo).
    applyRemote: function (payload) {
      if (!payload || !payload.state || !Array.isArray(payload.state.companies)) return false;
      suppressHook = true;
      state = normalize(payload.state);
      if (typeof payload.rev === "number") state.rev = payload.rev;
      save();
      suppressHook = false;
      return true;
    },
    // Bump the revision before a push so the server can order writes.
    bumpRev: function () { var s = load(); s.rev = (s.rev || 0) + 1; suppressHook = true; save(); suppressHook = false; return s.rev; }
  };

  // Company status = the "best" of its contacts (green > yellow > red).
  // Only rolls up when there are people; carries lastReplyAt/lastEmailAt across.
  var STATUS_RANK = { red: 0, yellow: 1, green: 2 };
  function rollupCompany(c) {
    if (!c.people || !c.people.length) return;
    var best = "red", bestRank = -1, replyAt = c.lastReplyAt, emailAt = c.lastEmailAt;
    c.people.forEach(function (p) {
      var rank = STATUS_RANK[p.status] || 0;
      if (rank > bestRank) { bestRank = rank; best = p.status; }
      if (p.lastReplyAt && (!replyAt || p.lastReplyAt > replyAt)) replyAt = p.lastReplyAt;
      if (p.lastEmailAt && (!emailAt || p.lastEmailAt > emailAt)) emailAt = p.lastEmailAt;
    });
    c.status = best;
    c.lastReplyAt = replyAt || c.lastReplyAt;
    c.lastEmailAt = emailAt || c.lastEmailAt;
  }
  App.rollupCompany = rollupCompany;

  // materials column can be "copper-cathode;al-sows" or "Copper cathode, Aluminium sows"
  function parseMaterials(val) {
    if (!val) return [];
    return String(val).split(/[;,|]/).map(function (token) {
      token = token.trim();
      if (!token) return null;
      var byId = App.productById(token);
      if (byId) return byId.id;
      var lower = token.toLowerCase();
      var match = App.PRODUCTS.find(function (p) {
        return p.name.toLowerCase().indexOf(lower) !== -1 || lower.indexOf(p.name.toLowerCase()) !== -1;
      });
      return match ? match.id : null;
    }).filter(Boolean);
  }

  App.Store = Store;

})(window.App);
