/* ============================================================
   gmail.js  —  front-end client for Gmail auto-status sync
   ------------------------------------------------------------
   Talks to the same local proxy as Apollo. The proxy holds the
   Google OAuth tokens (read-only Gmail scope); the browser never
   sees them. Used to auto-update traffic-light status:
     reply from buyer -> green ;  you contacted them -> yellow.
   ============================================================ */
window.App = window.App || {};

(function (App) {
  "use strict";

  var Gmail = {
    base: function () {
      var u = (App.Store.settings().apolloProxyUrl || "").trim().replace(/\/+$/, "");
      return u || "http://localhost:8787";
    },

    status: function () {
      return fetch(this.base() + "/api/gmail/status")
        .then(function (r) { return r.json(); })
        .catch(function () { return { configured: false, connected: false, unreachable: true }; });
    },

    connectUrl: function () { return this.base() + "/api/gmail/auth"; },

    /* Ask the proxy which of these emails have replied / been contacted. */
    check: function (emails) {
      return fetch(this.base() + "/api/gmail/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: emails })
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || ("Proxy responded " + r.status));
          return j.results || {};
        });
      }).catch(function (err) {
        if (err instanceof TypeError) {
          throw new Error("Can't reach the proxy at " + Gmail.base() + ". Start it first (see README).");
        }
        throw err;
      });
    }
  };

  App.Gmail = Gmail;

})(window.App);
