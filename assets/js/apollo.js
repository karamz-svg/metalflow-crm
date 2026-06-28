/* ============================================================
   apollo.js  —  front-end client for the local Apollo proxy
   ------------------------------------------------------------
   The browser NEVER sees your Apollo key. It only talks to your
   proxy (apolloProxyUrl in Settings), which holds the key and
   calls Apollo server-side. See server/apollo-proxy.js.
   ============================================================ */
window.App = window.App || {};

(function (App) {
  "use strict";

  var Apollo = {
    proxyUrl: function () {
      var u = (App.Store.settings().apolloProxyUrl || "").trim().replace(/\/+$/, "");
      return u || "http://localhost:8787";
    },

    health: function () {
      return fetch(this.proxyUrl() + "/health").then(function (r) { return r.json(); });
    },

    /* Find procurement/buyer/trader contacts at one company. */
    findBuyers: function (company) {
      var settings = App.Store.settings();
      var payload = {
        name: company.name || "",
        domain: company.website || "",
        titles: App.BUYER_TITLES,
        perPage: 10,
        reveal: !!settings.revealContacts,
        revealPhone: !!settings.revealContacts && !!settings.revealPhone
      };
      return fetch(this.proxyUrl() + "/api/find-buyers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || ("Proxy responded " + r.status));
          return j;
        });
      }).catch(function (err) {
        // Network/refused usually means the proxy isn't running.
        if (err instanceof TypeError) {
          throw new Error("Can't reach the Apollo proxy at " + Apollo.proxyUrl() +
            ". Start it: node server/apollo-proxy.js (see README).");
        }
        throw err;
      });
    },

    /* Poll for phone numbers that arrived asynchronously via the Apollo webhook. */
    getPhones: function (company) {
      var domain = (company.website || "").trim();
      return fetch(this.proxyUrl() + "/api/phones?domain=" + encodeURIComponent(domain))
        .then(function (r) { return r.json(); })
        .then(function (j) { return j.phones || {}; })
        .catch(function () { return {}; });
    },

    /* Discover real companies for a country via Apollo org search. */
    findCompanies: function (countryName, page) {
      var payload = { country: countryName, perPage: 25, page: page || 1 };
      return fetch(this.proxyUrl() + "/api/find-companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || ("Proxy responded " + r.status));
          return j;
        });
      }).catch(function (err) {
        if (err instanceof TypeError) {
          throw new Error("Can't reach the Apollo proxy at " + Apollo.proxyUrl() + ". Start it (see README).");
        }
        throw err;
      });
    }
  };

  App.Apollo = Apollo;

})(window.App);
