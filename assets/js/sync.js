/* ============================================================
   sync.js  —  optional team sync (shared data via the proxy)
   ------------------------------------------------------------
   When "Team sync" is enabled in Settings, the app pulls the
   shared state from the proxy's /api/data on load and pushes
   local changes back (debounced). Last-write-wins — best for a
   small desk; teammates click "Pull" to grab the latest.
   ============================================================ */
window.App = window.App || {};

(function (App) {
  "use strict";

  var pushTimer = null;

  var Sync = {
    enabled: function () { return !!App.Store.settings().teamSync; },

    url: function () {
      var s = App.Store.settings();
      var base = (s.syncServerUrl || s.apolloProxyUrl || "http://localhost:8787").trim().replace(/\/+$/, "");
      return base + "/api/data";
    },

    headers: function () {
      var h = { "Content-Type": "application/json" };
      var t = App.Store.settings().syncToken;
      if (t) h["X-Data-Token"] = t;
      return h;
    },

    pull: function () {
      return fetch(this.url(), { headers: this.headers() }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || ("Sync server " + r.status));
          return j; // { state, rev, updatedAt }
        });
      });
    },

    push: function () {
      var payload = { state: App.Store.get() };
      return fetch(this.url(), { method: "PUT", headers: this.headers(), body: JSON.stringify(payload) })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) throw new Error(j.error || ("Sync server " + r.status));
            return j; // { rev, updatedAt }
          });
        });
    },

    // Debounced auto-push, wired as the Store change hook.
    schedulePush: function () {
      if (!Sync.enabled()) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function () {
        Sync.push().catch(function (e) { console.warn("[sync] push failed:", e.message); });
      }, 1500);
    },

    // Called once at boot: pull shared state, then listen for local edits.
    init: function (onPulled) {
      App.Store.setChangeHook(Sync.schedulePush);
      if (!Sync.enabled()) return;
      Sync.pull().then(function (j) {
        if (j && j.state && App.Store.applyRemote(j) && onPulled) onPulled();
      }).catch(function (e) { console.warn("[sync] initial pull failed:", e.message); });
    }
  };

  App.Sync = Sync;

})(window.App);
