/* ============================================================
   prices.js  —  formatting, derived values, optional live feed
   ============================================================ */
window.App = window.App || {};

(function (App) {
  "use strict";

  var Prices = {
    fmt: function (v) {
      if (v === null || v === undefined || v === "" || isNaN(v)) return "—";
      return Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
    },

    // Convert a stored USD value to the chosen display currency.
    toDisplay: function (usd) {
      if (usd == null || isNaN(usd)) return null;
      var s = App.Store.settings();
      var fx = App.Store.prices().fx;
      if (s.displayCurrency === "EUR" && fx) return Number(usd) / Number(fx);
      return Number(usd);
    },
    currencySymbol: function () {
      return App.Store.settings().displayCurrency === "EUR" ? "€" : "$";
    },
    // Formatted money in the display currency, e.g. "€8,540".
    money: function (usd) {
      var v = this.toDisplay(usd);
      if (v == null) return "—";
      return this.currencySymbol() + this.fmt(v);
    },

    // The all-in aluminium price your buyers actually pay in the EU = LME + premium.
    aluminiumAllIn: function (prices) {
      var row = prices.rows.aluminium || {};
      if (row.value == null) return null;
      return Number(row.value) + Number(row.premium || 0);
    },

    // Rough indicative brass value (no LME contract): ~60% Cu + ~37% Zn.
    // Purely a helper for your quoting — clearly indicative, not a quote.
    brassIndicative: function (prices) {
      var cu = prices.rows.copper && prices.rows.copper.value;
      var zn = prices.rows.zinc && prices.rows.zinc.value;
      if (cu == null || zn == null) return null;
      return Math.round(cu * 0.60 + zn * 0.37);
    },

    // % change of a row vs its previous value (for the ticker arrows/colors).
    changePct: function (row) {
      if (!row || row.value == null || row.prev == null || Number(row.prev) === 0) return null;
      return (Number(row.value) - Number(row.prev)) / Number(row.prev) * 100;
    },

    // Tiny inline SVG sparkline from a series of numbers.
    sparkline: function (series, color) {
      if (!series || series.length < 2) return "";
      var w = 74, h = 22, n = series.length;
      var min = Math.min.apply(null, series), max = Math.max.apply(null, series);
      var range = (max - min) || 1;
      var pts = series.map(function (v, i) {
        var x = (i / (n - 1)) * w;
        var y = h - ((v - min) / range) * (h - 3) - 1.5;
        return x.toFixed(1) + "," + y.toFixed(1);
      }).join(" ");
      var c = color || (series[n - 1] >= series[0] ? "#46d07f" : "#ef5a5a");
      return '<svg class="tk-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h +
        '" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="' + c +
        '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    },

    ageText: function (ts) {
      if (!ts) return "never updated";
      var mins = Math.round((Date.now() - ts) / 60000);
      if (mins < 1) return "updated just now";
      if (mins < 60) return "updated " + mins + " min ago";
      var hrs = Math.round(mins / 60);
      if (hrs < 24) return "updated " + hrs + "h ago";
      var days = Math.round(hrs / 24);
      return "updated " + days + "d ago";
    },

    /* ------------------------------------------------------------
       Live feed. The source is chosen in Settings → Live prices:
         • "metalsapi" — fetch directly from Metals-API in the browser
                         (works on the hosted site; needs a free key)
         • "custom"    — any CORS-enabled URL returning normalized JSON
         • "proxy"     — the local Node proxy's /api/prices (needs it running)
       window.App.PRICE_FEED_URL still overrides everything.
       ------------------------------------------------------------ */
    source: function () {
      return (App.Store.settings().priceSource || "free");
    },

    feedUrl: function () {
      if (App.PRICE_FEED_URL) return App.PRICE_FEED_URL;
      var base = (App.Store.settings().apolloProxyUrl || "http://localhost:8787").replace(/\/+$/, "");
      return base + "/api/prices";
    },

    // Calibrate a raw provider rate to USD/tonne (provider units vary).
    calibrate: function (raw) {
      var s = App.Store.settings();
      if (raw == null || isNaN(raw)) return null;
      var v = Number(raw);
      if (s.priceInvert !== false && v !== 0) v = 1 / v;   // metals-api returns base/symbol
      var unitMult = s.priceUnit === "lb" ? 2204.62 : (s.priceUnit === "oz" ? 32150.7 : 1);
      v = v * unitMult * (Number(s.priceMult) || 1);
      return Math.round(v);
    },

    fetchLive: function (force) {
      var src = App.PRICE_FEED_URL ? "proxy" : this.source();
      if (src === "manual") return Promise.reject(new Error("Live prices are set to Manual (Settings → Live prices)."));
      if (src === "free") return this.fetchFreeNoKey();
      if (src === "metalsapi") return this.fetchMetalsApiDirect();
      if (src === "custom") return this.fetchCustomDirect();
      return this.fetchProxy(force);
    },

    /* Free, NO API KEY: pulls Gold/Copper/Aluminium from Yahoo Finance via a
       public CORS relay (works on the hosted site). LME Zinc/Lead/Nickel and
       premiums aren't on any reliable free source — leave those manual. */
    fetchFreeNoKey: function () {
      var Y = "https://query1.finance.yahoo.com/v8/finance/chart/";
      var relays = [
        function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
        function (u) { return "https://corsproxy.io/?url=" + encodeURIComponent(u); }
      ];
      var defs = [
        { k: "gold", sym: "GC=F", mult: 1 },         // USD / troy oz
        { k: "copper", sym: "HG=F", mult: 2204.62 }, // COMEX USD/lb -> USD/MT
        { k: "aluminium", sym: "ALI=F", mult: 1 },   // USD / MT
        { k: "fx", sym: "EURUSD=X", mult: 1, fx: true } // USD per 1 EUR
      ];
      function getJson(url) {
        var i = 0;
        function attempt() {
          return fetch(relays[i](url)).then(function (r) {
            if (!r.ok) throw new Error("relay " + r.status);
            return r.json();
          }).catch(function (e) { i++; if (i < relays.length) return attempt(); throw e; });
        }
        return attempt();
      }
      var out = { currency: "USD", source: "Free web feed (Yahoo Finance, delayed)", asOf: Date.now(), delayed: true, prevs: {}, series: {} };
      return Promise.all(defs.map(function (d) {
        var url = Y + d.sym + "?interval=1d&range=5d";
        return getJson(url).then(function (j) {
          var res = j && j.chart && j.chart.result && j.chart.result[0];
          var meta = res && res.meta;
          if (!meta || meta.regularMarketPrice == null) return;
          if (d.fx) { out.fx = Number(meta.regularMarketPrice); return; }
          out[d.k] = Math.round(meta.regularMarketPrice * d.mult);
          var pc = meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose;
          if (pc != null) out.prevs[d.k] = Math.round(pc * d.mult);
          var q = res && res.indicators && res.indicators.quote && res.indicators.quote[0];
          if (q && Array.isArray(q.close)) {
            var s = q.close.filter(function (x) { return x != null && !isNaN(x); }).map(function (x) { return Math.round(x * d.mult); });
            if (s.length) out.series[d.k] = s.slice(-40);
          }
        }).catch(function () { /* skip this symbol */ });
      })).then(function () {
        if (out.gold == null && out.copper == null && out.aluminium == null) {
          throw new Error("Free web feed is busy right now — tap ↻ Refresh again, or enter prices manually.");
        }
        return out;
      });
    },

    fetchProxy: function (force) {
      var url = this.feedUrl() + (force ? "?force=1" : "");
      return fetch(url).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || ("Price feed responded " + r.status));
          return j;
        });
      }).catch(function (err) {
        if (err instanceof TypeError) {
          throw new Error("Can't reach the price proxy at " + Prices.feedUrl() + ". Is it running? (Or switch the price source to Metals-API in Settings.)");
        }
        throw err;
      });
    },

    // Direct browser call to Metals-API (CORS-enabled). Key lives in Settings.
    fetchMetalsApiDirect: function () {
      var s = App.Store.settings();
      if (!s.priceApiKey) {
        return Promise.reject(new Error("Add your Metals-API key in Settings → Live prices (free at metals-api.com)."));
      }
      var map = { copper: "LME-XCU", aluminium: "LME-ALU", zinc: "LME-ZNC", lead: "LME-LEAD", nickel: "LME-NI" };
      var syms = Object.keys(map).map(function (k) { return map[k]; }).join(",") + ",XAU";
      var url = "https://metals-api.com/api/latest?access_key=" + encodeURIComponent(s.priceApiKey) +
                "&base=USD&symbols=" + encodeURIComponent(syms);
      return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.success === false) {
          throw new Error((j && j.error && (j.error.info || j.error.message)) || "Metals-API error (check your key/quota).");
        }
        var rates = j.rates || {};
        var out = { currency: "USD", source: "Metals-API (LME, delayed)", asOf: Date.now(), delayed: true };
        Object.keys(map).forEach(function (metal) {
          var raw = rates[map[metal]];
          if (raw == null) raw = rates["USD" + map[metal]];
          out[metal] = Prices.calibrate(raw);
        });
        // Gold is quoted per troy ounce — no tonne/lb conversion.
        var graw = rates["XAU"]; if (graw == null) graw = rates["USDXAU"];
        if (graw != null && !isNaN(graw)) out.gold = Math.round((Number(graw) < 1 ? 1 / graw : Number(graw)));
        if (out.copper == null && out.aluminium == null) {
          throw new Error("Metals-API returned no LME prices — your plan may not include LME symbols.");
        }
        return out;
      }).catch(function (err) {
        if (err instanceof TypeError) throw new Error("Couldn't reach Metals-API (network/CORS). Check your connection.");
        throw err;
      });
    },

    fetchCustomDirect: function () {
      var s = App.Store.settings();
      if (!s.priceCustomUrl) return Promise.reject(new Error("Set a Custom price URL in Settings → Live prices."));
      return fetch(s.priceCustomUrl).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || ("Custom feed responded " + r.status));
          j.asOf = j.asOf || Date.now();
          j.source = j.source || "Custom feed";
          return j;
        });
      }).catch(function (err) {
        if (err instanceof TypeError) throw new Error("Couldn't reach the custom price URL (network/CORS).");
        throw err;
      });
    }
  };

  App.Prices = Prices;

})(window.App);
