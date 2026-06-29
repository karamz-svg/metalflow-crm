/* ============================================================
   app.js  —  views, routing, interactivity (vanilla, no deps)
   ============================================================ */
window.App = window.App || {};

(function (App) {
  "use strict";

  var Store = App.Store, Prices = App.Prices, Email = App.Email;

  /* in-memory view state */
  var route = { view: "dashboard", country: null };
  var query = "";
  var filterStatus = "";   // "", red, yellow, green
  var filterMetal = "";    // "", or a product metal key
  var globalQ = "";        // global search query
  var calOffset = 0;       // calendar month offset from current

  /* ---------- tiny helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function $(id) { return document.getElementById(id); }
  function metal(id) { return App.METALS[id] || { label: id, color: "#888" }; }
  function opt(value, label, current) {
    return '<option value="' + esc(value) + '"' + (current === value ? " selected" : "") + ">" + esc(label) + "</option>";
  }
  function waUrl(phone) {
    var digits = String(phone || "").replace(/[^\d]/g, "");
    return digits ? "https://wa.me/" + digits : "";
  }
  App.waUrl = waUrl;
  function snapInfo() {
    var b = Store.lastSnapshot();
    return (b && b.ts) ? "Last local snapshot: " + new Date(b.ts).toLocaleString() : "No local snapshot yet.";
  }
  App.onRestoreFile = function (input) {
    var f = input.files && input.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try { App.Store.importJSON(String(r.result)); render(); toast("Backup restored."); }
      catch (e) { toast("Restore failed: " + e.message); }
    };
    r.readAsText(f);
  };

  function toast(msg) {
    var root = $("toast-root");
    root.innerHTML = '<div class="toast">' + esc(msg) + "</div>";
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { root.innerHTML = ""; }, 2600);
  }
  App.toast = toast;

  /* =========================================================
     PRICE BAR
     ========================================================= */
  function renderPriceBar() {
    var p = Store.prices();
    var ccy = Store.settings().displayCurrency || "USD";
    var dateStr = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

    function changeHtml(row) {
      var pct = Prices.changePct(row);
      if (pct == null) return "";
      var cls = pct > 0 ? "up" : (pct < 0 ? "down" : "flat");
      var sign = pct > 0 ? "+" : "";
      return ' <span class="tk-chg ' + cls + '">' + sign + pct.toFixed(2) + "%</span>";
    }

    var cards = App.TICKER.map(function (t) {
      var row = p.rows[t.key] || {};
      var val, sub, chg = "", spark = "";
      if (t.kind === "premium") {
        val = row.premium;
        sub = esc(t.unit);
      } else {
        val = row.value;
        chg = changeHtml(row);
        sub = ccy + " " + esc(t.unit) + " · " + esc(dateStr);
        var pct = Prices.changePct(row);
        spark = Prices.sparkline(row.series, pct == null ? null : (pct >= 0 ? "#46d07f" : "#ef5a5a"));
      }
      return '<div class="tk">' +
        '<div class="tk-label">' + esc(t.label) + "</div>" +
        '<div class="tk-price">' + Prices.money(val) + chg + "</div>" +
        '<div class="tk-foot">' + (spark || '<span class="tk-spark-empty"></span>') + '<span class="tk-sub">' + sub + "</span></div>" +
      "</div>";
    }).join("");

    var live = Store.settings().priceLiveSeconds > 0 ? '<span class="tk-live">● LIVE</span>' : "";
    var delayed = p.delayed ? "delayed/indicative" : "manual";
    var rates = p.fxRates || {};
    var noFx = (ccy !== "USD" && !rates[ccy] && !(ccy === "EUR" && p.fx));
    var symMap = { USD: "$ USD", EUR: "€ EUR", GBP: "£ GBP", CNY: "¥ CNY" };
    var ccyToggle = '<button class="btn sm" data-action="toggle-currency" title="Cycle USD / EUR / GBP / CNY">' +
      (symMap[ccy] || "$ USD") + (noFx ? " ⚠️" : "") + "</button>";
    var warn = App.priceMsg
      ? '<span class="price-warn" data-nav="settings" title="Open price settings">⚠️ ' + esc(App.priceMsg) + "</span>"
      : (!p.updatedAt ? '<span class="price-warn" data-nav="settings">⚠️ set up live prices</span>' : "");

    var tscale = Number(Store.settings().tickerScale);
    if (!tscale || isNaN(tscale)) tscale = 1;
    var sizer = '<span class="tk-sizer" title="Drag to resize the price bar">' +
      '<span class="tk-sizer-ico">⇕</span>' +
      '<input type="range" min="0.6" max="1.6" step="0.02" value="' + tscale + '" oninput="App.onTickerScale(this.value)" aria-label="Resize price bar"/></span>';

    $("pricebar").innerHTML =
      '<div class="ticker" style="--tk-scale:' + tscale + '">' + cards + "</div>" +
      '<div class="pb-meta">' + live +
        "<span>" + esc(p.source) + " · " + esc(delayed) + "</span>" + warn + sizer + ccyToggle +
        '<button class="btn sm" data-action="refresh-prices">↻ Refresh</button>' +
        '<button class="btn sm primary" data-action="edit-prices">Edit</button>' +
      "</div>";
  }
  // Live-resize the price bar from the drag slider; persist (debounced) without re-rendering.
  App.onTickerScale = function (v) {
    var t = document.querySelector(".ticker");
    if (t) t.style.setProperty("--tk-scale", v);
    clearTimeout(App._tkSaveTimer);
    App._tkSaveTimer = setTimeout(function () { Store.updateSettings({ tickerScale: Number(v) }); }, 350);
  };

  /* =========================================================
     SIDEBAR NAV
     ========================================================= */
  function renderNav() {
    var companies = Store.companies();
    function item(view, country, icon, label, count) {
      var active = (route.view === view && route.country === country) ? " active" : "";
      var attr = country ? 'data-nav="country:' + country + '"' : 'data-nav="' + view + '"';
      var c = count != null ? '<span class="count">' + count + "</span>" : "";
      return '<div class="nav-item' + active + '" ' + attr + '>' +
        "<span>" + icon + "</span><span>" + esc(label) + "</span>" + c + "</div>";
    }

    var top =
      item("dashboard", null, "📊", "Dashboard") +
      item("companies", null, "🏢", "All buyers", companies.length) +
      item("pipeline", null, "📈", "Pipeline", Store.deals().length || null) +
      item("shipments", null, "🚢", "Shipments") +
      item("markets", null, "💹", "Markets") +
      item("reports", null, "📊", "Reports") +
      item("contracts", null, "📜", "Contracts", Store.contracts().length || null) +
      item("invoices", null, "🧾", "Invoices", Store.invoices().length || null) +
      item("risk", null, "⚖️", "Risk / positions") +
      item("compliance", null, "🛡️", "Compliance") +
      item("calendar", null, "🗓️", "Calendar") +
      item("tasks", null, "✅", "Tasks", (Store.tasks().filter(function (t) { return !t.done; }).length) || null) +
      item("sheet", null, "📂", "Custom sheet", Store.sheetCategories().length || null) +
      item("calc", null, "🧮", "Calculator") +
      item("products", null, "🪙", "Products", App.allProducts().length) +
      item("settings", null, "⚙️", "Settings");

    var search = '<div class="nav-search"><input placeholder="🔎 Search everything…" value="' + esc(globalQ) +
      '" oninput="App.onGlobalSearch(this.value)"/></div>';

    function countWith(code) { return companies.filter(function (x) { return x.country === code; }).length; }

    // Show all 27 EU member states (even with no buyers yet).
    var euItems = App.COUNTRIES.map(function (c) { return item("country", c.code, c.flag, c.name, countWith(c.code)); }).join("");
    var euSection = '<div class="nav-section"><div class="label">EU Countries (27)</div>' + euItems + "</div>";

    // My countries: always show every custom country the user added.
    var custom = Store.customCountries();
    var customItems = custom.map(function (c) { return item("country", c.code, c.flag, c.name, countWith(c.code)); }).join("");
    var mySection = '<div class="nav-section"><div class="label">My countries</div>' + customItems +
      '<div class="nav-item" data-action="add-country"><span>＋</span><span>Add country</span></div></div>';

    $("nav").innerHTML =
      search +
      '<div class="nav-section">' + top + "</div>" +
      euSection + mySection +
      '<div class="nav-version" title="Live build version">' + esc(App.VERSION || "") + "</div>";
  }

  /* =========================================================
     VIEWS
     ========================================================= */
  function render() {
    renderPriceBar();
    renderNav();
    var c = $("content");
    if (route.view === "dashboard") c.innerHTML = viewDashboard();
    else if (route.view === "products") c.innerHTML = viewProducts();
    else if (route.view === "sheet") c.innerHTML = viewSheet();
    else if (route.view === "pipeline") c.innerHTML = viewPipeline();
    else if (route.view === "shipments") c.innerHTML = viewShipments();
    else if (route.view === "markets") c.innerHTML = viewMarkets();
    else if (route.view === "reports") c.innerHTML = viewReports();
    else if (route.view === "contracts") c.innerHTML = viewContracts();
    else if (route.view === "invoices") c.innerHTML = viewInvoices();
    else if (route.view === "risk") c.innerHTML = viewRisk();
    else if (route.view === "compliance") c.innerHTML = viewCompliance();
    else if (route.view === "calendar") c.innerHTML = viewCalendar();
    else if (route.view === "search") c.innerHTML = viewSearch();
    else if (route.view === "tasks") c.innerHTML = viewTasks();
    else if (route.view === "calc") c.innerHTML = viewCalc();
    else if (route.view === "settings") c.innerHTML = viewSettings();
    else if (route.view === "companies") c.innerHTML = viewCompanies(null);
    else if (route.view === "country") c.innerHTML = viewCompanies(route.country);
    if (route.view === "settings") refreshGmailStatus();
    if (route.view === "calc" && App.calcProduct) App.calcProduct();
    var s = c.querySelector(".search");
    if (s) s.focus();
  }
  App.render = render;

  /* ---- Dashboard ---- */
  function buyersBuyingMetal(rowKey) {
    var metalKey = rowKey === "nickel" ? "stainless" : rowKey;
    return Store.companies().filter(function (c) {
      return (c.materials || []).some(function (id) { var p = App.productById(id); return p && p.metal === metalKey; });
    });
  }
  function viewDashboard() {
    var all = Store.companies();
    var red = all.filter(function (c) { return c.status === "red"; }).length;
    var yellow = all.filter(function (c) { return c.status === "yellow"; }).length;
    var green = all.filter(function (c) { return c.status === "green"; }).length;
    var withReply = all.filter(function (c) { return c.status === "green"; });

    var replyBanner = withReply.length
      ? '<div class="notice">📬 <strong>' + withReply.length + " buyer(s) replied</strong> — go read and follow up: " +
        withReply.map(function (c) { return esc(c.name); }).join(", ") + "</div>"
      : "";

    // All 27 EU countries plus any custom countries.
    var tileCountries = App.COUNTRIES.concat(Store.customCountries());
    var tiles = tileCountries.map(function (c) {
      var list = Store.companiesByCountry(c.code);
      var dots = ["red", "yellow", "green"].map(function (st) {
        var n = list.filter(function (x) { return x.status === st; }).length;
        return n ? '<span class="mini-dot" style="background:var(--' + st + ')" title="' + n + " " + st + '"></span>' : "";
      }).join("");
      return '<div class="tile" data-nav="country:' + c.code + '">' +
        '<span class="flag">' + c.flag + "</span>" +
        "<div><div class=\"tname\">" + esc(c.name) + "</div>" +
        '<div class="tsub">' + list.length + " buyer" + (list.length === 1 ? "" : "s") + "</div></div>" +
        '<span class="mini-lights">' + dots + "</span></div>";
    }).join("");

    var contacted = yellow + green;
    var total = all.length || 1;
    var contactRate = Math.round(contacted / total * 100);
    var replyRate = contacted ? Math.round(green / contacted * 100) : 0;

    // Follow-up reminders: stuck on 'awaiting reply' beyond the threshold.
    var followDays = Number(Store.settings().followUpDays) || 4;
    var now = Date.now();
    var followUps = all.filter(function (c) { return c.status === "yellow" && c.lastEmailAt && (now - c.lastEmailAt) > followDays * 86400000; });
    var followHtml = followUps.length
      ? '<div class="card" style="margin-bottom:16px;"><h3>⏰ Needs follow-up (' + followUps.length + ")</h3>" +
        '<div class="meta">No reply after ' + followDays + " days — give them a nudge.</div><div class=\"followups\">" +
        followUps.slice(0, 15).map(function (c) {
          var days = Math.floor((now - c.lastEmailAt) / 86400000);
          return '<div class="fu"><span class="fu-name" data-nav="country:' + c.country + '">' + esc(c.name) + "</span>" +
            '<span class="fu-days">' + days + "d</span>" +
            '<button class="btn sm primary" data-action="send-email" data-id="' + c.id + '">✉️ Follow up</button></div>';
        }).join("") + "</div></div>"
      : "";

    // Price-move alerts: metals that moved more than the alert threshold.
    var alertPct = Number(Store.settings().alertPct) || 2;
    var pr = Store.prices();
    var moves = [];
    ["copper", "aluminium", "zinc", "lead", "nickel"].forEach(function (mk) {
      var pct = Prices.changePct(pr.rows[mk]);
      if (pct != null && Math.abs(pct) >= alertPct) moves.push({ key: mk, pct: pct });
    });
    var alertHtml = moves.length
      ? '<div class="notice warn" style="margin-bottom:16px;">📈 <strong>Market moves</strong> — act on these: ' +
        moves.map(function (m) {
          var pm = m.key === "nickel" ? "stainless" : m.key;
          var n = buyersBuyingMetal(m.key).length;
          var arrow = m.pct >= 0 ? "▲" : "▼";
          var lbl = (App.METALS[m.key === "nickel" ? "stainless" : m.key] || {}).label || m.key;
          return '<span class="alert-chip" data-action="alert-filter" data-metal="' + pm + '">' +
            esc(lbl) + " " + arrow + Math.abs(m.pct).toFixed(1) + "% · " + n + " buyers</span>" +
            (n ? '<span class="alert-chip mail" data-action="email-metal" data-metal="' + pm + '" title="Open drafts for these buyers">✉️ email all</span>' : "");
        }).join(" ") + "</div>"
      : "";

    // Tasks due / overdue
    var openTasks = Store.tasks().filter(function (t) { return !t.done; });
    var dueTasks = openTasks.filter(function (t) { return t.due && new Date(t.due).getTime() < Date.now() + 86400000; });
    var tasksHtml = dueTasks.length
      ? '<div class="card" style="margin-bottom:16px;"><h3>✅ Tasks due (' + dueTasks.length + ")</h3>" +
        '<div class="followups">' + dueTasks.slice(0, 10).map(function (t) {
          var od = new Date(t.due).getTime() < Date.now() - 86400000;
          return '<div class="fu"><span class="fu-name" data-nav="tasks">' + esc(t.text || "(task)") + "</span>" +
            '<span class="fu-days"' + (od ? ' style="color:var(--red)"' : "") + ">" + esc(t.due) + "</span></div>";
        }).join("") + "</div></div>"
      : "";

    return '<div class="page-head"><div><h2>Sales Dashboard</h2>' +
      '<div class="sub">Track non-ferrous buyers across all 27 EU member states.</div></div>' +
      '<div class="spacer"></div>' +
      '<button class="btn" data-action="sync-gmail">📥 Sync Gmail</button>' +
      '<button class="btn primary" data-action="add-company">+ Add buyer</button></div>' +
      replyBanner + alertHtml + followHtml + tasksHtml +
      '<div class="stat-row">' +
        stat(all.length, "Total buyers") +
        statDot(red, "Not contacted", "red") +
        statDot(yellow, "Awaiting reply", "yellow") +
        statDot(green, "Replied", "green") +
        stat(contactRate + "%", "Contacted") +
        stat(replyRate + "%", "Reply rate") +
      "</div>" +
      '<h3 style="margin:6px 0 12px;">Coverage by country</h3>' +
      '<div class="tiles">' + tiles + "</div>";
  }
  function stat(n, l) { return '<div class="stat"><div class="n">' + n + '</div><div class="l">' + esc(l) + "</div></div>"; }
  function statDot(n, l, color) {
    return '<div class="stat"><div class="n" style="color:var(--' + color + ')">' + n + "</div>" +
      '<div class="l"><span class="dot" style="background:var(--' + color + ')"></span> ' + esc(l) + "</div></div>";
  }

  /* ---- Products (+ custom catalog editor) ---- */
  function viewProducts() {
    var groups = {};
    App.allProducts().forEach(function (p) { (groups[p.metal] = groups[p.metal] || []).push(p); });
    var html = Object.keys(groups).map(function (mk) {
      var m = metal(mk);
      var items = groups[mk].map(function (p) {
        return '<div class="tag"><span class="swatch" style="background:' + m.color + '"></span>' +
          esc(p.name) + ' <small style="color:var(--muted)">· ' + esc(p.type) + "</small>" +
          (p.custom ? ' <span class="del-prod" data-action="del-product" data-id="' + p.id + '" title="Remove">✕</span>' : "") + "</div>";
      }).join("");
      return '<div class="card"><h3><span class="dot" style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' +
        m.color + ';margin-right:7px;"></span>' + esc(m.label) + "</h3>" +
        '<div class="meta">' + groups[mk].length + " product(s) · priced off " +
        (m.lmeKey ? "LME " + esc(m.lmeKey) : "derived / index") + "</div>" +
        '<div class="tags">' + items + "</div></div>";
    }).join("");

    return '<div class="page-head"><div><h2>Your Products</h2>' +
      '<div class="sub">Non-ferrous catalog grouped by base metal &amp; pricing source. Add your own below.</div></div>' +
      '<div class="spacer"></div><button class="btn primary" data-action="add-product">+ Add product</button></div>' +
      '<div class="grid cards">' + html + "</div>";
  }

  /* ---- Custom sheet: your own categories (Limestone, Cement…) each with contacts ---- */
  function viewSheet() {
    var cats = Store.sheetCategories();
    function countryOpts(sel) {
      return '<option value="">—</option>' + App.allCountries().map(function (x) {
        return '<option value="' + x.code + '"' + (sel === x.code ? " selected" : "") + ">" + x.flag + " " + esc(x.name) + "</option>";
      }).join("");
    }
    function contactRow(catId, ct) {
      function inp(field, ph) {
        return '<input value="' + esc(ct[field]) + '" placeholder="' + ph + '" onchange="App.onSheetContact(\'' + catId + "','" + ct.id + "','" + field + '\',this.value)"/>';
      }
      return "<tr>" +
        "<td>" + inp("name", "contact") + "</td>" +
        "<td>" + inp("company", "company") + "</td>" +
        '<td><select onchange="App.onSheetContact(\'' + catId + "','" + ct.id + "','country',this.value)\">" + countryOpts(ct.country) + "</select></td>" +
        "<td>" + inp("email", "email") + "</td>" +
        "<td>" + inp("phone", "phone") + "</td>" +
        "<td>" + inp("notes", "notes") + "</td>" +
        "<td>" + (ct.email ? '<span class="person-mail" data-action="sheet-email" data-cat="' + catId + '" data-id="' + ct.id + '" title="Email">✉️</span> ' : "") +
          '<button class="btn sm danger" data-action="sheet-del-contact" data-cat="' + catId + '" data-id="' + ct.id + '">🗑</button></td>' +
        "</tr>";
    }
    var blocks = cats.length ? cats.map(function (cat) {
      var rows = (cat.contacts || []).map(function (ct) { return contactRow(cat.id, ct); }).join("");
      return '<div class="card sheet-cat">' +
        '<div class="sheet-cat-head">' +
          '<input class="cat-name" value="' + esc(cat.name) + '" onchange="App.onSheetCat(\'' + cat.id + '\',this.value)"/>' +
          '<span class="status-text">' + (cat.contacts || []).length + " contacts</span><div class=\"spacer\"></div>" +
          '<button class="btn sm" data-action="sheet-add-contact" data-cat="' + cat.id + '">+ Contact</button>' +
          '<button class="btn sm danger" data-action="sheet-del-cat" data-cat="' + cat.id + '">Delete category</button>' +
        "</div>" +
        ((cat.contacts || []).length
          ? '<table class="sheet"><thead><tr><th>Contact</th><th>Company</th><th>Country</th><th>Email</th><th>Phone</th><th>Notes</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>"
          : '<div class="status-text" style="padding:8px 4px">No contacts yet — click “+ Contact”.</div>') +
        "</div>";
    }).join("") : '<div class="empty"><div class="big">📂</div><p>No categories yet. Add one (e.g. <strong>Limestone</strong>, <strong>Cement</strong>) and list its buyers underneath.</p></div>';

    return '<div class="page-head"><div><h2>Custom Sheet</h2>' +
      '<div class="sub">Your own categories (Limestone, Cement, anything) — each with its own contacts underneath. Saved automatically.</div></div>' +
      '<div class="spacer"></div>' +
      '<button class="btn primary" data-action="sheet-add-cat">+ Add category</button></div>' +
      blocks;
  }

  /* ---- Deal pipeline (Kanban) ---- */
  function viewPipeline() {
    var deals = Store.deals();
    var cols = App.STAGES.map(function (st) {
      var inStage = deals.filter(function (d) { return d.stage === st.key; });
      var totalUSD = inStage.reduce(function (a, d) { return a + (Number(d.value) || 0); }, 0);
      var cards = inStage.map(function (d) {
        var sel = '<select onchange="App.onDealStage(\'' + d.id + '\',this.value)">' +
          App.STAGES.map(function (s) { return '<option value="' + s.key + '"' + (d.stage === s.key ? " selected" : "") + ">" + esc(s.label) + "</option>"; }).join("") + "</select>";
        return '<div class="deal">' +
          '<div class="deal-t">' + esc(d.title || "(untitled)") + "</div>" +
          '<div class="deal-m">' + esc(d.buyer || "") + (d.product ? " · " + esc(d.product) : "") + "</div>" +
          '<div class="deal-v">' + (d.value ? Prices.money(Number(d.value)) : "—") + "</div>" +
          '<div class="deal-actions">' + sel +
            '<button class="btn sm" data-action="deal-docs" data-id="' + d.id + '" title="Generate documents">📄</button>' +
            '<button class="btn sm" data-action="edit-deal" data-id="' + d.id + '">✎</button>' +
            '<button class="btn sm danger" data-action="del-deal" data-id="' + d.id + '">🗑</button>' +
          "</div></div>";
      }).join("");
      return '<div class="pipe-col"><div class="pipe-head" style="border-top-color:' + st.color + '"><span>' + esc(st.label) +
        '</span><span class="status-text">' + inStage.length + " · " + Prices.money(totalUSD) + "</span></div>" +
        (cards || '<div class="status-text" style="padding:10px 4px">—</div>') + "</div>";
    }).join("");
    var open = deals.filter(function (d) { return d.stage !== "won" && d.stage !== "lost"; }).reduce(function (a, d) { return a + (Number(d.value) || 0); }, 0);
    var won = deals.filter(function (d) { return d.stage === "won"; }).reduce(function (a, d) { return a + (Number(d.value) || 0); }, 0);
    return '<div class="page-head"><div><h2>Deal Pipeline</h2><div class="sub">Open value: <strong>' + Prices.money(open) +
      "</strong> · Won: <strong>" + Prices.money(won) + "</strong></div></div><div class=\"spacer\"></div>" +
      '<button class="btn primary" data-action="add-deal">+ New deal</button></div>' +
      '<div class="pipe-board">' + cols + "</div>";
  }

  /* ---- Shipments / logistics ---- */
  // Public AIS trackers — no key needed; opens the live position for that vessel.
  function vesselTrackUrl(d) {
    if (d.imo && /\d{7}/.test(d.imo)) return "https://www.vesselfinder.com/?imo=" + encodeURIComponent(d.imo.match(/\d{7}/)[0]);
    if (d.vessel) return "https://www.vesselfinder.com/vessels?name=" + encodeURIComponent(d.vessel);
    return "";
  }
  function viewShipments() {
    var deals = Store.deals().filter(function (d) {
      return d.bl || d.container || d.vessel || d.imo || d.eta || d.shipStatus || d.stage === "contract" || d.stage === "won";
    });
    var statuses = ["", "Booked", "Loading", "In transit", "Arrived", "Delivered", "Delayed"];
    var rows = deals.map(function (d) {
      var sel = '<select onchange="App.onShip(\'' + d.id + '\',\'shipStatus\',this.value)">' +
        statuses.map(function (x) { return '<option value="' + x + '"' + ((d.shipStatus || "") === x ? " selected" : "") + ">" + (x || "—") + "</option>"; }).join("") + "</select>";
      function cell(k) { return '<td><input value="' + esc(d[k] || "") + '" onchange="App.onShip(\'' + d.id + "','" + k + '\',this.value)"/></td>'; }
      var url = vesselTrackUrl(d);
      var track = url
        ? '<a class="btn sm primary" href="' + url + '" target="_blank" rel="noopener" title="Open live AIS position for this vessel">📍 Track</a>'
        : '<span class="status-text" title="Add a vessel name or 7-digit IMO to the deal to enable tracking">—</span>';
      return "<tr>" +
        "<td>" + esc(d.title || "(deal)") + '<div class="status-text">' + esc(d.buyer || "") + "</div></td>" +
        cell("bl") + cell("container") + cell("vessel") +
        '<td><input value="' + esc(d.imo || "") + '" placeholder="IMO" onchange="App.onShip(\'' + d.id + '\',\'imo\',this.value)" style="max-width:90px"/></td>' +
        cell("loadPort") + cell("dischargePort") +
        '<td><input type="date" value="' + esc(d.eta || "") + '" onchange="App.onShip(\'' + d.id + '\',\'eta\',this.value)"/></td>' +
        "<td>" + sel + "</td>" +
        "<td>" + track + "</td></tr>";
    }).join("");
    return '<div class="page-head"><div><h2>Shipments &amp; logistics</h2>' +
      '<div class="sub">Track each vessel live (public AIS via VesselFinder). Add a vessel name or 7-digit IMO in the deal, then hit 📍 Track.</div></div></div>' +
      (deals.length
        ? '<table class="sheet"><thead><tr><th>Deal</th><th>B/L</th><th>Container</th><th>Vessel</th><th>IMO</th><th>Load</th><th>Discharge</th><th>ETA</th><th>Status</th><th>Live</th></tr></thead><tbody>' + rows + "</tbody></table>"
        : '<div class="empty"><div class="big">🚢</div><p>No shipments yet. Move a deal to Contract/Won or add B/L &amp; ETA in a deal.</p></div>');
  }

  /* ---- Reports / P&L ---- */
  // Realised profit contribution of a paid invoice: if it's linked to a contract
  // we know the margin (value vs QP cost basis); otherwise we count revenue only.
  function invoiceRealised(inv) {
    var rev = (inv.paidAmount != null && inv.paidAmount !== "") ? Number(inv.paidAmount) : invoiceTotal(inv);
    var profit = 0, knownCost = false;
    if (inv.contractId) {
      var ct = Store.contracts().find(function (c) { return c.id === inv.contractId; });
      if (ct) {
        var val = contractValueUSD(ct);
        var cost = (ct.qpAvg !== "" && ct.qpAvg != null ? Number(ct.qpAvg) : 0) * (Number(ct.qtyMt) || 0);
        if (val > 0) { profit = rev * ((val - cost) / val); knownCost = true; }
      }
    }
    return { rev: rev, profit: profit, knownCost: knownCost };
  }
  function viewReports() {
    var deals = Store.deals();
    var won = deals.filter(function (d) { return d.stage === "won"; });
    var open = deals.filter(function (d) { return d.stage !== "won" && d.stage !== "lost"; });
    function sum(arr, f) { return arr.reduce(function (a, d) { return a + (Number(d[f]) || 0); }, 0); }
    var wonRev = sum(won, "value"), wonCost = sum(won, "cost"), wonProfit = wonRev - wonCost;
    var openRev = sum(open, "value"), openProfit = openRev - sum(open, "cost");

    // Paid invoices = realised cash. Fold them into realised revenue/profit.
    var paidInv = Store.invoices().filter(function (i) { return i.status === "paid"; });
    var invRev = 0, invProfit = 0, anyUnknownCost = false;
    paidInv.forEach(function (i) { var r = invoiceRealised(i); invRev += r.rev; invProfit += r.profit; if (!r.knownCost) anyUnknownCost = true; });

    var realRev = wonRev + invRev, realProfit = wonProfit + invProfit;
    var margin = realRev ? Math.round(realProfit / realRev * 100) : 0;

    // by product (won)
    var byProd = {}; won.forEach(function (d) { var k = d.product || "—"; byProd[k] = byProd[k] || { rev: 0, profit: 0 }; byProd[k].rev += Number(d.value) || 0; byProd[k].profit += (Number(d.value) || 0) - (Number(d.cost) || 0); });
    var prodRows = Object.keys(byProd).map(function (k) {
      return "<tr><td>" + esc(k) + "</td><td>" + Prices.money(byProd[k].rev) + "</td><td>" + Prices.money(byProd[k].profit) + "</td></tr>";
    }).join("") || '<tr><td colspan="3" class="status-text">No won deals yet.</td></tr>';

    // by month (won)
    var byMonth = {}; won.forEach(function (d) { var m = new Date(d.updatedAt || d.createdAt || Date.now()).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }); byMonth[m] = byMonth[m] || { rev: 0, profit: 0 }; byMonth[m].rev += Number(d.value) || 0; byMonth[m].profit += (Number(d.value) || 0) - (Number(d.cost) || 0); });
    var monthRows = Object.keys(byMonth).map(function (m) {
      return "<tr><td>" + esc(m) + "</td><td>" + Prices.money(byMonth[m].rev) + "</td><td>" + Prices.money(byMonth[m].profit) + "</td></tr>";
    }).join("") || '<tr><td colspan="3" class="status-text">No won deals yet.</td></tr>';

    // paid invoices table
    var invRows = paidInv.length ? paidInv.map(function (i) {
      var b = i.buyerId ? Store.companyById(i.buyerId) : null;
      var r = invoiceRealised(i);
      return "<tr><td>" + esc(i.number || "—") + '<div class="status-text">' + esc(b ? b.name : "") + "</div></td>" +
        "<td>" + Prices.money(r.rev) + "</td><td>" + (r.knownCost ? Prices.money(r.profit) : '<span class="status-text">rev only</span>') + "</td></tr>";
    }).join("") : '<tr><td colspan="3" class="status-text">No paid invoices yet — mark an invoice paid to see it here.</td></tr>';

    return '<div class="page-head"><div><h2>Reports &amp; P&amp;L</h2><div class="sub">Realised (won deals + paid invoices) vs pipeline (values in your display currency).</div></div></div>' +
      '<div class="stat-row">' +
        stat(Prices.money(realRev), "Realised revenue") +
        statDot(Prices.money(realProfit), "Realised profit", "green") +
        stat(margin + "%", "Avg margin") +
        statDot(Prices.money(invRev), "Paid invoices", "green") +
        stat(Prices.money(openRev), "Pipeline value") +
        stat(Prices.money(openProfit), "Pipeline profit") +
      "</div>" +
      (anyUnknownCost ? '<div class="notice warn">Some paid invoices aren\'t linked to a contract, so only their revenue is counted (no cost basis to compute profit). Link an invoice to a contract for full P&amp;L.</div>' : "") +
      '<div class="grid cards" style="grid-template-columns:1fr 1fr;">' +
        '<div class="card"><h3>Won by product</h3><table class="sheet"><thead><tr><th>Product</th><th>Revenue</th><th>Profit</th></tr></thead><tbody>' + prodRows + "</tbody></table></div>" +
        '<div class="card"><h3>Won by month</h3><table class="sheet"><thead><tr><th>Month</th><th>Revenue</th><th>Profit</th></tr></thead><tbody>' + monthRows + "</tbody></table></div>" +
        '<div class="card"><h3>Paid invoices</h3><table class="sheet"><thead><tr><th>Invoice</th><th>Revenue</th><th>Profit</th></tr></thead><tbody>' + invRows + "</tbody></table></div>" +
      "</div>";
  }

  /* ---- Markets: charts + price-alert log ---- */
  function metalCard(label, val, prev, series, premium, extraBtns) {
    var pct = (val != null && prev != null && Number(prev) !== 0) ? ((Number(val) - Number(prev)) / Number(prev) * 100) : null;
    var col = pct == null ? "#8b97a6" : (pct >= 0 ? "#46d07f" : "#ef5a5a");
    var chg = pct == null ? "" : ' <span style="color:' + col + '">' + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%</span>";
    return '<div class="card"><h3>' + esc(label) + "</h3>" +
      '<div style="font-size:24px;font-weight:700;font-family:ui-monospace,monospace">' + (val == null ? '<span class="status-text" style="font-size:14px">no price — set in Edit</span>' : Prices.money(val) + chg) + "</div>" +
      '<div style="margin-top:8px">' + (Prices.sparkline(series, col, 280, 70) || '<span class="status-text">no history yet</span>') + "</div>" +
      (premium != null ? '<div class="status-text">premium: ' + Prices.money(premium) + "/MT</div>" : "") +
      (extraBtns || "") + "</div>";
  }
  function viewMarkets() {
    var p = Store.prices();
    var ccy = Store.settings().displayCurrency || "USD";
    var builtin = App.PRICE_ROWS.filter(function (r) { return r.metal !== "iron"; }).map(function (r) {
      var row = p.rows[r.key] || {};
      return metalCard(r.label, row.value, row.prev, row.series, (r.hasPremium ? row.premium : null), "");
    }).join("");
    var custom = Store.customMetals().map(function (m) {
      var btns = '<div class="btn-row" style="margin-top:8px"><button class="btn sm" data-action="edit-cmetal" data-id="' + m.id + '">✎ Update price</button>' +
        '<button class="btn sm danger" data-action="del-cmetal" data-id="' + m.id + '">🗑</button></div>';
      return metalCard(m.label + (m.unit && m.unit !== "/MT" ? " (" + esc(m.unit) + ")" : ""), m.value, m.prev, m.series, null, btns);
    }).join("");
    var alerts = Store.priceAlerts();
    var log = alerts.length ? alerts.slice(0, 30).map(function (a) {
      var up = a.pct >= 0;
      return '<div class="al-row"><span>' + esc(new Date(a.ts).toLocaleString()) + "</span>" +
        "<span><strong>" + esc((App.METALS[a.metal === "nickel" ? "stainless" : a.metal] || {}).label || a.metal) + "</strong> " +
        '<span style="color:' + (up ? "#46d07f" : "#ef5a5a") + '">' + (up ? "▲" : "▼") + Math.abs(a.pct).toFixed(2) + "%</span> " +
        Prices.money(a.from) + " → " + Prices.money(a.to) + "</span></div>";
    }).join("") : '<div class="status-text">No alerts logged yet. They appear when a metal moves more than your threshold (Settings → alertPct).</div>';

    return '<div class="page-head"><div><h2>Markets</h2><div class="sub">Live charts (' + ccy + ') + price-move alert log. Add any metal you also trade.</div></div>' +
      '<div class="spacer"></div><button class="btn primary" data-action="add-cmetal">+ Add metal</button>' +
      '<button class="btn sm" data-action="refresh-prices">↻ Refresh</button></div>' +
      '<div class="grid cards">' + (builtin + custom || '<div class="status-text">No prices yet — refresh on the top bar.</div>') + "</div>" +
      '<h3 style="margin:18px 0 10px">⚡ Price-move alerts</h3><div class="card">' + log + "</div>";
  }

  /* ---- Calendar: tasks, follow-ups, shipment ETAs ---- */
  function viewCalendar() {
    var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + calOffset);
    var year = base.getFullYear(), month = base.getMonth();
    var first = new Date(year, month, 1), startDow = (first.getDay() + 6) % 7; // Monday-first
    var days = new Date(year, month + 1, 0).getDate();
    var ev = {}; // 'YYYY-M-D' -> [{type,text}]
    function add(d, type, text) { if (!d) return; var k = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); (ev[k] = ev[k] || []).push({ type: type, text: text }); }
    Store.tasks().forEach(function (t) { if (t.due && !t.done) add(new Date(t.due), "task", "✅ " + (t.text || "task")); });
    Store.deals().forEach(function (d) { if (d.eta) add(new Date(d.eta), "ship", "🚢 " + (d.title || "ETA")); });
    var fd = (Number(Store.settings().followUpDays) || 4) * 86400000;
    Store.companies().forEach(function (c) { if (c.status === "yellow" && c.lastEmailAt) add(new Date(c.lastEmailAt + fd), "follow", "📧 " + c.name); });

    var cells = "";
    for (var i = 0; i < startDow; i++) cells += '<div class="cal-cell empty"></div>';
    for (var day = 1; day <= days; day++) {
      var k = year + "-" + month + "-" + day;
      var list = (ev[k] || []).map(function (e) { return '<div class="cal-ev ' + e.type + '">' + esc(e.text) + "</div>"; }).join("");
      var today = new Date(); var isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      cells += '<div class="cal-cell' + (isToday ? " today" : "") + '"><div class="cal-d">' + day + "</div>" + list + "</div>";
    }
    var dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (d) { return '<div class="cal-dow">' + d + "</div>"; }).join("");
    var title = base.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return '<div class="page-head"><div><h2>Calendar</h2><div class="sub">Tasks, follow-ups &amp; shipment ETAs.</div></div>' +
      '<div class="spacer"></div><button class="btn sm" data-action="cal-prev">‹</button><span style="padding:0 10px;font-weight:700">' + esc(title) +
      '</span><button class="btn sm" data-action="cal-next">›</button></div>' +
      '<div class="cal-grid">' + dow + cells + "</div>";
  }

  /* ---- Global search ---- */
  function viewSearch() {
    var q = globalQ.trim().toLowerCase();
    if (!q) return '<div class="empty"><div class="big">🔎</div><p>Type in the search box to find buyers, deals, tasks and contacts.</p></div>';
    function hit(s) { return (s || "").toLowerCase().indexOf(q) !== -1; }
    var buyers = Store.companies().filter(function (c) { return hit(c.name) || hit(c.email) || hit(c.city) || hit(c.contactName); });
    var deals = Store.deals().filter(function (d) { return hit(d.title) || hit(d.buyer) || hit(d.product); });
    var tasks = Store.tasks().filter(function (t) { return hit(t.text); });
    var contacts = [];
    Store.sheetCategories().forEach(function (cat) { (cat.contacts || []).forEach(function (ct) { if (hit(ct.name) || hit(ct.company) || hit(ct.email)) contacts.push({ cat: cat.name, ct: ct }); }); });
    function sect(title, items) { return items ? '<div class="card"><h3>' + title + "</h3>" + items + "</div>" : ""; }
    var bH = buyers.map(function (c) { return '<div class="srch" data-nav="country:' + c.country + '">🏢 ' + esc(c.name) + ' <span class="status-text">' + esc((App.countryByCode(c.country) || {}).name || "") + "</span></div>"; }).join("");
    var dH = deals.map(function (d) { return '<div class="srch" data-nav="pipeline">📈 ' + esc(d.title || "(deal)") + ' <span class="status-text">' + esc(App.stageLabel(d.stage)) + "</span></div>"; }).join("");
    var tH = tasks.map(function (t) { return '<div class="srch" data-nav="tasks">✅ ' + esc(t.text) + "</div>"; }).join("");
    var cH = contacts.map(function (x) { return '<div class="srch" data-nav="sheet">📂 ' + esc(x.ct.name || x.ct.company) + ' <span class="status-text">' + esc(x.cat) + "</span></div>"; }).join("");
    var total = buyers.length + deals.length + tasks.length + contacts.length;
    return '<div class="page-head"><div><h2>Search: “' + esc(globalQ) + '”</h2><div class="sub">' + total + " results</div></div></div>" +
      (total ? sect("Buyers (" + buyers.length + ")", bH) + sect("Deals (" + deals.length + ")", dH) + sect("Tasks (" + tasks.length + ")", tH) + sect("Sheet contacts (" + contacts.length + ")", cH)
        : '<div class="empty"><div class="big">🤷</div><p>No matches for “' + esc(globalQ) + '”.</p></div>');
  }

  /* ---- Contracts (QP / formula pricing) ---- */
  var PRICE_METALS = [["copper", "Copper"], ["aluminium", "Aluminium"], ["zinc", "Zinc"], ["lead", "Lead"], ["nickel", "Nickel"], ["gold", "Gold"]];
  function metalPrice(key) { var r = Store.prices().rows[key]; return r && r.value != null ? Number(r.value) : null; }
  function contractUnitUSD(c) {
    var base = (c.qpAvg !== "" && c.qpAvg != null && !isNaN(c.qpAvg)) ? Number(c.qpAvg) : metalPrice(c.metal);
    if (base == null) return null;
    return Math.round(base * (1 + (Number(c.marginPct) || 0) / 100) + (Number(c.premium) || 0));
  }
  function contractValueUSD(c) { var u = contractUnitUSD(c); return u == null ? 0 : u * (Number(c.qtyMt) || 0); }

  function viewContracts() {
    var cs = Store.contracts();
    var rows = cs.map(function (c) {
      var buyer = c.buyerId ? Store.companyById(c.buyerId) : null;
      var unit = contractUnitUSD(c), val = contractValueUSD(c);
      var priced = (c.qpAvg !== "" && c.qpAvg != null);
      return "<tr>" +
        "<td>" + esc(buyer ? buyer.name : "—") + '<div class="status-text">' + esc(c.side) + " · " + esc(c.incoterm) + (c.port ? " " + esc(c.port) : "") + "</div></td>" +
        "<td>" + esc(c.product || "—") + "</td>" +
        "<td>" + esc(c.qtyMt || "0") + " MT ±" + esc(c.tolerancePct || 0) + "%</td>" +
        '<td><div class="status-text">' + esc(c.qpDesc || "") + "</div>" + (priced ? "QP " + Prices.money(Number(c.qpAvg)) : '<span style="color:var(--yellow)">unpriced</span>') + "</td>" +
        "<td>" + (unit == null ? "—" : Prices.money(unit) + "/MT") + "</td>" +
        "<td>" + Prices.money(val) + '<div class="status-text">prov ' + (Number(c.provisionalPct) || 0) + "%: " + Prices.money(val * (Number(c.provisionalPct) || 0) / 100) + "</div></td>" +
        '<td><select onchange="App.onContract(\'' + c.id + "','status',this.value)\">" + ["draft", "active", "priced", "closed", "cancelled"].map(function (st) { return '<option value="' + st + '"' + (c.status === st ? " selected" : "") + ">" + st + "</option>"; }).join("") + "</select></td>" +
        '<td><button class="btn sm" data-action="contract-invoice" data-id="' + c.id + '" title="Create provisional invoice">🧾</button>' +
          (c.doc ? '<button class="btn sm" data-action="view-contract-doc" data-id="' + c.id + '" title="View attached: ' + esc(c.doc.name) + '">📄</button>' : '<button class="btn sm" data-action="edit-contract" data-id="' + c.id + '" title="Attach counterparty document">📎</button>') +
          '<button class="btn sm" data-action="edit-contract" data-id="' + c.id + '">✎</button>' +
          '<button class="btn sm danger" data-action="del-contract" data-id="' + c.id + '">🗑</button></td>' +
        "</tr>";
    }).join("");
    var totVal = cs.reduce(function (a, c) { return a + contractValueUSD(c); }, 0);
    return '<div class="page-head"><div><h2>Contracts</h2><div class="sub">Formula/QP pricing · total book ' + Prices.money(totVal) + "</div></div>" +
      '<div class="spacer"></div><button class="btn primary" data-action="add-contract">+ New contract</button></div>' +
      (cs.length ? '<table class="sheet"><thead><tr><th>Counterparty</th><th>Product</th><th>Qty</th><th>QP / pricing</th><th>Unit</th><th>Value</th><th>Status</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>"
        : '<div class="empty"><div class="big">📜</div><p>No contracts yet. A contract captures quantity, tolerance and the QP/formula price (e.g. average LME over month of shipment + premium).</p></div>');
  }

  /* ---- Invoices + LC / payments ---- */
  function invoiceTotal(inv) { return (inv.lines || []).reduce(function (a, l) { return a + (Number(l.amount) || 0); }, 0); }
  function viewInvoices() {
    var inv = Store.invoices();
    var now = Date.now();
    function isOverdue(i) { return i.status !== "paid" && i.dueDate && new Date(i.dueDate).getTime() < now; }
    var outstanding = inv.filter(function (i) { return i.status !== "paid"; }).reduce(function (a, i) { return a + (invoiceTotal(i) - (Number(i.paidAmount) || 0)); }, 0);
    var overdue = inv.filter(isOverdue).reduce(function (a, i) { return a + (invoiceTotal(i) - (Number(i.paidAmount) || 0)); }, 0);
    var paid = inv.filter(function (i) { return i.status === "paid"; }).reduce(function (a, i) { return a + invoiceTotal(i); }, 0);
    var lcSoon = inv.filter(function (i) { return i.lcExpiry && new Date(i.lcExpiry).getTime() < now + 14 * 86400000 && i.status !== "paid"; });
    var rows = inv.map(function (i) {
      var buyer = i.buyerId ? Store.companyById(i.buyerId) : null;
      var t = invoiceTotal(i);
      return "<tr>" +
        "<td>" + esc(i.number) + '<div class="status-text">' + esc(i.type) + "</div></td>" +
        "<td>" + esc(buyer ? buyer.name : "—") + "</td>" +
        "<td>" + esc(i.date) + '<div class="status-text">due ' + esc(i.dueDate || "—") + "</div></td>" +
        "<td>" + Prices.money(t) + "</td>" +
        "<td>" + (i.lcRef ? "LC " + esc(i.lcRef) + '<div class="status-text">' + esc(i.lcBank || "") + (i.lcExpiry ? " · exp " + esc(i.lcExpiry) : "") + "</div>" : "—") + "</td>" +
        '<td><span class="inv-st ' + (isOverdue(i) ? "overdue" : i.status) + '">' + (isOverdue(i) ? "overdue" : i.status) + "</span></td>" +
        '<td>' + (i.status !== "paid" ? '<button class="btn sm primary" data-action="invoice-paid" data-id="' + i.id + '">Mark paid</button>' : "✓") +
          '<button class="btn sm" data-action="invoice-print" data-id="' + i.id + '">🖨</button>' +
          '<button class="btn sm" data-action="edit-invoice" data-id="' + i.id + '">✎</button>' +
          '<button class="btn sm danger" data-action="del-invoice" data-id="' + i.id + '">🗑</button></td>' +
        "</tr>";
    }).join("");
    var lcWarn = lcSoon.length ? '<div class="notice warn">⏳ ' + lcSoon.length + " open invoice(s) have an LC expiring within 14 days.</div>" : "";
    return '<div class="page-head"><div><h2>Invoices</h2><div class="sub">Proforma → commercial → provisional/final, with LC &amp; payment tracking.</div></div>' +
      '<div class="spacer"></div><button class="btn primary" data-action="add-invoice">+ New invoice</button></div>' + lcWarn +
      '<div class="stat-row">' + statDot(Prices.money(outstanding), "Outstanding", "yellow") + statDot(Prices.money(overdue), "Overdue", "red") + stat(Prices.money(paid), "Paid") + "</div>" +
      (inv.length ? '<table class="sheet"><thead><tr><th>Invoice</th><th>Buyer</th><th>Date</th><th>Total</th><th>LC</th><th>Status</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>"
        : '<div class="empty"><div class="big">🧾</div><p>No invoices yet. Create one, or generate a provisional invoice from a contract (🧾).</p></div>');
  }

  /* ---- Risk / positions + MTM ---- */
  function viewRisk() {
    var cs = Store.contracts().filter(function (c) { return c.status !== "cancelled"; });
    var hs = Store.hedges();
    var metals = {};
    function bucket(k) { return metals[k] = metals[k] || { phys: 0, hedge: 0, mtm: 0, unpriced: 0 }; }
    cs.forEach(function (c) {
      var sign = c.side === "buy" ? 1 : -1, qty = Number(c.qtyMt) || 0, u = contractUnitUSD(c), cur = metalPrice(c.metal);
      var b = bucket(c.metal); b.phys += sign * qty;
      if (u != null && cur != null) b.mtm += sign * (cur - u) * qty;
      if (c.qpAvg === "" || c.qpAvg == null) b.unpriced += qty;
    });
    hs.forEach(function (h) {
      var sign = h.side === "buy" ? 1 : -1, qty = Number(h.qtyMt) || 0, pr = Number(h.price) || 0, cur = metalPrice(h.metal);
      var b = bucket(h.metal); b.hedge += sign * qty;
      if (cur != null) b.mtm += sign * (cur - pr) * qty;
    });
    var rows = Object.keys(metals).map(function (k) {
      var b = metals[k]; var net = b.phys + b.hedge;
      var lbl = (PRICE_METALS.find(function (m) { return m[0] === k; }) || [k, k])[1];
      return "<tr><td>" + esc(lbl) + "</td><td>" + b.phys.toLocaleString() + " MT</td><td>" + b.hedge.toLocaleString() + " MT</td>" +
        '<td' + (Math.abs(net) > 0 ? ' style="color:var(--yellow);font-weight:700"' : "") + ">" + net.toLocaleString() + " MT</td>" +
        "<td>" + (b.unpriced ? b.unpriced.toLocaleString() + " MT" : "—") + "</td>" +
        '<td style="color:' + (b.mtm >= 0 ? "var(--green)" : "var(--red)") + '">' + Prices.money(b.mtm) + "</td></tr>";
    }).join("") || '<tr><td colspan="6" class="status-text">No contracts/hedges yet.</td></tr>';
    var hedgeRows = hs.map(function (h) {
      return "<tr><td>" + esc((PRICE_METALS.find(function (m) { return m[0] === h.metal; }) || [h.metal, h.metal])[1]) + "</td>" +
        '<td><select onchange="App.onHedge(\'' + h.id + "','side',this.value)\">" + ["buy", "sell"].map(function (sd) { return '<option' + (h.side === sd ? " selected" : "") + ">" + sd + "</option>"; }).join("") + "</select></td>" +
        '<td><input value="' + esc(h.qtyMt) + '" onchange="App.onHedge(\'' + h.id + '\',\'qtyMt\',this.value)"/></td>' +
        '<td><input value="' + esc(h.price) + '" onchange="App.onHedge(\'' + h.id + '\',\'price\',this.value)"/></td>' +
        '<td><button class="btn sm danger" data-action="del-hedge" data-id="' + h.id + '">🗑</button></td></tr>';
    }).join("");
    var totMtm = Object.keys(metals).reduce(function (a, k) { return a + metals[k].mtm; }, 0);
    return '<div class="page-head"><div><h2>Risk / positions</h2><div class="sub">Net physical vs hedge exposure and mark-to-market (indicative, at current prices).</div></div>' +
      '<div class="spacer"></div><span class="stat" style="padding:8px 14px">Total MTM: <strong style="color:' + (totMtm >= 0 ? "var(--green)" : "var(--red)") + '">' + Prices.money(totMtm) + "</strong></span></div>" +
      '<table class="sheet"><thead><tr><th>Metal</th><th>Physical net</th><th>Hedge net</th><th>Net exposure</th><th>Unpriced</th><th>MTM</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<div class="page-head" style="margin-top:18px"><div><h3>LME hedges</h3></div><div class="spacer"></div><button class="btn" data-action="add-hedge">+ Add hedge</button></div>' +
      (hs.length ? '<table class="sheet"><thead><tr><th>Metal</th><th>Side</th><th>Qty (MT)</th><th>Price USD/MT</th><th></th></tr></thead><tbody>' + hedgeRows + "</tbody></table>" : '<div class="status-text">No hedges recorded.</div>');
  }

  /* ---- Compliance: KYC + sanctions ---- */
  function viewCompliance() {
    var companies = Store.companies();
    var inv = Store.invoices();
    function outstandingFor(id) { return inv.filter(function (i) { return i.buyerId === id && i.status !== "paid"; }).reduce(function (a, i) { return a + (invoiceTotal(i) - (Number(i.paidAmount) || 0)); }, 0); }
    var kycOpts = ["none", "pending", "approved", "rejected"];
    var rows = companies.map(function (c) {
      var out = outstandingFor(c.id), lim = Number(c.creditLimit) || 0;
      var over = lim > 0 && out > lim;
      return "<tr><td>" + esc(c.name) + '<div class="status-text">' + esc((App.countryByCode(c.country) || {}).name || "") + "</div></td>" +
        '<td><select onchange="App.onKyc(\'' + c.id + "','kycStatus',this.value)\">" + kycOpts.map(function (k) { return '<option' + (c.kycStatus === k ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select></td>" +
        '<td><input value="' + esc(c.creditLimit || "") + '" placeholder="limit USD" onchange="App.onKyc(\'' + c.id + '\',\'creditLimit\',this.value)"/></td>' +
        '<td' + (over ? ' style="color:var(--red);font-weight:700"' : "") + ">" + Prices.money(out) + (over ? " ⚠️" : "") + "</td>" +
        "<td>" + (c.sanctionsFlag ? '<span class="inv-st overdue">⚠ ' + esc(c.sanctionsFlag) + "</span>" : '<span class="status-text">clear</span>') + "</td></tr>";
    }).join("");
    return '<div class="page-head"><div><h2>Compliance</h2><div class="sub">KYC status, credit limits vs exposure, and sanctions screening.</div></div>' +
      '<div class="spacer"></div><button class="btn primary" data-action="screen-all">🛡️ Screen all</button></div>' +
      '<div class="notice warn">⚠️ Sanctions screening here is an <strong>indicative keyword check</strong> only — not a substitute for a real OFAC/EU/UK SDN screening service before contracting.</div>' +
      '<table class="sheet"><thead><tr><th>Counterparty</th><th>KYC</th><th>Credit limit</th><th>Outstanding</th><th>Sanctions</th></tr></thead><tbody>' + rows + "</tbody></table>";
  }

  /* ---- Tasks ---- */
  function viewTasks() {
    var tasks = Store.tasks().slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.due || "9999") < (b.due || "9999") ? -1 : 1;
    });
    var rows = tasks.map(function (t) {
      var overdue = t.due && !t.done && new Date(t.due).getTime() < Date.now() - 86400000;
      var buyer = t.buyerId ? Store.companyById(t.buyerId) : null;
      return '<div class="task' + (t.done ? " done" : "") + '">' +
        '<input type="checkbox" ' + (t.done ? "checked" : "") + ' onchange="App.onTaskDone(\'' + t.id + '\',this.checked)"/>' +
        '<input class="task-text" value="' + esc(t.text) + '" onchange="App.onTaskEdit(\'' + t.id + '\',\'text\',this.value)"/>' +
        '<input type="date" class="task-due' + (overdue ? " overdue" : "") + '" value="' + esc(t.due || "") + '" onchange="App.onTaskEdit(\'' + t.id + '\',\'due\',this.value)"/>' +
        (buyer ? '<span class="status-text">' + esc(buyer.name) + "</span>" : '<span class="status-text"></span>') +
        '<button class="btn sm danger" data-action="del-task" data-id="' + t.id + '">🗑</button>' +
        "</div>";
    }).join("");
    return '<div class="page-head"><div><h2>Tasks</h2><div class="sub">To-dos &amp; reminders. Overdue items show in red and on the dashboard.</div></div>' +
      '<div class="spacer"></div><button class="btn primary" data-action="add-task">+ Add task</button></div>' +
      '<div class="tasklist">' + (rows || '<div class="empty"><div class="big">✅</div><p>No tasks yet.</p></div>') + "</div>";
  }

  /* ---- Landed-cost / margin calculator ---- */
  function viewCalc() {
    var prodOpts = App.allProducts().map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + "</option>"; }).join("");
    return '<div class="page-head"><div><h2>Landed-cost / margin calculator</h2>' +
      '<div class="sub">Turn a live metal price into your CIF / landed cost and profit per tonne.</div></div></div>' +
      '<div class="card" style="max-width:560px">' +
        '<div class="field"><label>Product (auto base price)</label><select id="calc-prod" onchange="App.calcProduct()">' + prodOpts + "</select></div>" +
        '<div class="field-2"><div class="field"><label>Base price USD/MT</label><input id="calc-base" type="number" oninput="App.recalcCalc()"/></div>' +
          '<div class="field"><label>Your margin %</label><input id="calc-margin" type="number" value="3" oninput="App.recalcCalc()"/></div></div>' +
        '<div class="field-2"><div class="field"><label>Freight USD/MT</label><input id="calc-freight" type="number" value="80" oninput="App.recalcCalc()"/></div>' +
          '<div class="field"><label>Insurance %</label><input id="calc-ins" type="number" value="0.5" oninput="App.recalcCalc()"/></div></div>' +
        '<div class="field-2"><div class="field"><label>Import duty %</label><input id="calc-duty" type="number" value="0" oninput="App.recalcCalc()"/></div>' +
          '<div class="field"><label>Quantity (MT)</label><input id="calc-qty" type="number" value="100" oninput="App.recalcCalc()"/></div></div>' +
        '<div id="calc-out" class="calc-out"></div>' +
      "</div>";
  }

  /* ---- Companies (all or by country) ---- */
  function viewCompanies(countryCode) {
    var list = countryCode ? Store.companiesByCountry(countryCode) : Store.companies();
    var title, sub;
    if (countryCode) {
      var c = App.countryByCode(countryCode);
      title = c.flag + " " + c.name; sub = "Buyers in " + c.name + " · target top 50";
    } else {
      title = "All Buyers"; sub = "Every buyer across the EU";
    }

    if (query) {
      var q = query.toLowerCase();
      list = list.filter(function (x) {
        return (x.name || "").toLowerCase().indexOf(q) !== -1 ||
               (x.email || "").toLowerCase().indexOf(q) !== -1 ||
               (x.city || "").toLowerCase().indexOf(q) !== -1;
      });
    }
    if (filterStatus) list = list.filter(function (x) { return (x.status || "red") === filterStatus; });
    if (filterMetal) list = list.filter(function (x) {
      return (x.materials || []).some(function (id) { var pp = App.productById(id); return pp && pp.metal === filterMetal; });
    });

    var statusOpts = [["", "All statuses"], ["red", "🔴 Not contacted"], ["yellow", "🟡 Awaiting reply"], ["green", "🟢 Replied"]]
      .map(function (o) { return '<option value="' + o[0] + '"' + (filterStatus === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
    var metalOpts = '<option value="">All materials</option>' + Object.keys(App.METALS).map(function (mk) {
      return '<option value="' + mk + '"' + (filterMetal === mk ? " selected" : "") + ">" + esc(App.METALS[mk].label) + "</option>";
    }).join("");
    var filtersBar = '<div class="filters">' +
      '<select class="search" onchange="App.onFilter(\'status\',this.value)">' + statusOpts + "</select>" +
      '<select class="search" onchange="App.onFilter(\'metal\',this.value)">' + metalOpts + "</select>" +
      ((filterStatus || filterMetal) ? '<button class="btn sm" data-action="clear-filters">✕ Clear filters</button>' : "") +
      '<span class="status-text">' + list.length + " shown</span></div>";

    var head = '<div class="page-head"><div><h2>' + esc(title) + "</h2>" +
      '<div class="sub">' + esc(sub) + "</div></div>" +
      '<div class="spacer"></div>' +
      '<input class="search" placeholder="Search name, email, city…" value="' + esc(query) + '" oninput="App.onSearch(this.value)"/>' +
      '<button class="btn" data-action="bulk-find"' + (countryCode ? ' data-country="' + countryCode + '"' : "") + '>👥 Find buyers (all)</button>' +
      (countryCode ? '<button class="btn" data-action="discover-companies" data-country="' + countryCode + '">🔎 Discover companies</button>' : "") +
      '<button class="btn" data-action="sync-gmail">📥 Sync Gmail</button>' +
      '<button class="btn" data-action="check-opens">👁 Check opens</button>' +
      '<button class="btn" data-action="import">⇪ Import CSV</button>' +
      '<button class="btn" data-action="export">⇩ Export</button>' +
      ((countryCode && App.countryByCode(countryCode) && App.countryByCode(countryCode).custom)
        ? '<button class="btn danger" data-action="remove-country" data-country="' + countryCode + '">🗑 Remove country</button>' : "") +
      '<button class="btn primary" data-action="add-company"' + (countryCode ? ' data-country="' + countryCode + '"' : "") + '>+ Add buyer</button></div>' +
      filtersBar;

    var legend = '<div class="legend" style="margin-bottom:14px;">' +
      '<span><span class="dot" style="background:var(--red)"></span>Not contacted</span>' +
      '<span><span class="dot" style="background:var(--yellow)"></span>Awaiting reply</span>' +
      '<span><span class="dot" style="background:var(--green)"></span>Replied</span>' +
      '<span>· Click a light to set status. Click 🟢 / “Send email” to open Gmail.</span></div>';

    if (!list.length) {
      return head + legend + '<div class="empty"><div class="big">🗂️</div>' +
        "<p>No buyers here yet.</p>" +
        '<button class="btn primary" data-action="add-company"' + (countryCode ? ' data-country="' + countryCode + '"' : "") + '>+ Add the first buyer</button>' +
        ' <button class="btn" data-action="import">⇪ Import from CSV</button></div>';
    }

    var cards = list.map(companyCard).join("");
    return head + legend + '<div class="grid cards">' + cards + "</div>";
  }

  function companyCard(c) {
    var country = App.countryByCode(c.country);
    var tags = (c.materials || []).map(function (id) {
      var p = App.productById(id); if (!p) return "";
      var m = metal(p.metal);
      return '<span class="tag"><span class="swatch" style="background:' + m.color + '"></span>' + esc(p.name) + "</span>";
    }).join("") || '<span class="status-text">No products assigned yet</span>';

    var light = function (st, label) {
      return '<button class="light ' + st + (c.status === st ? " on" : "") + '" title="' + label +
        '" data-action="status" data-status="' + st + '" data-id="' + c.id + '"></button>';
    };

    var statusText = {
      red: "Not contacted yet",
      yellow: c.lastEmailAt ? "Emailed " + new Date(c.lastEmailAt).toLocaleDateString() + " · awaiting reply" : "Awaiting reply",
      green: "Replied" + (c.lastReplyAt ? " " + new Date(c.lastReplyAt).toLocaleDateString() : "")
    }[c.status] || "";

    var replyBadge = c.status === "green"
      ? '<span class="reply-badge" data-action="open-thread" data-id="' + c.id + '">📬 Read reply</span>' : "";
    var opensBadge = (c.opens && c.opens.count)
      ? '<span class="opens-badge" title="clicked your tracked link ' + c.opens.count + '×">👁 ' + c.opens.count + "</span>" : "";

    var people = (c.people || []).map(function (p, idx) {
      var mail = p.email
        ? '<span class="person-mail" data-action="person-email" data-id="' + c.id + '" data-idx="' + idx + '" title="Email ' + esc(p.name) + '">✉️</span>'
        : (p.locked ? '<span class="person-locked" title="Email locked in Apollo — enable Reveal in Settings">🔒</span>' : "");
      var li = p.linkedin ? ' <a href="' + esc(p.linkedin) + '" target="_blank" rel="noopener" title="LinkedIn">in</a>' : "";
      var thread = p.email
        ? '<span class="person-thread" data-action="person-thread" data-id="' + c.id + '" data-idx="' + idx + '" title="Open this contact\'s Gmail thread">🔎</span>' : "";
      var wa = p.phone ? '<a class="person-wa" href="' + waUrl(p.phone) + '" target="_blank" rel="noopener" title="WhatsApp">💬</a>' : "";
      var pst = p.status || "red";
      var lights = ["red", "yellow", "green"].map(function (st) {
        return '<button class="plight ' + st + (pst === st ? " on" : "") +
          '" data-action="person-status" data-id="' + c.id + '" data-idx="' + idx + '" data-status="' + st + '" title="' +
          ({ red: "Not contacted", yellow: "Awaiting reply", green: "Replied" }[st]) + '"></button>';
      }).join("");
      return '<div class="person">' +
        '<span class="p-name">' + esc(p.name || "—") + "</span>" +
        '<span class="p-title">' + esc(p.title || "") + "</span>" +
        (p.email ? '<span class="p-email">' + esc(p.email) + "</span>" : "") +
        (p.phone ? '<span class="p-email">📞 ' + esc(p.phone) + "</span>" : "") +
        '<span class="p-actions">' +
          '<span class="plights">' + lights + "</span>" +
          mail + thread + wa + li +
          '<span class="person-del" data-action="del-person" data-id="' + c.id + '" data-idx="' + idx + '" title="Remove">✕</span>' +
        "</span></div>";
    }).join("");
    var peopleBlock = (c.people && c.people.length)
      ? '<div class="people"><div class="people-h">👥 Buyers / procurement (' + c.people.length + ")" +
        '<span class="people-refresh" data-action="refresh-phones" data-id="' + c.id + '" title="Pull phone numbers that arrived via Apollo webhook">↻ phones</span>' +
        "</div>" + people + "</div>"
      : "";

    return '<div class="card">' +
      '<div style="display:flex;align-items:flex-start;gap:8px;">' +
        "<div style=\"flex:1;min-width:0;\"><h3>" + esc(c.name || "(unnamed buyer)") + "</h3>" +
        '<div class="meta">' + (country ? country.flag + " " + esc(country.name) : "") +
          (c.city ? " · " + esc(c.city) : "") +
          (c.website ? ' · <a href="' + normUrl(c.website) + '" target="_blank" rel="noopener">' + esc(c.website) + "</a>" : "") +
        "</div></div>" +
      "</div>" +
      '<div class="tags">' + tags + "</div>" +
      (c.contactName ? '<div class="contact-line">👤 ' + esc(c.contactName) + "</div>" : "") +
      (c.email ? '<div class="contact-line">✉️ ' + esc(c.email) + "</div>" : '<div class="contact-line" style="color:var(--yellow)">✉️ no email — add one to send</div>') +
      (c.phone ? '<div class="contact-line">📞 ' + esc(c.phone) + "</div>" : "") +
      peopleBlock +
      '<div class="status-line">' +
        '<div class="lights">' + light("red", "Not contacted") + light("yellow", "Awaiting reply") + light("green", "Replied") + "</div>" +
        '<span class="status-text">' + esc(statusText) + "</span>" + replyBadge + opensBadge +
      "</div>" +
      '<div class="card-actions">' +
        '<button class="btn primary sm" data-action="send-email" data-id="' + c.id + '">✉️ Send email</button>' +
        (c.phone ? '<a class="btn sm wa" href="' + waUrl(c.phone) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : "") +
        '<button class="btn sm" data-action="make-offer" data-id="' + c.id + '">💰 Offer</button>' +
        '<button class="btn sm" data-action="make-docs" data-id="' + c.id + '">📄 Docs</button>' +
        '<button class="btn sm" data-action="find-buyers" data-id="' + c.id + '">👥 More contacts</button>' +
        '<button class="btn sm" data-action="open-thread" data-id="' + c.id + '">📧 Gmail history</button>' +
        '<button class="btn sm" data-action="edit-company" data-id="' + c.id + '">✎ Edit</button>' +
        '<button class="btn sm danger" data-action="del-company" data-id="' + c.id + '">🗑</button>' +
      "</div></div>";
  }

  function normUrl(u) {
    if (!u) return "#";
    return /^https?:\/\//i.test(u) ? u : "https://" + u;
  }

  /* ---- Settings ---- */
  function viewSettings() {
    var s = Store.settings();
    function f(key, label, ph) {
      return '<div class="field"><label>' + esc(label) + "</label>" +
        '<input data-set="' + key + '" value="' + esc(s[key] || "") + '" placeholder="' + esc(ph || "") + '"/></div>';
    }
    return '<div class="page-head"><div><h2>Settings</h2>' +
      '<div class="sub">Your sender identity — used in every pre-written email.</div></div></div>' +
      '<div class="card" style="max-width:640px;">' +
        '<div class="field-2">' + f("senderName", "Your name", "Jane Trader") + f("senderTitle", "Title", "Sales Manager") + "</div>" +
        '<div class="field-2">' + f("companyName", "Company name", "Acme Metals Ltd.") + f("senderEmail", "Your Gmail work address", "you@company.com") + "</div>" +
        '<div class="field-2">' + f("phone", "Phone", "+1 …") + f("website", "Website", "company.com") + "</div>" +
        '<div class="field"><label>Extra signature lines (optional)</label><textarea data-set="signature" placeholder="Address, registration no., etc.">' + esc(s.signature || "") + "</textarea></div>" +
        '<div class="btn-row"><button class="btn primary" data-action="save-settings">Save settings</button></div>' +
      "</div>" +
      '<div class="notice warn" style="max-width:640px;margin-top:16px;">💡 Statuses can be set manually (click a light) or synced automatically from Gmail (below). Sending always goes through the review-first Gmail compose button.</div>' +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>👥 Apollo.io contact finder</h3>' +
        '<div class="meta">Your Apollo key lives only in the proxy\'s <span class="kbd">.env</span> file — never in the browser or GitHub. Start it with <span class="kbd">node server/apollo-proxy.js</span> (see README).</div>' +
        '<div class="field" style="margin-top:10px;"><label>Apollo proxy URL</label><input data-set="apolloProxyUrl" value="' + esc(s.apolloProxyUrl || "") + '" placeholder="http://localhost:8787"/></div>' +
        '<label class="check" style="margin:4px 0 12px;"><input type="checkbox" data-set-bool="revealContacts"' + (s.revealContacts ? " checked" : "") + '> Reveal emails/phones (uses Apollo credits)</label>' +
        '<label class="check" style="margin:-6px 0 12px;"><input type="checkbox" data-set-bool="revealPhone"' + (s.revealPhone ? " checked" : "") + '> Also reveal phone numbers — async; needs a public proxy (set WEBHOOK_BASE_URL)</label>' +
        '<div class="btn-row"><button class="btn primary" data-action="save-settings">Save settings</button>' +
          '<button class="btn" data-action="test-proxy">Test proxy connection</button></div>' +
      "</div>" +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>📥 Gmail auto-status</h3>' +
        '<div class="meta">Connect your Gmail (read-only) so the app can set 🟡 when you\'ve emailed a buyer and 🟢 when they reply. Requires Google OAuth credentials in the proxy\'s <span class="kbd">.env</span> (see README).</div>' +
        '<div id="gmail-status" class="meta" style="margin-top:10px;">Checking connection…</div>' +
        '<div class="btn-row" style="margin-top:10px;">' +
          '<button class="btn primary" data-action="connect-gmail">Connect Gmail</button>' +
          '<button class="btn" data-action="sync-gmail">📥 Sync now</button>' +
        "</div></div>" +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>💱 Live prices</h3>' +
        '<div class="meta">Prices show on the bar at the top of every page and feed into each email. ' +
        'Pick where they come from — for the hosted site use <strong>Metals-API (direct)</strong> with a free key, ' +
        'since the local proxy isn\'t reachable from https.</div>' +
        '<div class="meta" style="margin-top:8px;">Current: <strong>' + esc(Store.prices().source) + "</strong> · " + esc(Prices.ageText(Store.prices().updatedAt)) + (App.priceMsg ? ' · <span style="color:var(--yellow)">' + esc(App.priceMsg) + "</span>" : "") + "</div>" +
        '<div class="field" style="margin-top:10px;"><label>Price source</label><select data-set="priceSource">' +
          opt("free", "Free web feed — no key, no setup (Gold/Copper/Aluminium)", s.priceSource) +
          opt("metalsapi", "Metals-API (direct, needs key) — adds Zinc/Lead/Nickel", s.priceSource) +
          opt("custom", "Custom URL (any CORS JSON feed)", s.priceSource) +
          opt("proxy", "Local proxy /api/prices (needs the Node proxy running)", s.priceSource) +
          opt("manual", "Manual only (no auto-fetch)", s.priceSource) +
        "</select></div>" +
        '<div class="meta" style="margin:-2px 0 8px;">Free feed pulls Gold, Copper &amp; Aluminium from public web data (no key). LME Zinc/Lead/Nickel &amp; premiums aren\'t free anywhere reliable — enter those via <strong>Edit</strong>.</div>' +
        '<div class="field"><label>Metals-API key (for the direct source — free at metals-api.com)</label><input data-set="priceApiKey" value="' + esc(s.priceApiKey || "") + '" placeholder="your access_key"/></div>' +
        '<div class="field"><label>Custom price URL (for the Custom source)</label><input data-set="priceCustomUrl" value="' + esc(s.priceCustomUrl || "") + '" placeholder="https://…/prices (returns normalized JSON)"/></div>' +
        '<div class="field-2">' +
          '<div class="field"><label>Calibrate: unit</label><select data-set="priceUnit">' +
            opt("tonne", "per tonne", s.priceUnit) + opt("lb", "per lb (×2204.62)", s.priceUnit) + opt("oz", "per oz", s.priceUnit) +
          "</select></div>" +
          '<div class="field"><label>Calibrate: multiplier (if numbers look off)</label><input data-set="priceMult" value="' + esc(s.priceMult != null ? s.priceMult : 1) + '" placeholder="1"/></div>' +
        "</div>" +
        '<label class="check" style="margin:4px 0 12px;"><input type="checkbox" data-set-bool="priceInvert"' + (s.priceInvert !== false ? " checked" : "") + '> Invert rate (1/rate) — keep on for Metals-API</label>' +
        '<label class="check" style="margin:0 0 12px;"><input type="checkbox" data-set-bool="autoScanPrices"' + (s.autoScanPrices !== false ? " checked" : "") + '> Auto-scan prices daily on load</label>' +
        '<div class="field"><label>Live auto-refresh every (seconds, 0 = off — mind your API quota)</label><input data-set="priceLiveSeconds" value="' + esc(s.priceLiveSeconds != null ? s.priceLiveSeconds : 60) + '" placeholder="60"/></div>' +
        '<div class="btn-row"><button class="btn primary" data-action="save-settings">Save settings</button>' +
          '<button class="btn" data-action="refresh-prices">↻ Fetch prices now</button></div>' +
      "</div>" +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>Data &amp; backup</h3>' +
        '<div class="meta">Back up or move your data, and keep an automatic daily local snapshot you can restore.</div>' +
        '<label class="check" style="margin:10px 0;"><input type="checkbox" data-set-bool="autoBackup"' + (s.autoBackup !== false ? " checked" : "") + '> Keep a daily local snapshot (auto-backup)</label>' +
        '<label class="check" style="margin:0 0 10px;"><input type="checkbox" data-set-bool="autoFollowupTask"' + (s.autoFollowupTask !== false ? " checked" : "") + '> Auto-create a follow-up task when I email a buyer</label>' +
        '<div class="meta" id="snap-info">' + snapInfo() + "</div>" +
        '<input type="file" id="restore-file" accept=".json,application/json" style="display:none" onchange="App.onRestoreFile(this)"/>' +
        '<div class="btn-row" style="margin-top:10px;">' +
          '<button class="btn" data-action="export">⇩ Download backup (JSON)</button>' +
          '<button class="btn" data-action="restore-file">⇪ Restore from file</button>' +
          '<button class="btn" data-action="import">📋 Import CSV / paste</button>' +
          '<button class="btn" data-action="restore-snapshot">↩ Restore last snapshot</button>' +
          '<button class="btn" data-action="save-settings">Save</button>' +
          '<button class="btn danger" data-action="reset">Reset all data</button>' +
        "</div></div>" +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>👁 Email tracking</h3>' +
        '<div class="meta">Append a tracked link to outgoing emails; when the buyer clicks it your proxy logs it and you see 👁 on their card. Needs the proxy reachable publicly (set TRACK_REDIRECT_URL). Use “Check opens” on the buyers list.</div>' +
        '<label class="check" style="margin:10px 0;"><input type="checkbox" data-set-bool="trackEmails"' + (s.trackEmails ? " checked" : "") + '> Add tracked link to emails</label>' +
        '<div class="btn-row"><button class="btn primary" data-action="save-settings">Save settings</button></div></div>' +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>📊 Offer margins</h3>' +
        '<div class="meta">Your margin % over the live metal price, used by the offer generator. Use negative values for scrap discounts.</div>' +
        '<div class="margins">' + App.allProducts().map(function (pp) {
          var v = (s.margins && s.margins[pp.id] != null) ? s.margins[pp.id] : "";
          return '<label class="mg"><span>' + esc(pp.name) + '</span><input type="number" step="0.1" data-margin="' + pp.id + '" value="' + esc(v) + '" placeholder="0"/></label>';
        }).join("") + "</div>" +
        '<div class="btn-row" style="margin-top:10px;"><button class="btn primary" data-action="save-settings">Save settings</button></div></div>' +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>✉️ Email templates</h3>' +
        '<div class="meta">Used by the Send email button. Placeholders: <span class="kbd">{{contact}}</span> <span class="kbd">{{company}}</span> <span class="kbd">{{products}}</span> <span class="kbd">{{prices}}</span> <span class="kbd">{{me}}</span> <span class="kbd">{{myCompany}}</span>.</div>' +
        '<div class="field" style="margin-top:10px;"><label>Default template</label><select data-set="defaultTemplateId"><option value="">Built-in default</option>' +
          s.templates.map(function (t) { return '<option value="' + t.id + '"' + (s.defaultTemplateId === t.id ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="tpl-list">' + (s.templates.length ? s.templates.map(function (t) {
          return '<div class="tpl"><span>' + esc(t.name) + '</span><span class="p-actions"><button class="btn sm" data-action="edit-template" data-id="' + t.id + '">✎ Edit</button><button class="btn sm danger" data-action="del-template" data-id="' + t.id + '">🗑</button></span></div>';
        }).join("") : '<div class="status-text">No templates yet — the built-in pitch is used.</div>') + "</div>" +
        '<div class="btn-row" style="margin-top:10px;"><button class="btn" data-action="add-template">+ Add template</button><button class="btn primary" data-action="save-settings">Save settings</button></div></div>' +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>📄 Offer &amp; LOI documents</h3>' +
        '<div class="meta">Customise the offer (email + PDF) and the Letter of Intent. Placeholders: <span class="kbd">{{buyer}}</span> <span class="kbd">{{contact}}</span> <span class="kbd">{{lines}}</span> <span class="kbd">{{total}}</span> <span class="kbd">{{terms}}</span> <span class="kbd">{{validity}}</span> <span class="kbd">{{payment}}</span> <span class="kbd">{{notes}}</span> <span class="kbd">{{me}}</span> <span class="kbd">{{myCompany}}</span> <span class="kbd">{{date}}</span> <span class="kbd">{{products}}</span>.</div>' +
        '<div class="field" style="margin-top:10px;"><label>Offer template (email &amp; PDF body)</label><textarea data-set="offerTemplate" style="min-height:150px;font-family:monospace;font-size:12px">' + esc(s.offerTemplate || BUILTIN_OFFER) + "</textarea></div>" +
        docFileRow("offer") +
        '<div class="field"><label>Letter of Intent (LOI) template</label><textarea data-set="loiTemplate" style="min-height:150px;font-family:monospace;font-size:12px">' + esc(s.loiTemplate || BUILTIN_LOI) + "</textarea></div>" +
        docFileRow("loi") +
        '<div class="btn-row"><button class="btn primary" data-action="save-settings">Save settings</button></div></div>' +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>📑 Trade document templates</h3>' +
        '<div class="meta">Editable bodies for the Document Vault (📄 Docs on each buyer). Same placeholders as above. You can also <strong>upload your own file</strong> (PDF/Word) per document — download it to edit outside the app, then re-upload.</div>' +
        ["sco", "icpo", "ncnda", "contract"].map(function (k) {
          var label = { sco: "Soft Corporate Offer (SCO)", icpo: "ICPO", ncnda: "NCNDA", contract: "Sales Contract" }[k];
          var val = (s.docTemplates && s.docTemplates[k]) || BUILTIN_DOCS[k];
          return '<div class="field" style="margin-top:10px;"><label>' + label + '</label><textarea data-doc="' + k + '" style="min-height:120px;font-family:monospace;font-size:12px">' + esc(val) + "</textarea></div>" + docFileRow(k);
        }).join("") +
        '<div class="btn-row"><button class="btn primary" data-action="save-settings">Save settings</button></div></div>' +
      '<div class="card" style="max-width:640px;margin-top:16px;"><h3>👥 Team sync (shared data)</h3>' +
        '<div class="meta">Share buyers, statuses and prices with teammates via the proxy. Everyone points at the same proxy URL and turns this on. Last-write-wins — click <strong>Pull</strong> to grab the latest before a big edit. Protect it with a token (proxy <span class="kbd">DATA_AUTH_TOKEN</span>).</div>' +
        '<label class="check" style="margin:12px 0;"><input type="checkbox" data-set-bool="teamSync"' + (s.teamSync ? " checked" : "") + '> Enable team sync</label>' +
        '<div class="field"><label>Sync server URL (blank = use the Apollo proxy URL above)</label><input data-set="syncServerUrl" value="' + esc(s.syncServerUrl || "") + '" placeholder="http://localhost:8787"/></div>' +
        '<div class="field"><label>Shared token (optional)</label><input data-set="syncToken" value="' + esc(s.syncToken || "") + '" placeholder="matches proxy DATA_AUTH_TOKEN"/></div>' +
        '<div class="btn-row"><button class="btn primary" data-action="save-settings">Save settings</button>' +
          '<button class="btn" data-action="team-pull">⬇ Pull from team</button>' +
          '<button class="btn" data-action="team-push">⬆ Push to team</button></div>' +
      "</div>";
  }

  /* =========================================================
     MODALS
     ========================================================= */
  function openModal(title, bodyHtml, footerHtml) {
    $("modal-root").innerHTML =
      '<div class="modal-bg" data-action="modal-bg"><div class="modal">' +
        "<header><h3>" + esc(title) + '</h3><button class="x" data-action="close-modal">×</button></header>' +
        '<div class="body">' + bodyHtml + "</div>" +
        (footerHtml ? "<footer>" + footerHtml + "</footer>" : "") +
      "</div></div>";
  }
  function closeModal() { $("modal-root").innerHTML = ""; }
  App.closeModal = closeModal;

  function companyForm(c) {
    c = c || {};
    var isEdit = !!c.id;
    var countryOpts = App.allCountries().map(function (x) {
      return '<option value="' + x.code + '"' + (c.country === x.code ? " selected" : "") + ">" + x.flag + " " + esc(x.name) + "</option>";
    }).join("");
    var checks = App.allProducts().map(function (p) {
      var on = (c.materials || []).indexOf(p.id) !== -1;
      var m = metal(p.metal);
      return '<label class="check"><input type="checkbox" data-mat="' + p.id + '"' + (on ? " checked" : "") + ">" +
        '<span class="swatch" style="width:8px;height:8px;border-radius:50%;background:' + m.color + ';display:inline-block"></span>' +
        esc(p.name) + "</label>";
    }).join("");

    function fld(key, label, ph) {
      return '<div class="field"><label>' + esc(label) + "</label>" +
        '<input data-f="' + key + '" value="' + esc(c[key] || "") + '" placeholder="' + esc(ph || "") + '"/></div>';
    }

    var body =
      fld("name", "Company name", "e.g. Aurubis AG") +
      '<div class="field-2">' +
        '<div class="field"><label>Country</label><select data-f="country">' + countryOpts + "</select></div>" +
        fld("city", "City", "Hamburg") +
      "</div>" +
      '<div class="field-2">' + fld("contactName", "Contact person", "Procurement") + fld("email", "Email", "buyer@company.com") + "</div>" +
      '<div class="field-2">' + fld("phone", "Phone", "+49 …") + fld("website", "Website", "company.com") + "</div>" +
      '<div class="field"><label>Materials they buy from you</label><div class="checks">' + checks + "</div></div>" +
      '<div class="field-2"><div class="field"><label>KYC status</label><select data-f="kycStatus">' +
        ["none", "pending", "approved", "rejected"].map(function (k) { return '<option value="' + k + '"' + ((c.kycStatus || "none") === k ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>Credit limit (USD)</label><input data-f="creditLimit" value="' + esc(c.creditLimit || "") + '"/></div></div>' +
      '<div class="field-2"><div class="field"><label>Company reg. no.</label><input data-f="registrationNo" value="' + esc(c.registrationNo || "") + '"/></div>' +
        '<div class="field"><label>VAT / tax no.</label><input data-f="vat" value="' + esc(c.vat || "") + '"/></div></div>' +
      '<div class="field"><label>Notes</label><textarea data-f="notes" placeholder="Volumes, terms, history…">' + esc(c.notes || "") + "</textarea></div>" +
      ((isEdit && c.activity && c.activity.length)
        ? '<div class="field"><label>Activity timeline</label><div class="timeline">' +
          c.activity.slice(0, 15).map(function (a) {
            return '<div class="tl"><span class="tl-date">' + esc(new Date(a.ts).toLocaleString()) + "</span> " + esc(a.text) + "</div>";
          }).join("") + "</div></div>"
        : "");

    var footer =
      '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" data-action="save-company" data-id="' + (c.id || "") + '">' + (isEdit ? "Save changes" : "Add buyer") + "</button>";

    openModal(isEdit ? "Edit buyer" : "Add buyer", body, footer);
  }

  function countryForm() {
    var body =
      '<div class="meta" style="margin-bottom:12px;">Add a market that isn\'t in the EU list (e.g. UK, Turkey, USA, UAE). It appears under <strong>My countries</strong> and in the buyer form.</div>' +
      '<div class="field-2">' +
        '<div class="field"><label>Country name</label><input data-cf="name" placeholder="e.g. Türkiye"/></div>' +
        '<div class="field"><label>Flag emoji (optional)</label><input data-cf="flag" placeholder="🇹🇷" maxlength="4"/></div>' +
      "</div>";
    var footer = '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" data-action="save-country">Add country</button>';
    openModal("Add a country", body, footer);
  }

  function productForm() {
    var metalOpts = Object.keys(App.METALS).map(function (mk) { return '<option value="' + mk + '">' + esc(App.METALS[mk].label) + "</option>"; }).join("");
    var typeOpts = ["primary", "scrap", "compound", "product"].map(function (t) { return '<option value="' + t + '">' + t + "</option>"; }).join("");
    var body = '<div class="field"><label>Product name</label><input data-p="name" placeholder="e.g. Tin ingot 99.9%, Limestone, Manganese ore"/></div>' +
      '<div class="field-2"><div class="field"><label>Base metal (for pricing)</label><select data-p="metal">' + metalOpts + "</select></div>" +
      '<div class="field"><label>Type</label><select data-p="type">' + typeOpts + "</select></div></div>" +
      '<div class="meta">It appears in buyer materials, deals, offers, margins &amp; the calculator.</div>';
    var footer = '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" data-action="save-product">Add product</button>';
    openModal("Add product", body, footer);
  }

  function contractForm(c) {
    c = c || {};
    App._pendingContractDoc = null;
    var buyerOpts = '<option value="">— counterparty —</option>' + Store.companies().map(function (x) {
      return '<option value="' + x.id + '"' + (c.buyerId === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>";
    }).join("");
    var prodOpts = '<option value="">— product —</option>' + App.allProducts().map(function (x) {
      return '<option value="' + esc(x.name) + '"' + (c.product === x.name ? " selected" : "") + ">" + esc(x.name) + "</option>";
    }).join("");
    var metalOpts = PRICE_METALS.map(function (m) { return '<option value="' + m[0] + '"' + ((c.metal || "copper") === m[0] ? " selected" : "") + ">" + m[1] + "</option>"; }).join("");
    function f(k, label, ph, type) { return '<div class="field"><label>' + label + "</label><input " + (type ? 'type="' + type + '" ' : "") + 'data-c="' + k + '" value="' + esc(c[k] != null ? c[k] : "") + '" placeholder="' + (ph || "") + '"/></div>'; }
    var body =
      '<div class="field-2"><div class="field"><label>Counterparty</label><select data-c="buyerId">' + buyerOpts + "</select></div>" +
        '<div class="field"><label>Side</label><select data-c="side">' + ["sell", "buy"].map(function (s2) { return '<option' + (c.side === s2 ? " selected" : "") + ">" + s2 + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="field-2"><div class="field"><label>Product</label><select data-c="product">' + prodOpts + "</select></div>" +
        '<div class="field"><label>Price metal (LME)</label><select data-c="metal">' + metalOpts + "</select></div></div>" +
      '<div class="field-2">' + f("qtyMt", "Quantity (MT)", "", "number") + f("tolerancePct", "Tolerance %", "10", "number") + "</div>" +
      '<div class="field"><label>QP / pricing basis</label><input data-c="qpDesc" value="' + esc(c.qpDesc || "Average LME cash over month of shipment") + '"/></div>' +
      '<div class="field-2">' + f("premium", "Premium USD/MT", "", "number") + f("marginPct", "Margin %", "", "number") + "</div>" +
      '<div class="field-2">' + f("qpAvg", "QP avg price USD/MT (when known)", "blank = use live", "number") + f("provisionalPct", "Provisional %", "90", "number") + "</div>" +
      '<div class="field-2">' + f("incoterm", "Incoterm", "CIF") + f("port", "Port", "") + "</div>" +
      '<div class="field"><label>Notes</label><textarea data-c="notes">' + esc(c.notes || "") + "</textarea></div>" +
      '<div class="field"><label>Counterparty document (their signed contract / SPA / PO they send you)</label>' +
        '<div class="docfile">' +
          (c.doc ? '<span id="contract-doc-name">📄 ' + esc(c.doc.name) + "</span>" : '<span id="contract-doc-name" class="status-text">No document attached yet</span>') +
          '<span class="p-actions">' +
            '<label class="btn sm" style="cursor:pointer">📎 Upload<input type="file" accept=".pdf,.doc,.docx,.txt,.rtf,image/*,application/pdf" style="display:none" onchange="App.onContractDocUpload(this,\'' + (c.id || "") + '\')"/></label>' +
            (c.doc ? '<button class="btn sm" data-action="view-contract-doc" data-id="' + (c.id || "") + '">👁 View</button><button class="btn sm danger" data-action="remove-contract-doc" data-id="' + (c.id || "") + '">🗑</button>' : "") +
          "</span></div></div>";
    var footer = '<button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="save-contract" data-id="' + (c.id || "") + '">Save contract</button>';
    openModal(c.id ? "Edit contract" : "New contract", body, footer);
  }

  function invoiceForm(inv) {
    inv = inv || {};
    var buyerOpts = '<option value="">— buyer —</option>' + Store.companies().map(function (x) {
      return '<option value="' + x.id + '"' + (inv.buyerId === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>";
    }).join("");
    var lines = inv.lines && inv.lines.length ? inv.lines : [{ desc: "", amount: "" }];
    var lineRows = lines.map(function (l, i) {
      return '<div class="field-2" data-line="' + i + '"><div class="field"><input data-il="desc" value="' + esc(l.desc || "") + '" placeholder="description"/></div>' +
        '<div class="field"><input data-il="amount" type="number" value="' + esc(l.amount != null ? l.amount : "") + '" placeholder="amount"/></div></div>';
    }).join("");
    function f(k, label, type) { return '<div class="field"><label>' + label + "</label><input " + (type ? 'type="' + type + '" ' : "") + 'data-iv="' + k + '" value="' + esc(inv[k] != null ? inv[k] : "") + '"/></div>'; }
    var body =
      '<div class="field-2"><div class="field"><label>Buyer</label><select data-iv="buyerId">' + buyerOpts + "</select></div>" +
        '<div class="field"><label>Type</label><select data-iv="type">' + ["proforma", "commercial", "provisional", "final"].map(function (t) { return '<option' + (inv.type === t ? " selected" : "") + ">" + t + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="field-2">' + f("date", "Date", "date") + f("dueDate", "Due date", "date") + "</div>" +
      '<div class="meta">Line items</div><div id="inv-lines">' + lineRows + "</div>" +
      '<button class="btn sm" data-action="inv-add-line">+ Line</button>' +
      '<div class="meta" style="margin-top:10px">Letter of Credit (optional)</div>' +
      '<div class="field-2">' + f("lcRef", "LC reference") + f("lcBank", "LC bank") + "</div>" +
      '<div class="field">' + '<label>LC expiry</label><input type="date" data-iv="lcExpiry" value="' + esc(inv.lcExpiry || "") + '"/></div>';
    var footer = '<button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="save-invoice" data-id="' + (inv.id || "") + '">Save invoice</button>';
    openModal(inv.id ? "Edit invoice " + esc(inv.number || "") : "New invoice", body, footer);
  }

  function dealForm(d) {
    d = d || {};
    var buyerOpts = '<option value="">— buyer —</option>' + Store.companies().map(function (c) {
      return '<option value="' + c.id + '"' + (d.buyerId === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>";
    }).join("");
    var prodOpts = '<option value="">— product —</option>' + App.allProducts().map(function (p) {
      return '<option value="' + esc(p.name) + '"' + (d.product === p.name ? " selected" : "") + ">" + esc(p.name) + "</option>";
    }).join("");
    var stageOpts = App.STAGES.map(function (s) { return '<option value="' + s.key + '"' + ((d.stage || "lead") === s.key ? " selected" : "") + ">" + esc(s.label) + "</option>"; }).join("");
    var shipStatuses = ["", "Booked", "Loading", "In transit", "Arrived", "Delivered", "Delayed"];
    var shipOpts = shipStatuses.map(function (x) { return '<option value="' + x + '"' + ((d.shipStatus || "") === x ? " selected" : "") + ">" + (x || "—") + "</option>"; }).join("");
    function df(key, label, ph, type) {
      return '<div class="field"><label>' + label + "</label><input " + (type ? 'type="' + type + '" ' : "") + 'data-d="' + key + '" value="' + esc(d[key] || "") + '" placeholder="' + (ph || "") + '"/></div>';
    }
    var body =
      '<div class="field"><label>Title</label><input data-d="title" value="' + esc(d.title || "") + '" placeholder="e.g. 200 MT copper cathode → Aurubis"/></div>' +
      '<div class="field-2"><div class="field"><label>Buyer</label><select data-d="buyerId">' + buyerOpts + "</select></div>" +
        '<div class="field"><label>Product</label><select data-d="product">' + prodOpts + "</select></div></div>" +
      '<div class="field-2"><div class="field"><label>Stage</label><select data-d="stage">' + stageOpts + "</select></div>" +
        df("value", "Revenue / value (USD)", "what you sell it for", "number") + "</div>" +
      '<div class="field-2">' + df("cost", "Your cost (USD)", "for P&L profit", "number") +
        df("eta", "ETA", "", "date") + "</div>" +
      '<div class="meta" style="margin:2px 0 8px;">🚢 Logistics (shows in the Shipments tab)</div>' +
      '<div class="field-2">' + df("bl", "B/L number", "") + df("container", "Container(s)", "") + "</div>" +
      '<div class="field-2">' + df("vessel", "Vessel", "") +
        df("imo", "Vessel IMO (for live tracking)", "") + "</div>" +
      '<div class="field"><label>Shipment status</label><select data-d="shipStatus">' + shipOpts + "</select></div>" +
      '<div class="field-2">' + df("loadPort", "Load port", "") + df("dischargePort", "Discharge port", "") + "</div>" +
      '<div class="field"><label>Notes</label><textarea data-d="notes">' + esc(d.notes || "") + "</textarea></div>";
    var footer = '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" data-action="save-deal" data-id="' + (d.id || "") + '">Save deal</button>';
    openModal(d.id ? "Edit deal" : "New deal", body, footer);
  }

  /* ---- Add / edit a custom watch metal for the Markets tab ---- */
  function customMetalForm(m) {
    m = m || {};
    var body = '<div class="meta">Track any extra metal/commodity you trade. Enter the latest price in USD (the display currency toggle converts it). Updating the price keeps a small history for the chart.</div>' +
      '<div class="field" style="margin-top:10px"><label>Name</label><input data-cm="label" value="' + esc(m.label || "") + '" placeholder="e.g. Tin, Cobalt, Magnesium, Silver"/></div>' +
      '<div class="field-2"><div class="field"><label>Latest price (USD)</label><input type="number" data-cm="value" value="' + esc(m.value == null ? "" : m.value) + '" placeholder="e.g. 28500"/></div>' +
      '<div class="field"><label>Unit</label><input data-cm="unit" value="' + esc(m.unit || "/MT") + '" placeholder="/MT or /oz"/></div></div>';
    var footer = '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" data-action="save-cmetal" data-id="' + (m.id || "") + '">Save metal</button>';
    openModal(m.id ? "Update metal" : "Add metal", body, footer);
  }


  function templateForm(t) {
    t = t || {};
    var body =
      '<div class="field"><label>Template name</label><input data-tf="name" value="' + esc(t.name || "") + '" placeholder="Intro / Follow-up / Price alert"/></div>' +
      '<div class="field"><label>Subject</label><input data-tf="subject" value="' + esc(t.subject || "") + '" placeholder="{{myCompany}} — {{products}}"/></div>' +
      '<div class="field"><label>Body</label><textarea data-tf="body" style="min-height:200px" placeholder="Dear {{contact}}, …">' + esc(t.body || "") + "</textarea></div>" +
      '<div class="meta">Placeholders: <span class="kbd">{{contact}}</span> <span class="kbd">{{company}}</span> <span class="kbd">{{products}}</span> <span class="kbd">{{prices}}</span> <span class="kbd">{{me}}</span> <span class="kbd">{{myCompany}}</span></div>';
    var footer = '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" data-action="save-template" data-id="' + (t.id || "") + '">Save template</button>';
    openModal(t.id ? "Edit template" : "Add template", body, footer);
  }

  /* ---- Offer / quote generator ---- */
  var BUILTIN_OFFER =
    "Dear {{contact}},\n\nThank you for your interest. Please find our offer below:\n\n{{lines}}\n\n" +
    "Total: {{total}}\nTerms: {{terms}} · Validity: {{validity}} · Payment: {{payment}}\n{{notes}}\n\n" +
    "Prices are formula-linked to the prevailing LME and confirmed at contract.\n\nBest regards,\n{{me}}\n{{myCompany}}";
  var BUILTIN_LOI =
    "LETTER OF INTENT\n\nDate: {{date}}\nFrom: {{myCompany}}\nTo: {{buyer}}\n\n" +
    "We, {{myCompany}}, hereby confirm our firm intention to supply the following material(s) to {{buyer}} " +
    "under the terms stated below:\n\n{{lines}}\n\nTotal value: {{total}}\nDelivery terms: {{terms}}\n" +
    "Validity: {{validity}}\nPayment: {{payment}}\n\nThis Letter of Intent is issued in good faith and is subject to the " +
    "signing of a formal sales and purchase contract and mutually agreed terms and conditions.\n\nAuthorised signatory:\n{{me}}\n{{myCompany}}";

  function applyTpl(tpl, map) {
    return String(tpl || "").replace(/\{\{\w+\}\}/g, function (m) { return map[m] != null ? map[m] : m; });
  }

  var BUILTIN_DOCS = {
    sco: "SOFT CORPORATE OFFER (SCO)\n\nDate: {{date}}\nSeller: {{myCompany}}\nBuyer: {{buyer}}\n\n" +
      "We are pleased to offer the following non-ferrous material(s) on a soft-offer basis:\n\n{{lines}}\n\n" +
      "Price: formula-linked to the prevailing LME, confirmed at contract\nDelivery: {{terms}}\nPayment: {{payment}}\n" +
      "Validity: {{validity}}\n\nThis SCO is subject to final contract and mutually agreed terms.\n\n{{me}}\n{{myCompany}}",
    icpo: "IRREVOCABLE CORPORATE PURCHASE ORDER (ICPO)\n\nDate: {{date}}\nBuyer: {{buyer}}\nSeller: {{myCompany}}\n\n" +
      "The Buyer hereby places an irrevocable corporate purchase order for:\n\n{{lines}}\n\n" +
      "Delivery: {{terms}}\nPayment: {{payment}}\n\nThis ICPO is issued in good faith pending the Seller's full corporate offer and draft contract.\n\nAuthorised signatory: {{contact}}\n{{buyer}}",
    ncnda: "NON-CIRCUMVENTION, NON-DISCLOSURE AGREEMENT (NCNDA)\n\nDate: {{date}}\n\n" +
      "This agreement is entered into between {{myCompany}} and {{buyer}}.\n\n" +
      "1. Both parties agree not to circumvent, avoid, bypass or obviate each other in any transaction.\n" +
      "2. Both parties agree to keep confidential all information, contacts and terms exchanged.\n" +
      "3. This agreement is valid for the duration of the business relationship and 2 years thereafter.\n\n" +
      "Signed for {{myCompany}}: {{me}}\nSigned for {{buyer}}: {{contact}}",
    contract: "SALES CONTRACT\n\nContract date: {{date}}\nSeller: {{myCompany}}\nBuyer: {{buyer}}\n\n" +
      "1. Commodity & quantity:\n{{lines}}\n\n2. Price: formula-linked to LME, confirmed per shipment.\n" +
      "3. Delivery terms: {{terms}}\n4. Payment: {{payment}}\n5. Inspection: SGS or equivalent at loading.\n" +
      "6. Validity: {{validity}}\n\nThis contract is binding upon signature by both parties.\n\n" +
      "Seller: {{me}}, {{myCompany}}\nBuyer: {{contact}}, {{buyer}}"
  };

  function docMap(c) {
    var s = Store.settings();
    var products = (c.materials || []).map(function (id) { var p = App.productById(id); return p ? p.name : null; }).filter(Boolean);
    var lines = (c._dealLines != null) ? (c._dealLines || "  • (on request)")
      : (products.length ? products.map(function (n) { return "  • " + n + " — qty/price on request"; }).join("\n") : "  • (materials on request)");
    return {
      "{{buyer}}": c.name || "the Buyer",
      "{{contact}}": c.contactName || "________",
      "{{lines}}": lines,
      "{{total}}": (c._dealTotal != null && c._dealTotal !== "") ? c._dealTotal : "on request",
      "{{terms}}": c._terms || "CIF (port TBA)",
      "{{payment}}": "TT / LC at sight",
      "{{validity}}": "7 days",
      "{{notes}}": c.notes || "",
      "{{me}}": s.senderName || "________",
      "{{myCompany}}": s.companyName || "________",
      "{{date}}": new Date().toLocaleDateString(),
      "{{products}}": products.join(", ")
    };
  }
  function docTemplate(type) {
    var s = Store.settings();
    if (type === "offer") return s.offerTemplate || BUILTIN_OFFER;
    if (type === "loi") return s.loiTemplate || BUILTIN_LOI;
    return (s.docTemplates && s.docTemplates[type]) || BUILTIN_DOCS[type] || "";
  }
  // Upload / download / remove an external template file for a doc type.
  function docFileRow(key) {
    var f = Store.docFile(key);
    var input = '<label class="btn sm" style="cursor:pointer">📎 Upload file<input type="file" accept=".pdf,.doc,.docx,.txt,.rtf,application/pdf" style="display:none" onchange="App.onDocFileUpload(this,\'' + key + '\')"/></label>';
    if (f) {
      return '<div class="docfile"><span>📄 ' + esc(f.name) + "</span>" +
        '<span class="p-actions">' + input +
        '<button class="btn sm" data-action="download-docfile" data-key="' + key + '">⬇ Download to edit</button>' +
        '<button class="btn sm danger" data-action="remove-docfile" data-key="' + key + '">🗑</button></span></div>';
    }
    return '<div class="docfile"><span class="status-text">No file uploaded — the text template above is used.</span>' + input + "</div>";
  }
  App.onDocFileUpload = function (input, key) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast("File too large (max ~2 MB to fit in browser storage)."); input.value = ""; return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        Store.setDocFile(key, { name: file.name, mime: file.type, data: String(reader.result) });
        render(); toast("Uploaded " + file.name + ".");
      } catch (e) { toast("Could not save file (storage full?)."); }
    };
    reader.readAsDataURL(file);
  };
  App.downloadDataUrl = function (dataUrl, name) {
    var aEl = document.createElement("a");
    aEl.href = dataUrl; aEl.download = name || "template";
    document.body.appendChild(aEl); aEl.click();
    setTimeout(function () { document.body.removeChild(aEl); }, 0);
  };
  // Open a stored data-URL (PDF/doc) in a new tab via a Blob URL (works for large files).
  App.openDataUrl = function (dataUrl) {
    try {
      var parts = dataUrl.split(","), mime = ((parts[0] || "").match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
      var bin = atob(parts[1] || ""), len = bin.length, arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([arr], { type: mime }));
      window.open(url, "_blank");
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) { try { window.open(dataUrl, "_blank"); } catch (_e) {} }
  };
  // Attach a counterparty document to a contract (or hold it for a new one).
  App.onContractDocUpload = function (input, id) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("File too large (max ~4 MB to fit browser storage)."); input.value = ""; return; }
    var r = new FileReader();
    r.onload = function () {
      var doc = { name: file.name, mime: file.type, data: String(r.result) };
      if (id) { Store.updateContract(id, { doc: doc }); render(); toast("Attached " + file.name + "."); }
      else {
        App._pendingContractDoc = doc;
        var lab = document.getElementById("contract-doc-name");
        if (lab) { lab.textContent = "📄 " + file.name; lab.className = ""; }
        toast("Attached " + file.name + " — saves with the contract.");
      }
    };
    r.readAsDataURL(file);
  };
  App.fillDoc = function () {
    var c = App._docCompany || {};
    var type = ($("doc-type") || {}).value;
    if ($("doc-body")) $("doc-body").value = applyTpl(docTemplate(type), docMap(c));
  };
  function docForm(c) {
    App._docCompany = c || {};
    App._docRecipient = { email: c.email || "", name: c.name || "", logId: c.id || "" };
    var types = [["offer", "Offer"], ["loi", "Letter of Intent (LOI)"], ["sco", "Soft Corporate Offer (SCO)"], ["icpo", "ICPO"], ["ncnda", "NCNDA"], ["contract", "Sales Contract"]];
    var sel = types.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + "</option>"; }).join("");
    var body = '<div class="field"><label>Document type</label><select id="doc-type" onchange="App.fillDoc()">' + sel + "</select></div>" +
      '<div class="field"><label>Preview (edit before sending; templates live in Settings)</label>' +
      '<textarea id="doc-body" style="min-height:260px;font-family:monospace;font-size:12px"></textarea></div>';
    var footer = '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn" data-action="doc-dl-file">📎 Download attached file</button>' +
      '<button class="btn" data-action="doc-print">🖨 Print / PDF</button>' +
      '<button class="btn primary" data-action="doc-email">✉️ Email</button>';
    openModal("📄 Documents — " + (c.name || ""), body, footer);
    setTimeout(function () { App.fillDoc(); }, 0);
  }

  function applyTplPlaceholder() {}
  function offerMap(company, o) {
    var s = Store.settings();
    var lt = offerLinesText(o);
    return {
      "{{buyer}}": company.name || "your company",
      "{{contact}}": company.contactName ? company.contactName.split(/\s+/)[0] : "Sir or Madam",
      "{{lines}}": lt.rows,
      "{{total}}": lt.grand,
      "{{terms}}": o.inco + (o.port ? " " + o.port : ""),
      "{{validity}}": o.validity,
      "{{payment}}": o.payment,
      "{{notes}}": o.notes || "",
      "{{me}}": s.senderName || "",
      "{{myCompany}}": s.companyName || "",
      "{{date}}": new Date().toLocaleDateString(),
      "{{products}}": o.lines.map(function (l) { return l.name; }).join(", ")
    };
  }

  function productBaseUSD(p) {
    var pr = Store.prices();
    if (!p) return null;
    if (p.metal === "stainless") return pr.rows.nickel && pr.rows.nickel.value;
    if (p.metal === "brass") return Prices.brassIndicative(pr);
    if (p.metal === "iron") return null;
    return pr.rows[p.metal] && pr.rows[p.metal].value;
  }
  function productOfferUnitUSD(p) {
    var base = productBaseUSD(p);
    if (base == null) return null;
    var marginPct = Number((Store.settings().margins || {})[p.id] || 0);
    var unit = base * (1 + marginPct / 100);
    if (p.metal === "aluminium") {
      var prem = Store.prices().rows.aluminium && Store.prices().rows.aluminium.premium;
      if (prem) unit += Number(prem);
    }
    return Math.round(unit);
  }

  function offerForm(c) {
    var mats = (c.materials || []).map(function (id) { return App.productById(id); }).filter(Boolean);
    var rowsHtml = mats.length ? mats.map(function (p) {
      var unit = productOfferUnitUSD(p);
      return '<tr data-pid="' + p.id + '">' +
        "<td>" + esc(p.name) + "</td>" +
        '<td><input type="number" class="q" min="0" value="25" data-up="' + (unit == null ? "" : unit) + '" oninput="App.recalcOffer()" style="width:90px"/></td>' +
        '<td class="up">' + (unit == null ? "—" : Prices.money(unit)) + "</td>" +
        '<td class="lt">' + (unit == null ? "—" : Prices.money(unit * 25)) + "</td>" +
        "</tr>";
    }).join("") : '<tr><td colspan="4" class="status-text">No materials assigned — add some via Edit, then make an offer.</td></tr>';

    var incoOpts = ["CIF", "FOB", "CFR", "EXW", "DAP"].map(function (i) { return '<option value="' + i + '">' + i + "</option>"; }).join("");
    var body =
      '<div class="meta" style="margin-bottom:8px;">Prices = live metal price + your margin (set margins in Settings). Edit qty; review, then print or email. Currency: <strong>' + (Store.settings().displayCurrency || "USD") + "</strong>.</div>" +
      '<table class="sheet offer"><thead><tr><th>Product</th><th>Qty (MT)</th><th>Unit</th><th>Line total</th></tr></thead><tbody>' + rowsHtml + "</tbody>" +
      '<tfoot><tr><td colspan="3" style="text-align:right;font-weight:700">Total</td><td id="offer-grand" style="font-weight:700"></td></tr></tfoot></table>' +
      '<div class="field-2" style="margin-top:12px;">' +
        '<div class="field"><label>Incoterm</label><select id="offer-inco">' + incoOpts + "</select></div>" +
        '<div class="field"><label>Delivery port</label><input id="offer-port" placeholder="e.g. Rotterdam"/></div>' +
      "</div>" +
      '<div class="field-2">' +
        '<div class="field"><label>Validity</label><input id="offer-valid" value="7 days" /></div>' +
        '<div class="field"><label>Payment</label><input id="offer-pay" value="TT / LC at sight" /></div>' +
      "</div>" +
      '<div class="field"><label>Notes</label><input id="offer-notes" placeholder="Inspection: SGS; packing: …"/></div>' +
      '<label class="check" style="margin-top:4px;"><input type="checkbox" id="offer-loi"> Attach official Letter of Intent (LOI) — editable in Settings</label>';
    var footer = '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn" data-action="print-offer" data-id="' + c.id + '">🖨 Print / PDF</button>' +
      '<button class="btn primary" data-action="email-offer" data-id="' + c.id + '">✉️ Email offer</button>';
    openModal("💰 Offer — " + (c.name || "buyer"), body, footer);
    setTimeout(App.recalcOffer, 0);
  }

  App.recalcOffer = function () {
    var modal = document.querySelector(".modal");
    if (!modal) return;
    var grandUSD = 0;
    modal.querySelectorAll("tbody tr[data-pid]").forEach(function (tr) {
      var inp = tr.querySelector(".q"); if (!inp) return;
      var unit = Number(inp.getAttribute("data-up"));
      var qty = Number(inp.value) || 0;
      if (!isNaN(unit) && inp.getAttribute("data-up") !== "") {
        tr.querySelector(".lt").textContent = Prices.money(unit * qty);
        grandUSD += unit * qty;
      }
    });
    var g = modal.querySelector("#offer-grand"); if (g) g.textContent = Prices.money(grandUSD);
  };

  function readOffer(modal) {
    var lines = [];
    modal.querySelectorAll("tbody tr[data-pid]").forEach(function (tr) {
      var inp = tr.querySelector(".q"); if (!inp || inp.getAttribute("data-up") === "") return;
      var p = App.productById(tr.getAttribute("data-pid"));
      var unit = Number(inp.getAttribute("data-up")); var qty = Number(inp.value) || 0;
      lines.push({ name: p ? p.name : "", qty: qty, unit: unit, total: unit * qty });
    });
    return {
      lines: lines,
      inco: (modal.querySelector("#offer-inco") || {}).value || "",
      port: (modal.querySelector("#offer-port") || {}).value || "",
      validity: (modal.querySelector("#offer-valid") || {}).value || "",
      payment: (modal.querySelector("#offer-pay") || {}).value || "",
      notes: (modal.querySelector("#offer-notes") || {}).value || ""
    };
  }

  function offerLinesText(o) {
    var sym = Prices.currencySymbol();
    var rows = o.lines.map(function (l) {
      return "  • " + l.name + " — " + l.qty + " MT @ " + sym + Prices.fmt(Prices.toDisplay(l.unit)) + "/MT = " + sym + Prices.fmt(Prices.toDisplay(l.total));
    }).join("\n");
    var grand = o.lines.reduce(function (a, l) { return a + l.total; }, 0);
    return { rows: rows, grand: sym + Prices.fmt(Prices.toDisplay(grand)) };
  }

  function pricesForm() {
    var p = Store.prices();
    function row(r) {
      var rr = p.rows[r.key] || {};
      var unit = r.unit || "USD/MT";
      var prem = r.hasPremium
        ? '<div class="field"><label>' + esc(r.premiumLabel || "Premium") + ' (USD/MT)</label><input type="number" data-price-prem="' + r.key + '" value="' + (rr.premium == null ? "" : rr.premium) + '" placeholder="e.g. 290"/></div>'
        : "";
      return '<div class="field-2"><div class="field"><label>' + esc(r.label) + " (" + esc(unit) + ")</label>" +
        '<input type="number" data-price="' + r.key + '" value="' + (rr.value == null ? "" : rr.value) + '" placeholder="e.g. 9000"/></div>' + prem + "</div>";
    }
    var body =
      '<div class="notice">Enter today\'s prices. <strong>Gold, Copper &amp; Aluminium auto-fill from the free feed</strong>; ' +
      '<strong>Zinc, Lead, Nickel and the premiums have no free source</strong>, so set them here once (they persist and show on the ticker). ' +
      'Aluminium EU premium reference: <a href="' + App.PREMIUM_SOURCE_URL + '" target="_blank" rel="noopener">LME premium page</a>.</div>' +
      App.PRICE_ROWS.map(function (r) { return row(r); }).join("") +
      '<div class="field"><label>Source label</label><input data-price-src value="' + esc(p.source) + '" placeholder="Manual / LME / SMM"/></div>';
    var footer =
      '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" data-action="save-prices">Save prices</button>';
    openModal("Update prices & premiums", body, footer);
  }

  function importForm() {
    var body =
      '<div class="notice">📋 New here? <strong>Load the EU starter list</strong> — ' + (App.EU_SEED ? App.EU_SEED.length : 0) +
      ' real EU non-ferrous producers & recyclers as research leads, then use <strong>👥 Find buyers</strong> to pull their contacts.' +
      '<div style="margin-top:8px;"><button class="btn primary sm" data-action="load-eu-seed">Load EU starter list</button></div></div>' +
      '<div class="notice">Or paste <strong>CSV</strong> (with a header row) or a previously exported <strong>JSON</strong> backup.</div>' +
      '<div class="meta" style="margin-bottom:8px;">CSV columns recognised: <span class="kbd">name</span> <span class="kbd">country</span> <span class="kbd">city</span> ' +
      '<span class="kbd">contact</span> <span class="kbd">email</span> <span class="kbd">phone</span> <span class="kbd">website</span> ' +
      '<span class="kbd">materials</span> <span class="kbd">notes</span>. ' +
      'For materials use product names or ids separated by <span class="kbd">;</span>. This is exactly how an Apollo.io export can be mapped.</div>' +
      '<div class="field"><textarea id="import-text" style="min-height:200px;font-family:monospace;font-size:12px;" placeholder="name,country,city,contact,email,phone,website,materials\nAurubis AG,DE,Hamburg,Procurement,buyer@example.com,+49...,aurubis.com,copper-cathode;cu-scrap-millberry"></textarea></div>';
    var footer =
      '<button class="btn" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" data-action="do-import">Import</button>';
    openModal("Import buyers", body, footer);
  }

  function openPeoplePicker(company, res) {
    var people = res.people || [];
    var mockNote = res.mock
      ? '<div class="notice warn">Proxy is in <strong>MOCK mode</strong> (no API key set) — these are sample contacts. Set APOLLO_API_KEY in the proxy\'s .env for real data.</div>'
      : "";
    var revealNote = (!App.Store.settings().revealContacts && people.some(function (p) { return p.locked; }))
      ? '<div class="notice">Some emails are 🔒 locked. Enable “Reveal emails/phones” in Settings to unlock them (uses Apollo credits).</div>'
      : "";

    var rows = people.length ? people.map(function (p) {
      var enc = encodeURIComponent(JSON.stringify(p));
      var contact = p.email ? ('✉️ ' + esc(p.email)) : (p.locked ? "🔒 email locked" : "no email");
      return '<label class="pick"><input type="checkbox" data-person="' + enc + '" ' + (p.email ? "checked" : "") + ">" +
        '<div><div class="pick-name">' + esc(p.name || "—") + ' <small>' + esc(p.seniority || "") + "</small></div>" +
        '<div class="pick-title">' + esc(p.title || "") + "</div>" +
        '<div class="pick-contact">' + contact + (p.linkedin ? ' · <a href="' + esc(p.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a>' : "") + "</div></div></label>";
    }).join("") : '<div class="empty"><div class="big">🔍</div><p>No matching procurement/buyer contacts found for this domain.</p></div>';

    var body = mockNote + revealNote +
      '<div class="meta" style="margin-bottom:10px;">Found ' + people.length + " contact(s) at <strong>" + esc(company.name) + "</strong> matching buyer / procurement / trader roles.</div>" +
      '<div class="pick-list">' + rows + "</div>";
    var footer = '<button class="btn" data-action="close-modal">Cancel</button>' +
      (people.length ? '<button class="btn primary" data-action="save-selected-people" data-id="' + company.id + '">Add selected</button>' : "");
    openModal("👥 Buyers at " + company.name, body, footer);
  }

  function openCompanyPicker(countryCode, res) {
    var country = App.countryByCode(countryCode);
    var companies = res.companies || [];
    var mockNote = res.mock
      ? '<div class="notice warn">Proxy is in <strong>MOCK mode</strong> — these are samples. Set APOLLO_API_KEY for real company discovery.</div>'
      : "";
    var rows = companies.length ? companies.map(function (c) {
      var enc = encodeURIComponent(JSON.stringify(c));
      return '<label class="pick"><input type="checkbox" data-company="' + enc + '" ' + (c.domain ? "checked" : "") + ">" +
        '<div><div class="pick-name">' + esc(c.name || "—") + "</div>" +
        '<div class="pick-contact">' + (c.domain ? "🌐 " + esc(c.domain) : "no website") + (c.city ? " · " + esc(c.city) : "") + "</div></div></label>";
    }).join("") : '<div class="empty"><div class="big">🔍</div><p>No companies returned. Try again or adjust Apollo filters.</p></div>';

    var body = mockNote +
      '<div class="meta" style="margin-bottom:10px;">Found ' + companies.length + " real companies in <strong>" + esc(country ? country.name : countryCode) +
      "</strong>. Add the ones you want, then run <strong>Find buyers (all)</strong> to pull verified emails.</div>" +
      '<div class="pick-list">' + rows + "</div>";
    var footer = '<button class="btn" data-action="close-modal">Cancel</button>' +
      (companies.length ? '<button class="btn primary" data-action="save-discovered" data-country="' + countryCode + '">Add selected</button>' : "");
    openModal("🔎 Discover companies — " + (country ? country.name : countryCode), body, footer);
  }

  /* Bulk: find buyers for every company (optionally in one country) with a
     polite delay between Apollo calls so we don't hammer rate limits. */
  function bulkFindBuyers(countryCode) {
    var list = (countryCode ? Store.companiesByCountry(countryCode) : Store.companies())
      .filter(function (c) { return (c.website || "").trim(); });
    if (!list.length) {
      toast("No companies with a website here. Add websites first so Apollo can match them.");
      return;
    }
    var settings = Store.settings();
    var warn = settings.revealContacts
      ? "\n\nHeads up: 'Reveal emails/phones' is ON, so this spends Apollo credits for each company."
      : "";
    if (!confirm("Find buyer/procurement contacts for " + list.length + " company(ies) via Apollo?" + warn)) return;

    var i = 0, totalPeople = 0, failed = 0;
    var DELAY = 1300; // ms between calls — rate-limit friendly

    function step() {
      if (i >= list.length) {
        render();
        toast("Done — added " + totalPeople + " contact(s) across " + list.length +
          " company(ies)" + (failed ? " · " + failed + " failed (no match / error)." : "."));
        return;
      }
      var c = list[i];
      toast("Apollo " + (i + 1) + "/" + list.length + ": " + (c.name || "company") + "…");
      App.Apollo.findBuyers(c).then(function (res) {
        totalPeople += Store.addPeople(c.id, res.people || []);
      }).catch(function () {
        failed++;
      }).then(function () {
        i++;
        setTimeout(step, DELAY);
      });
    }
    step();
  }

  /* Collect every email address tied to a company (primary + discovered people). */
  function companyEmails(c) {
    var set = {};
    if (c.email) set[c.email.toLowerCase()] = 1;
    (c.people || []).forEach(function (p) { if (p.email) set[p.email.toLowerCase()] = 1; });
    return Object.keys(set);
  }

  /* Sync traffic-light status from Gmail: reply -> green, contacted -> yellow. */
  function syncGmail() {
    var companies = Store.companies();
    var emails = [];
    companies.forEach(function (c) { emails = emails.concat(companyEmails(c)); });
    emails = emails.filter(function (e, i) { return emails.indexOf(e) === i; });
    if (!emails.length) { toast("No buyer emails yet — add or find contacts first."); return; }

    toast("Syncing with Gmail…");
    App.Gmail.check(emails).then(function (results) {
      // detect "not connected" responses
      var notConnected = emails.every(function (e) {
        var r = results[e]; return r && r.error && /not connected|not configured/i.test(r.error);
      });
      if (notConnected) {
        toast("Gmail isn't connected yet — open Settings → Connect Gmail.");
        return;
      }
      var greens = 0, yellows = 0;
      companies.forEach(function (c) {
        // Update each discovered contact individually first.
        (c.people || []).forEach(function (p, idx) {
          if (!p.email) return;
          var r = results[p.email.toLowerCase()];
          if (!r) return;
          if (r.replied && p.status !== "green") { Store.setPersonStatus(c.id, idx, "green", { lastReplyAt: Date.now() }); }
          else if (r.contacted && (p.status || "red") === "red") { Store.setPersonStatus(c.id, idx, "yellow", { lastEmailAt: p.lastEmailAt || Date.now() }); }
        });
        // Then the company headline (its own primary email, or rolled up from people).
        var mine = companyEmails(c);
        var replied = mine.some(function (e) { return results[e] && results[e].replied; });
        var contacted = mine.some(function (e) { return results[e] && results[e].contacted; });
        if (replied) {
          if (c.status !== "green") { Store.setStatus(c.id, "green", { lastReplyAt: Date.now() }); greens++; }
        } else if (contacted && c.status === "red") {
          Store.setStatus(c.id, "yellow", { lastEmailAt: c.lastEmailAt || Date.now() }); yellows++;
        }
      });
      render();
      toast("Gmail synced — " + greens + " new reply(ies) 🟢, " + yellows + " marked awaiting 🟡.");
    }).catch(function (err) { toast(err.message); });
  }

  /* Settings: show the current Gmail connection state. */
  function refreshGmailStatus() {
    var el = document.getElementById("gmail-status");
    if (!el) return;
    App.Gmail.status().then(function (s) {
      if (s.unreachable) el.innerHTML = "⚪ Proxy not reachable — start it to use Gmail sync.";
      else if (!s.configured) el.innerHTML = "⚪ Not configured — add Google OAuth credentials to the proxy's .env (see README).";
      else if (s.connected) el.innerHTML = "🟢 Connected" + (s.email ? " as <strong>" + esc(s.email) + "</strong>" : "") + (s.mock ? " (mock)" : "");
      else el.innerHTML = "🟡 Configured but not connected — click “Connect Gmail”.";
    });
  }

  /* =========================================================
     CSV PARSER (simple, quote-aware)
     ========================================================= */
  function parseCSV(text) {
    var rows = [], row = [], cur = "", q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { q = false; }
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ",") { row.push(cur); cur = ""; }
        else if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && text[i + 1] === "\n") i++;
          row.push(cur); rows.push(row); row = []; cur = "";
        } else cur += ch;
      }
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
    if (!rows.length) return [];
    var headers = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
    return rows.map(function (r) {
      var o = {};
      headers.forEach(function (h, idx) { o[h] = (r[idx] || "").trim(); });
      return o;
    });
  }

  /* =========================================================
     EVENT HANDLING (delegated)
     ========================================================= */
  function readForm(scope) {
    var data = {};
    scope.querySelectorAll("[data-f]").forEach(function (el) { data[el.getAttribute("data-f")] = el.value.trim(); });
    var mats = [];
    scope.querySelectorAll("[data-mat]:checked").forEach(function (el) { mats.push(el.getAttribute("data-mat")); });
    data.materials = mats;
    return data;
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-nav]");
    if (t) {
      var nav = t.getAttribute("data-nav");
      if (nav.indexOf("country:") === 0) { route = { view: "country", country: nav.split(":")[1] }; }
      else { route = { view: nav, country: null }; }
      query = ""; filterStatus = ""; filterMetal = "";
      render();
      return;
    }

    var a = e.target.closest("[data-action]");
    if (!a) return;
    var action = a.getAttribute("data-action");
    var id = a.getAttribute("data-id");
    var company = id ? Store.companyById(id) : null;

    switch (action) {
      case "modal-bg":
        if (e.target === a) closeModal();
        break;
      case "close-modal": closeModal(); break;

      case "add-company":
        companyForm({ country: a.getAttribute("data-country") || (route.country || "DE") });
        break;

      case "add-country": countryForm(); break;
      case "save-country": {
        var cm = a.closest(".modal");
        var nm = cm.querySelector("[data-cf=name]").value.trim();
        var fl = cm.querySelector("[data-cf=flag]").value.trim();
        if (!nm) { toast("Enter a country name."); break; }
        var nc = Store.addCustomCountry(nm, fl);
        closeModal();
        route = { view: "country", country: nc.code };
        render(); toast("Added " + nc.name + " — add buyers to it now.");
        break;
      }
      case "remove-country": {
        var rc = App.countryByCode(a.getAttribute("data-country"));
        if (rc && confirm("Remove " + rc.name + " and its buyers from the app?")) {
          Store.removeCustomCountry(rc.code);
          route = { view: "dashboard", country: null };
          render(); toast(rc.name + " removed.");
        }
        break;
      }

      case "sheet-add-cat": Store.addSheetCategory("New category"); render(); break;
      case "add-deal": dealForm(); break;
      case "add-contract": contractForm(); break;
      case "edit-contract": contractForm(Store.contracts().find(function (x) { return x.id === id; })); break;
      case "del-contract": if (confirm("Delete this contract?")) { Store.deleteContract(id); render(); } break;
      case "save-contract": {
        var cm = a.closest(".modal"); var data = {};
        cm.querySelectorAll("[data-c]").forEach(function (el) { data[el.getAttribute("data-c")] = el.value; });
        if (App._pendingContractDoc) data.doc = App._pendingContractDoc;
        if (id) Store.updateContract(id, data); else Store.addContract(data);
        App._pendingContractDoc = null;
        closeModal(); render(); toast(id ? "Contract updated." : "Contract added.");
        break;
      }
      case "view-contract-doc": {
        var vdoc = id ? (Store.contracts().find(function (x) { return x.id === id; }) || {}).doc : App._pendingContractDoc;
        if (vdoc && vdoc.data) App.openDataUrl(vdoc.data); else toast("No document attached.");
        break;
      }
      case "remove-contract-doc": {
        if (id) { Store.updateContract(id, { doc: null }); render(); toast("Document removed."); }
        else {
          App._pendingContractDoc = null;
          var lab = document.getElementById("contract-doc-name");
          if (lab) { lab.textContent = "No document attached yet"; lab.className = "status-text"; }
        }
        break;
      }
      case "contract-invoice": {
        var ct = Store.contracts().find(function (x) { return x.id === id; });
        if (!ct) break;
        var val = contractValueUSD(ct), prov = val * (Number(ct.provisionalPct) || 100) / 100;
        var d = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        Store.addInvoice({ buyerId: ct.buyerId, contractId: ct.id, type: "provisional", dueDate: d,
          lines: [{ desc: (ct.product || "Material") + " — " + (ct.qtyMt || 0) + " MT (provisional " + (ct.provisionalPct || 100) + "%)", amount: Math.round(prov) }] });
        route = { view: "invoices", country: null }; render(); toast("Provisional invoice created.");
        break;
      }

      case "add-invoice": invoiceForm(); break;
      case "edit-invoice": invoiceForm(Store.invoices().find(function (x) { return x.id === id; })); break;
      case "del-invoice": if (confirm("Delete this invoice?")) { Store.deleteInvoice(id); render(); } break;
      case "invoice-paid": {
        var iv = Store.invoices().find(function (x) { return x.id === id; });
        if (iv) { Store.updateInvoice(id, { status: "paid", paidAmount: invoiceTotal(iv), paidDate: new Date().toISOString().slice(0, 10) }); render(); toast("Invoice marked paid."); }
        break;
      }
      case "inv-add-line": {
        var lc = a.closest(".modal").querySelector("#inv-lines");
        var n = lc.querySelectorAll("[data-line]").length;
        var div = document.createElement("div"); div.className = "field-2"; div.setAttribute("data-line", n);
        div.innerHTML = '<div class="field"><input data-il="desc" placeholder="description"/></div><div class="field"><input data-il="amount" type="number" placeholder="amount"/></div>';
        lc.appendChild(div);
        break;
      }
      case "save-invoice": {
        var im = a.closest(".modal"); var data = {};
        im.querySelectorAll("[data-iv]").forEach(function (el) { data[el.getAttribute("data-iv")] = el.value; });
        var lines = [];
        im.querySelectorAll("#inv-lines [data-line]").forEach(function (row) {
          var desc = row.querySelector('[data-il="desc"]').value, amount = row.querySelector('[data-il="amount"]').value;
          if (desc || amount) lines.push({ desc: desc, amount: Number(amount) || 0 });
        });
        data.lines = lines;
        if (id) Store.updateInvoice(id, data); else Store.addInvoice(data);
        closeModal(); render(); toast(id ? "Invoice updated." : "Invoice created.");
        break;
      }
      case "invoice-print": {
        var pin = Store.invoices().find(function (x) { return x.id === id; }); if (!pin) break;
        var pb = pin.buyerId ? Store.companyById(pin.buyerId) : null; var ps3 = Store.settings();
        var w3 = window.open("", "_blank"); if (!w3) { toast("Allow pop-ups to print."); break; }
        var lr = (pin.lines || []).map(function (l) { return "<tr><td>" + esc(l.desc) + "</td><td style='text-align:right'>" + Prices.money(Number(l.amount) || 0) + "</td></tr>"; }).join("");
        w3.document.write("<html><head><title>" + esc(pin.number) + "</title><style>body{font-family:Arial;max-width:720px;margin:32px auto;color:#111}table{width:100%;border-collapse:collapse;margin:14px 0}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}.r{text-align:right}.muted{color:#666;font-size:13px}</style></head><body>" +
          "<h1>" + esc(ps3.companyName || "") + "</h1><div class='muted'>" + esc(ps3.senderEmail || "") + (ps3.phone ? " · " + esc(ps3.phone) : "") + "</div>" +
          "<h2>" + esc(pin.type.toUpperCase()) + " INVOICE " + esc(pin.number) + "</h2>" +
          "<p><strong>To:</strong> " + esc(pb ? pb.name : "") + "<br><strong>Date:</strong> " + esc(pin.date) + " · <strong>Due:</strong> " + esc(pin.dueDate || "—") +
          (pin.lcRef ? "<br><strong>LC:</strong> " + esc(pin.lcRef) + " " + esc(pin.lcBank || "") : "") + "</p>" +
          "<table><thead><tr><th>Description</th><th class='r'>Amount</th></tr></thead><tbody>" + lr +
          "<tr><td class='r'><strong>Total</strong></td><td class='r'><strong>" + Prices.money(invoiceTotal(pin)) + "</strong></td></tr></tbody></table>" +
          "</body></html>");
        w3.document.close(); w3.focus(); setTimeout(function () { w3.print(); }, 300);
        break;
      }

      case "add-hedge": Store.addHedge(); render(); break;
      case "del-hedge": Store.deleteHedge(id); render(); break;

      case "screen-all": {
        var flagged = 0;
        Store.companies().forEach(function (c) {
          var hits = App.screenSanctions(c.name + " " + ((App.countryByCode(c.country) || {}).name || ""));
          Store.updateCompany(c.id, { sanctionsFlag: hits.length ? hits.join(", ") : "" });
          if (hits.length) flagged++;
        });
        render(); toast(flagged ? (flagged + " counterparties flagged — review before contracting.") : "No matches in the indicative screen.");
        break;
      }
      case "add-product": productForm(); break;
      case "save-product": {
        var pmodal = a.closest(".modal");
        var pd = {};
        pmodal.querySelectorAll("[data-p]").forEach(function (el) { pd[el.getAttribute("data-p")] = el.value; });
        if (!pd.name) { toast("Enter a product name."); break; }
        Store.addCustomProduct(pd); closeModal(); render(); toast("Product added.");
        break;
      }
      case "del-product": Store.deleteCustomProduct(id); render(); break;
      case "edit-deal": dealForm(Store.deals().find(function (d) { return d.id === id; })); break;
      case "del-deal": if (confirm("Delete this deal?")) { Store.deleteDeal(id); render(); } break;
      case "save-deal": {
        var dm = a.closest(".modal");
        var data = {};
        dm.querySelectorAll("[data-d]").forEach(function (el) { data[el.getAttribute("data-d")] = el.value; });
        var b = data.buyerId ? Store.companyById(data.buyerId) : null;
        data.buyer = b ? b.name : "";
        if (id) Store.updateDeal(id, data); else Store.addDeal(data);
        closeModal(); render(); toast(id ? "Deal updated." : "Deal added.");
        break;
      }
      case "add-task": Store.addTask({ text: "New task" }); render(); break;
      case "del-task": Store.deleteTask(id); render(); break;      case "sheet-del-cat": {
        var cat = a.getAttribute("data-cat");
        if (confirm("Delete this category and its contacts?")) { Store.deleteSheetCategory(cat); render(); }
        break;
      }
      case "sheet-add-contact": Store.addSheetContact(a.getAttribute("data-cat")); render(); break;
      case "sheet-del-contact": Store.deleteSheetContact(a.getAttribute("data-cat"), id); render(); break;
      case "sheet-email": {
        var cat2 = (Store.sheetCategories().find(function (x) { return x.id === a.getAttribute("data-cat"); }) || {});
        var ct = (cat2.contacts || []).find(function (x) { return x.id === id; });
        if (ct && ct.email) {
          var s2 = Store.settings();
          var greet = ct.name ? "Dear " + ct.name.split(/\s+/)[0] + "," : "Dear Sir or Madam,";
          var bd = greet + "\n\nWe are a direct supplier of " + (cat2.name || "metals") + ". We would welcome the opportunity to supply " + (ct.company || "your company") + ".\n\nBest regards,\n" + (s2.senderName || "") + "\n" + (s2.companyName || "");
          window.open("https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(ct.email) + "&su=" + encodeURIComponent((s2.companyName || "") + " — " + (cat2.name || "supply")) + "&body=" + encodeURIComponent(bd), "_blank");
        }
        break;
      }
      case "edit-company": companyForm(company); break;

      case "save-company": {
        var modal = a.closest(".modal");
        var data = readForm(modal);
        if (!data.name && !data.email) { toast("Add at least a name or email."); return; }
        if (id) Store.updateCompany(id, data);
        else Store.addCompany(data);
        closeModal(); render(); toast(id ? "Buyer updated." : "Buyer added.");
        break;
      }

      case "del-company":
        if (confirm("Delete " + (company ? company.name : "this buyer") + "?")) {
          Store.deleteCompany(id); render(); toast("Buyer deleted.");
        }
        break;

      case "status": {
        var st = a.getAttribute("data-status");
        var extra = {};
        if (st === "yellow") extra.lastEmailAt = company.lastEmailAt || Date.now();
        if (st === "green") extra.lastReplyAt = Date.now();
        Store.setStatus(id, st, extra);
        Store.logActivity(id, "status", "Status set to " + st);
        render();
        break;
      }

      case "send-email": {
        if (!company.email) { toast("Add an email address first (Edit)."); break; }
        window.open(Email.composeUrl(company), "_blank");
        Store.updateCompany(id, { lastEmailAt: Date.now(), lastEmailSubject: Email.buildDraft(company).subject });
        if (company.status === "red") Store.setStatus(id, "yellow", {});
        Store.logActivity(id, "email", "Email drafted to " + company.email);
        addFollowupTask(company);
        render();
        toast("Opened Gmail with a pre-written email. Review & send.");
        break;
      }

      case "open-thread":
        window.open(Email.threadUrl(company), "_blank");
        break;

      case "edit-prices": pricesForm(); break;
      case "save-prices": {
        var m2 = a.closest(".modal");
        App.PRICE_ROWS.forEach(function (r) {
          var v = m2.querySelector('[data-price="' + r.key + '"]');
          var patch = { value: v && v.value !== "" ? Number(v.value) : null };
          if (r.hasPremium) {
            var pr = m2.querySelector('[data-price-prem="' + r.key + '"]');
            patch.premium = pr && pr.value !== "" ? Number(pr.value) : null;
          }
          Store.setPriceRow(r.key, patch);
        });
        var src = m2.querySelector("[data-price-src]");
        Store.updatePrices({ source: src && src.value ? src.value : "Manual entry" });
        closeModal(); render(); toast("Prices updated.");
        break;
      }
      case "clear-filters":
        filterStatus = ""; filterMetal = ""; render();
        break;

      case "alert-filter":
        filterMetal = a.getAttribute("data-metal") || "";
        filterStatus = "";
        route = { view: "companies", country: null };
        render();
        break;

      case "email-metal": {
        var pm = a.getAttribute("data-metal") || "";
        var buyers = Store.companies().filter(function (c) {
          return c.email && (c.materials || []).some(function (mid) { var pp = App.productById(mid); return pp && pp.metal === pm; });
        });
        if (!buyers.length) { toast("No buyers with an email buy that metal."); break; }
        var cap = Math.min(buyers.length, 8);
        if (!confirm("Open " + cap + " Gmail drafts" + (buyers.length > cap ? " (first " + cap + " of " + buyers.length + ")" : "") + "?")) break;
        buyers.slice(0, cap).forEach(function (c) {
          window.open(Email.composeUrl(c), "_blank");
          Store.updateCompany(c.id, { lastEmailAt: Date.now() });
          if (c.status === "red") Store.setStatus(c.id, "yellow", {});
          Store.logActivity(c.id, "email", "Price-move outreach");
        });
        render(); toast("Opened " + cap + " drafts.");
        break;
      }

      case "cal-prev": calOffset--; render(); break;
      case "cal-next": calOffset++; render(); break;

      case "make-offer": offerForm(company); break;
      case "make-docs": docForm(company); break;
      case "deal-docs": {
        var deal = Store.deals().find(function (x) { return x.id === id; });
        if (!deal) break;
        var buyer = deal.buyerId ? Store.companyById(deal.buyerId) : null;
        docForm({
          id: buyer ? buyer.id : "", name: deal.buyer || (buyer && buyer.name) || "Buyer",
          contactName: buyer ? buyer.contactName : "", email: buyer ? buyer.email : "", materials: [],
          notes: deal.notes || "", _terms: deal.dischargePort ? "CIF " + deal.dischargePort : "",
          _dealLines: deal.product ? ("  • " + deal.product + (deal.value ? " — " + Prices.money(Number(deal.value)) : "")) : "",
          _dealTotal: deal.value ? Prices.money(Number(deal.value)) : ""
        });
        break;
      }
      case "doc-email": {
        var dm2 = a.closest(".modal");
        var txt = (dm2.querySelector("#doc-body") || {}).value || "";
        var dtype = (dm2.querySelector("#doc-type") || {}).value || "document";
        var rcp = App._docRecipient || {};
        var subj = (Store.settings().companyName || "") + " — " + dtype.toUpperCase() + " — " + (rcp.name || "");
        window.open("https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(rcp.email || "") +
          "&su=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(txt), "_blank");
        if (rcp.logId) {
          Store.updateCompany(rcp.logId, { lastEmailAt: Date.now() });
          var cc = Store.companyById(rcp.logId); if (cc && cc.status === "red") Store.setStatus(rcp.logId, "yellow", {});
          Store.logActivity(rcp.logId, "doc", dtype.toUpperCase() + " emailed");
        }
        closeModal(); render(); toast("Opened Gmail with the document.");
        break;
      }
      case "doc-print": {
        var dm3 = a.closest(".modal");
        var dtxt = (dm3.querySelector("#doc-body") || {}).value || "";
        var dt = (dm3.querySelector("#doc-type") || {}).value || "document";
        var rcp2 = App._docRecipient || {};
        var ps2 = Store.settings();
        var w2 = window.open("", "_blank");
        if (!w2) { toast("Allow pop-ups to print."); break; }
        w2.document.write("<html><head><title>" + esc(dt) + " — " + esc(rcp2.name || "") + "</title><style>" +
          "body{font-family:Arial,sans-serif;max-width:720px;margin:32px auto;color:#111}h1{font-size:20px;margin:0 0 4px}" +
          ".muted{color:#666;font-size:13px}hr{border:none;border-top:1px solid #ddd;margin:14px 0}" +
          "pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;line-height:1.5}</style></head><body>" +
          "<h1>" + esc(ps2.companyName || "") + "</h1><div class='muted'>" + esc(ps2.senderName || "") +
          (ps2.phone ? " · " + esc(ps2.phone) : "") + (ps2.senderEmail ? " · " + esc(ps2.senderEmail) : "") + "</div><hr>" +
          "<pre>" + esc(dtxt) + "</pre></body></html>");
        w2.document.close(); w2.focus(); setTimeout(function () { w2.print(); }, 300);
        if (rcp2.logId) Store.logActivity(rcp2.logId, "doc", dt.toUpperCase() + " printed");
        break;
      }
      case "doc-dl-file": {
        var dmx = a.closest(".modal");
        var ty = (dmx.querySelector("#doc-type") || {}).value;
        var f = Store.docFile(ty);
        if (f) App.downloadDataUrl(f.data, f.name);
        else toast("No file uploaded for this type — add one in Settings → templates.");
        break;
      }
      case "download-docfile": {
        var df1 = Store.docFile(a.getAttribute("data-key"));
        if (df1) App.downloadDataUrl(df1.data, df1.name);
        break;
      }
      case "remove-docfile":
        Store.setDocFile(a.getAttribute("data-key"), null);
        render(); toast("File removed.");
        break;

      case "email-offer": {
        var mo = a.closest(".modal");
        var o = readOffer(mo);
        if (!o.lines.length) { toast("No priced products to offer."); break; }
        var s = Store.settings();
        var map = offerMap(company, o);
        var subject = (s.companyName || "Offer") + " — offer for " + (company.name || "");
        var bodyTxt = applyTpl(s.offerTemplate || BUILTIN_OFFER, map);
        if (mo.querySelector("#offer-loi") && mo.querySelector("#offer-loi").checked) {
          bodyTxt += "\n\n――――――――――\n" + applyTpl(s.loiTemplate || BUILTIN_LOI, map);
        }
        var url = "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(company.email || "") +
          "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(bodyTxt);
        window.open(url, "_blank");
        Store.updateCompany(id, { lastEmailAt: Date.now() });
        if (company.status === "red") Store.setStatus(id, "yellow", {});
        Store.logActivity(id, "offer", "Offer emailed (" + o.lines.length + " items)");
        closeModal(); render(); toast("Opened Gmail with your offer.");
        break;
      }

      case "print-offer": {
        var pmo = a.closest(".modal");
        var po = readOffer(pmo);
        if (!po.lines.length) { toast("No priced products to offer."); break; }
        var ps = Store.settings();
        var pmap = offerMap(company, po);
        var offerBody = applyTpl(ps.offerTemplate || BUILTIN_OFFER, pmap);
        var loiBody = (pmo.querySelector("#offer-loi") && pmo.querySelector("#offer-loi").checked)
          ? applyTpl(ps.loiTemplate || BUILTIN_LOI, pmap) : "";
        var w = window.open("", "_blank");
        if (!w) { toast("Allow pop-ups to print the offer."); break; }
        var head = "<h1>" + esc(ps.companyName || "Offer") + "</h1>" +
          "<div class='muted'>" + esc(ps.senderName || "") + (ps.phone ? " · " + esc(ps.phone) : "") + (ps.senderEmail ? " · " + esc(ps.senderEmail) : "") + "</div><hr>";
        w.document.write(
          "<html><head><title>Offer — " + esc(company.name || "") + "</title><style>" +
          "body{font-family:Arial,sans-serif;max-width:720px;margin:32px auto;color:#111}h1{font-size:20px;margin:0 0 4px}" +
          ".muted{color:#666;font-size:13px}hr{border:none;border-top:1px solid #ddd;margin:14px 0}" +
          "pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;line-height:1.5}" +
          ".pb{page-break-before:always}</style></head><body>" +
          head + "<pre>" + esc(offerBody) + "</pre>" +
          (loiBody ? "<div class='pb'></div>" + head + "<pre>" + esc(loiBody) + "</pre>" : "") +
          "</body></html>");
        w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
        Store.logActivity(id, "offer", "Offer printed (" + po.lines.length + " items)" + (loiBody ? " + LOI" : ""));
        break;
      }

      case "toggle-currency": {
        var cur = Store.settings().displayCurrency || "USD";
        var order = ["USD", "EUR", "GBP", "CNY"];
        var next = order[(order.indexOf(cur) + 1) % order.length];
        Store.updateSettings({ displayCurrency: next });
        renderPriceBar();
        var rates = Store.prices().fxRates || {};
        if (next !== "USD" && !rates[next] && !(next === "EUR" && Store.prices().fx)) {
          toast("Fetching " + next + " rate…");
          Prices.fetchLive(true).then(function (d) { if (d) { Store.applyPriceFeed(d); render(); } }).catch(function () {});
        } else { render(); }
        break;
      }

      case "add-cmetal": customMetalForm(); break;
      case "edit-cmetal": customMetalForm(Store.customMetals().find(function (m) { return m.id === id; })); break;
      case "del-cmetal": if (confirm("Remove this metal from Markets?")) { Store.deleteCustomMetal(id); render(); } break;
      case "save-cmetal": {
        var cm = a.closest(".modal");
        var label = (cm.querySelector("[data-cm=label]").value || "").trim();
        if (!label) { toast("Give the metal a name."); break; }
        var data = {
          label: label,
          unit: (cm.querySelector("[data-cm=unit]").value || "/MT").trim(),
          value: cm.querySelector("[data-cm=value]").value === "" ? null : Number(cm.querySelector("[data-cm=value]").value)
        };
        if (id) Store.updateCustomMetal(id, data); else Store.addCustomMetal(data);
        closeModal(); render(); toast(id ? "Metal updated." : "Metal added to Markets.");
        break;
      }

      case "refresh-prices":
        toast("Scanning live prices…");
        Prices.fetchLive(true).then(function (d) {
          App.priceMsg = "";
          Store.applyPriceFeed(d);
          render();
          toast("Live prices loaded (" + (d.source || "feed") + ").");
        }).catch(function (err) {
          App.priceMsg = err.message; renderPriceBar();
          toast(err.message);
        });
        break;

      case "save-settings": {
        var sc = a.closest(".content") || document;
        var patch = {};
        sc.querySelectorAll("[data-set]").forEach(function (el) { patch[el.getAttribute("data-set")] = el.value.trim(); });
        sc.querySelectorAll("[data-set-bool]").forEach(function (el) { patch[el.getAttribute("data-set-bool")] = el.checked; });
        var margins = Object.assign({}, Store.settings().margins);
        sc.querySelectorAll("[data-margin]").forEach(function (el) {
          var v = el.value.trim();
          if (v === "") delete margins[el.getAttribute("data-margin")];
          else margins[el.getAttribute("data-margin")] = Number(v);
        });
        patch.margins = margins;
        var docTemplates = Object.assign({}, Store.settings().docTemplates);
        sc.querySelectorAll("[data-doc]").forEach(function (el) { docTemplates[el.getAttribute("data-doc")] = el.value; });
        patch.docTemplates = docTemplates;
        Store.updateSettings(patch); toast("Settings saved.");
        if (App.startLiveTicker) App.startLiveTicker();
        break;
      }

      case "add-template": templateForm(); break;
      case "edit-template": templateForm((Store.settings().templates || []).find(function (t) { return t.id === id; })); break;
      case "del-template": {
        var tpls = (Store.settings().templates || []).filter(function (t) { return t.id !== id; });
        Store.updateSettings({ templates: tpls });
        render(); toast("Template deleted.");
        break;
      }
      case "save-template": {
        var tm = a.closest(".modal");
        var tdata = {
          id: id || App.uid(),
          name: (tm.querySelector("[data-tf=name]").value || "Untitled").trim(),
          subject: tm.querySelector("[data-tf=subject]").value,
          body: tm.querySelector("[data-tf=body]").value
        };
        var arr = (Store.settings().templates || []).slice();
        var idx = arr.findIndex(function (t) { return t.id === tdata.id; });
        if (idx >= 0) arr[idx] = tdata; else arr.push(tdata);
        Store.updateSettings({ templates: arr });
        closeModal(); render(); toast("Template saved.");
        break;
      }

      case "test-proxy":
        toast("Pinging proxy…");
        App.Apollo.health().then(function (h) {
          toast(h.mock ? "Proxy reachable — running in MOCK mode (no key)." : (h.hasKey ? "Proxy reachable — LIVE, key set ✓" : "Proxy reachable but no API key set."));
        }).catch(function () { toast("Proxy not reachable at " + App.Apollo.proxyUrl() + ". Start it first."); });
        break;

      case "find-buyers": {
        if (!company.website) { toast("Add this company's website first (Edit) so Apollo can match it."); break; }
        a.textContent = "⏳ Searching…"; a.setAttribute("disabled", "1");
        App.Apollo.findBuyers(company).then(function (res) {
          openPeoplePicker(company, res);
        }).catch(function (err) {
          toast(err.message);
        }).then(function () { render(); });
        break;
      }

      case "save-selected-people": {
        var mp = a.closest(".modal");
        var chosen = [];
        mp.querySelectorAll("[data-person]:checked").forEach(function (el) {
          chosen.push(JSON.parse(decodeURIComponent(el.getAttribute("data-person"))));
        });
        if (!chosen.length) { toast("Select at least one person."); break; }
        var n = Store.addPeople(id, chosen);
        closeModal(); render(); toast(n + " contact(s) added.");
        break;
      }

      case "person-email": {
        var pidx = Number(a.getAttribute("data-idx"));
        var person = (company.people || [])[pidx];
        if (!person || !person.email) { toast("No email for this person."); break; }
        window.open(Email.composeUrl(company, person), "_blank");
        if ((person.status || "red") === "red") Store.setPersonStatus(id, pidx, "yellow", { lastEmailAt: Date.now() });
        render(); toast("Opened Gmail to " + person.name + ".");
        break;
      }

      case "person-status":
        Store.setPersonStatus(id, Number(a.getAttribute("data-idx")), a.getAttribute("data-status"),
          a.getAttribute("data-status") === "yellow" ? { lastEmailAt: Date.now() } :
          a.getAttribute("data-status") === "green" ? { lastReplyAt: Date.now() } : {});
        render();
        break;

      case "person-thread": {
        var tp = (company.people || [])[Number(a.getAttribute("data-idx"))];
        if (tp && tp.email) window.open(Email.threadUrl({ email: tp.email, name: tp.name }), "_blank");
        break;
      }

      case "del-person":
        Store.removePerson(id, Number(a.getAttribute("data-idx")));
        render();
        break;

      case "refresh-phones": {
        toast("Checking for phone numbers…");
        App.Apollo.getPhones(company).then(function (map) {
          var n = Store.mergePhones(id, map);
          render();
          toast(n ? (n + " phone number(s) added.") : "No new phone numbers yet (they arrive a bit after reveal).");
        });
        break;
      }

      case "bulk-find": {
        bulkFindBuyers(a.getAttribute("data-country") || null);
        break;
      }

      case "discover-companies": {
        var cc = a.getAttribute("data-country");
        var country = App.countryByCode(cc);
        a.textContent = "⏳ Searching…"; a.setAttribute("disabled", "1");
        App.Apollo.findCompanies(country ? country.name : cc).then(function (res) {
          openCompanyPicker(cc, res);
        }).catch(function (err) { toast(err.message); }).then(function () { render(); });
        break;
      }

      case "save-discovered": {
        var dm = a.closest(".modal");
        var dcc = a.getAttribute("data-country");
        var chosen = [];
        dm.querySelectorAll("[data-company]:checked").forEach(function (el) {
          chosen.push(JSON.parse(decodeURIComponent(el.getAttribute("data-company"))));
        });
        if (!chosen.length) { toast("Select at least one company."); break; }
        var seed = chosen.map(function (x) {
          return { name: x.name, country: dcc, city: x.city || "", website: x.domain || "", materials: [], notes: "Discovered via Apollo — run Find buyers for contacts." };
        });
        var n = Store.importSeed(seed);
        closeModal(); render();
        toast(n + " companies added — now run “Find buyers (all)” to get emails.");
        break;
      }

      case "connect-gmail":
        window.open(App.Gmail.connectUrl(), "_blank");
        toast("Connect Gmail in the new tab, then click “Sync now”.");
        break;

      case "sync-gmail":
        syncGmail();
        break;

      case "check-opens": App.checkOpens(); break;

      case "team-pull":
        if (!App.Sync.enabled()) { toast("Enable team sync first (and Save)."); break; }
        toast("Pulling team data…");
        App.Sync.pull().then(function (j) {
          if (j && j.state && Store.applyRemote(j)) { render(); toast("Pulled latest team data."); }
          else toast("No shared data on the server yet — push first.");
        }).catch(function (e) { toast(e.message); });
        break;

      case "team-push":
        if (!App.Sync.enabled()) { toast("Enable team sync first (and Save)."); break; }
        toast("Pushing to team…");
        App.Sync.push().then(function (j) { toast("Pushed (rev " + (j.rev || "?") + ")."); })
          .catch(function (e) { toast(e.message); });
        break;

      case "import": importForm(); break;
      case "restore-file": { var fi = $("restore-file"); if (fi) fi.click(); break; }
      case "restore-snapshot": {
        var b = Store.lastSnapshot();
        if (!b || !b.ts) { toast("No snapshot saved yet."); break; }
        if (confirm("Restore the snapshot from " + new Date(b.ts).toLocaleString() + "? Current data will be replaced.")) {
          if (Store.restoreSnapshot()) { render(); toast("Snapshot restored."); }
        }
        break;
      }
      case "load-eu-seed": {
        var added = Store.importSeed(App.EU_SEED || []);
        closeModal(); render();
        toast(added ? (added + " starter companies loaded — now run “Find buyers”.") : "Starter list already loaded.");
        break;
      }
      case "do-import": {
        var txt = $("import-text").value.trim();
        if (!txt) { toast("Paste some data first."); break; }
        try {
          if (txt[0] === "{") { Store.importJSON(txt); toast("Backup restored."); }
          else {
            var rows = parseCSV(txt);
            var n = Store.importCompanyRows(rows);
            toast(n + " buyer(s) imported.");
          }
          closeModal(); render();
        } catch (err) { toast("Import failed: " + err.message); }
        break;
      }
      case "export": {
        var blob = new Blob([Store.exportJSON()], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var aEl = document.createElement("a");
        aEl.href = url; aEl.download = "metals-crm-backup.json"; aEl.click();
        URL.revokeObjectURL(url);
        toast("Backup downloaded.");
        break;
      }
      case "reset":
        if (confirm("This erases ALL buyers, prices and settings. Continue?")) {
          Store.resetAll(); render(); toast("Everything reset.");
        }
        break;
    }
  });

  App.onSheetCat = function (catId, value) { App.Store.renameSheetCategory(catId, value); };
  App.onSheetContact = function (catId, contactId, field, value) {
    var patch = {}; patch[field] = value;
    App.Store.updateSheetContact(catId, contactId, patch);
  };
  App.onDealStage = function (id, stage) { Store.updateDeal(id, { stage: stage }); render(); };
  App.onShip = function (id, field, value) { var p = {}; p[field] = value; Store.updateDeal(id, p); };
  App.onContract = function (id, field, value) { var p = {}; p[field] = value; Store.updateContract(id, p); if (route.view === "contracts") render(); };
  App.onHedge = function (id, field, value) { var p = {}; p[field] = value; Store.updateHedge(id, p); if (route.view === "risk") render(); };
  App.onKyc = function (id, field, value) { var p = {}; p[field] = value; Store.updateCompany(id, p); if (route.view === "compliance") render(); };

  // Auto-create a follow-up task when you email a buyer (deduped, optional).
  function addFollowupTask(company) {
    if (!company || Store.settings().autoFollowupTask === false) return;
    if (Store.tasks().some(function (t) { return !t.done && t.buyerId === company.id; })) return;
    var d = new Date(Date.now() + (Number(Store.settings().followUpDays) || 4) * 86400000);
    Store.addTask({ text: "Follow up: " + (company.name || "buyer"), due: d.toISOString().slice(0, 10), buyerId: company.id });
  }

  // Poll the proxy for email-link engagement and badge the buyers.
  App.checkOpens = function () {
    var base = (Store.settings().apolloProxyUrl || "http://localhost:8787").replace(/\/+$/, "");
    var ids = Store.companies().map(function (c) { return c.id; }).join(",");
    if (!ids) return;
    toast("Checking engagement…");
    fetch(base + "/api/track-opens?ids=" + encodeURIComponent(ids)).then(function (r) { return r.json(); }).then(function (j) {
      var n = Store.applyOpens(j.opens || {}); render();
      toast(n ? (n + " buyer(s) clicked your link.") : "No engagement recorded yet.");
    }).catch(function () { toast("Couldn't reach the proxy for tracking."); });
  };
  App.onGlobalSearch = function (v) {
    globalQ = v;
    if (route.view !== "search") route = { view: "search", country: null };
    $("content").innerHTML = viewSearch();
  };
  App.onTaskDone = function (id, done) { Store.updateTask(id, { done: done }); render(); };
  App.onTaskEdit = function (id, field, value) { var p = {}; p[field] = value; Store.updateTask(id, p); };

  App.calcProduct = function () {
    var sel = $("calc-prod"); if (!sel) return;
    var base = productBaseUSD(App.productById(sel.value));
    if (base != null) $("calc-base").value = base;
    App.recalcCalc();
  };
  App.recalcCalc = function () {
    if (!$("calc-base")) return;
    var n = function (id) { return Number(($(id) || {}).value) || 0; };
    var base = n("calc-base"), margin = n("calc-margin"), freight = n("calc-freight"),
        ins = n("calc-ins"), duty = n("calc-duty"), qty = n("calc-qty");
    var sell = base * (1 + margin / 100);           // your FOB sell price
    var cif = sell + freight;
    var insAmt = cif * ins / 100;
    var dutyAmt = (cif + insAmt) * duty / 100;
    var landed = cif + insAmt + dutyAmt;            // buyer's landed cost
    var profitMT = sell - base;
    function L(k, v, strong) { return '<div class="calc-row' + (strong ? " strong" : "") + '"><span>' + k + "</span><span>" + Prices.money(v) + "</span></div>"; }
    $("calc-out").innerHTML =
      L("Your FOB sell (base + " + margin + "%)", sell) +
      L("+ Freight", freight) +
      L("CIF", cif, false) +
      L("+ Insurance", insAmt) +
      L("+ Duty", dutyAmt) +
      L("Buyer landed cost / MT", landed, true) +
      '<hr style="border:none;border-top:1px solid var(--line);margin:8px 0">' +
      L("Your profit / MT", profitMT, true) +
      L("Total deal value (" + qty + " MT)", sell * qty) +
      L("Total profit (" + qty + " MT)", profitMT * qty, true);
  };

  App.onFilter = function (kind, value) {
    if (kind === "status") filterStatus = value; else if (kind === "metal") filterMetal = value;
    var c = $("content");
    if (route.view === "companies" || route.view === "country") c.innerHTML = viewCompanies(route.country);
  };

  App.onSearch = function (v) { query = v; var c = $("content");
    // re-render only the cards area to keep input focus
    if (route.view === "companies" || route.view === "country") {
      c.innerHTML = viewCompanies(route.country);
      var s = c.querySelector(".search");
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }
  };

  /* Auto-scan live prices ~once/day on load (if a source is configured).
     Surfaces the reason in the price bar if it can't (instead of silent). */
  function autoScanPrices() {
    if (Store.settings().autoScanPrices === false) return;
    if (Store.settings().priceSource === "manual") return;
    var p = Store.prices();
    var age = Date.now() - (p.updatedAt || 0);
    if (p.updatedAt && age < 12 * 3600 * 1000) return; // already fresh today
    App.priceMsg = "scanning…"; renderPriceBar();
    Prices.fetchLive().then(function (d) {
      if (d && (d.copper != null || d.aluminium != null || d.zinc != null)) {
        App.priceMsg = ""; Store.applyPriceFeed(d); renderPriceBar();
      } else {
        App.priceMsg = "Live feed returned no prices."; renderPriceBar();
      }
    }).catch(function (err) {
      App.priceMsg = err.message; renderPriceBar();
    });
  }

  /* Live ticker: re-fetch prices on an interval so the board updates itself. */
  function startLiveTicker() {
    if (App._liveTimer) clearInterval(App._liveTimer);
    var s = Store.settings();
    var secs = Number(s.priceLiveSeconds) || 0;
    if (secs <= 0 || s.priceSource === "manual") return;
    App._liveTimer = setInterval(function () {
      Prices.fetchLive(true).then(function (d) {
        if (d) { App.priceMsg = ""; Store.applyPriceFeed(d); renderPriceBar(); }
      }).catch(function (err) { App.priceMsg = err.message; renderPriceBar(); });
    }, Math.max(15, secs) * 1000);
  }
  App.startLiveTicker = startLiveTicker;

  /* boot */
  function boot() {
    render();
    setTimeout(autoScanPrices, 700);
    if (App.Sync) App.Sync.init(function () { render(); toast("Pulled latest team data."); });
    startLiveTicker();
    // daily local snapshot for safety
    try {
      if (Store.settings().autoBackup !== false) {
        var b = Store.lastSnapshot();
        if (!b || !b.ts || (Date.now() - b.ts) > 24 * 3600 * 1000) Store.takeSnapshot();
      }
    } catch (e) {}
  }
  document.addEventListener("DOMContentLoaded", boot);
  if (document.readyState !== "loading") boot();

})(window.App);
