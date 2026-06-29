/* ============================================================
   data.js  —  Static reference data (no dependencies)
   Attaches everything to the global window.App namespace.
   ============================================================ */
window.App = window.App || {};

(function (App) {
  "use strict";

  // Bump on each release; shown in the sidebar so you can confirm the live build.
  App.VERSION = "build 13 · metalflow";

  /* ---- Metal groups: drive colour coding + LME price linkage ---- */
  // lmeKey maps a metal to a row in the price panel. null = no direct LME contract.
  App.METALS = {
    copper:    { label: "Copper",          color: "#c2703d", lmeKey: "copper" },
    aluminium: { label: "Aluminium",       color: "#7f93a8", lmeKey: "aluminium" },
    zinc:      { label: "Zinc",            color: "#5b8a9a", lmeKey: "zinc" },
    lead:      { label: "Lead",            color: "#5d6470", lmeKey: "lead" },
    brass:     { label: "Brass / Alloy",   color: "#b89630", lmeKey: null },     // derived from Cu + Zn
    stainless: { label: "Stainless / Ni",  color: "#8a8f98", lmeKey: "nickel" },
    iron:      { label: "Iron / Steel",    color: "#6b7280", lmeKey: null },
    gold:      { label: "Gold",            color: "#d4af37", lmeKey: "gold" }
  };

  /* ---- The 25 products you sell ---- */
  // type: primary | scrap | compound | product
  App.PRODUCTS = [
    { id: "copper-ingots-97",   name: "Copper ingots 97%",                 metal: "copper",    type: "primary",  unit: "MT" },
    { id: "copper-cathode",     name: "Copper cathode 99.99%",             metal: "copper",    type: "primary",  unit: "MT" },
    { id: "aluminium-ingots",   name: "Aluminium ingots 95%",              metal: "aluminium", type: "primary",  unit: "MT" },
    { id: "copper-rod",         name: "Copper rod 8mm–16mm",               metal: "copper",    type: "product",  unit: "MT" },
    { id: "copper-billet",      name: "Copper billet",                     metal: "copper",    type: "product",  unit: "MT" },
    { id: "zinc-ingot-hg",      name: "High grade zinc ingot",             metal: "zinc",      type: "primary",  unit: "MT" },
    { id: "lead-remelted",      name: "Remelted lead ingots",              metal: "lead",      type: "primary",  unit: "MT" },
    { id: "lead-refined",       name: "Refined lead ingots",               metal: "lead",      type: "primary",  unit: "MT" },
    { id: "lead-antimony",      name: "Antimony lead ingots",              metal: "lead",      type: "primary",  unit: "MT" },
    { id: "al-scrap-ubc",       name: "Aluminium scrap UBC (extrusion/Talk)", metal: "aluminium", type: "scrap", unit: "MT" },
    { id: "brass-scrap-honey",  name: "Brass scrap (honey / ocean radiator)", metal: "brass", type: "scrap",    unit: "MT" },
    { id: "lead-oxide",         name: "Lead oxide",                        metal: "lead",      type: "compound", unit: "MT" },
    { id: "cu-scrap-berry",     name: "Copper scrap (berry)",              metal: "copper",    type: "scrap",    unit: "MT" },
    { id: "cu-scrap-birch",     name: "Copper scrap (birch/cliff)",        metal: "copper",    type: "scrap",    unit: "MT" },
    { id: "cu-scrap-millberry", name: "Copper scrap (millberry)",          metal: "copper",    type: "scrap",    unit: "MT" },
    { id: "zinc-oxide",         name: "Zinc oxide",                        metal: "zinc",      type: "compound", unit: "MT" },
    { id: "cast-iron",          name: "Cast iron",                         metal: "iron",      type: "primary",  unit: "MT" },
    { id: "brass-alloy-ingots", name: "Brass alloy ingots",                metal: "brass",     type: "primary",  unit: "MT" },
    { id: "brass-billet",       name: "Brass billet",                      metal: "brass",     type: "product",  unit: "MT" },
    { id: "copper-busbar",      name: "Copper busbar",                     metal: "copper",    type: "product",  unit: "MT" },
    { id: "al-sows",            name: "Aluminium sows A7–A5",              metal: "aluminium", type: "primary",  unit: "MT" },
    { id: "copper-pipe",        name: "Copper pipe",                       metal: "copper",    type: "product",  unit: "MT" },
    { id: "ss-304",             name: "Stainless steel 304",               metal: "stainless", type: "product",  unit: "MT" },
    { id: "al-talon",           name: "Aluminium Talon",                   metal: "aluminium", type: "scrap",    unit: "MT" },
    { id: "al-wheels",          name: "Aluminium wheels",                  metal: "aluminium", type: "scrap",    unit: "MT" }
  ];

  App.productById = function (id) {
    var p = App.PRODUCTS.find(function (x) { return x.id === id; });
    if (p) return p;
    if (App.Store && App.Store.customProducts) return App.Store.customProducts().find(function (x) { return x.id === id; });
    return undefined;
  };
  // 25 built-in products + any custom products the user added.
  App.allProducts = function () {
    var custom = (App.Store && App.Store.customProducts) ? App.Store.customProducts() : [];
    return App.PRODUCTS.concat(custom);
  };

  /* ---- The 27 EU member states ---- */
  App.COUNTRIES = [
    { code: "AT", name: "Austria",        flag: "🇦🇹" },
    { code: "BE", name: "Belgium",        flag: "🇧🇪" },
    { code: "BG", name: "Bulgaria",       flag: "🇧🇬" },
    { code: "HR", name: "Croatia",        flag: "🇭🇷" },
    { code: "CY", name: "Cyprus",         flag: "🇨🇾" },
    { code: "CZ", name: "Czechia",        flag: "🇨🇿" },
    { code: "DK", name: "Denmark",        flag: "🇩🇰" },
    { code: "EE", name: "Estonia",        flag: "🇪🇪" },
    { code: "FI", name: "Finland",        flag: "🇫🇮" },
    { code: "FR", name: "France",         flag: "🇫🇷" },
    { code: "DE", name: "Germany",        flag: "🇩🇪" },
    { code: "GR", name: "Greece",         flag: "🇬🇷" },
    { code: "HU", name: "Hungary",        flag: "🇭🇺" },
    { code: "IE", name: "Ireland",        flag: "🇮🇪" },
    { code: "IT", name: "Italy",          flag: "🇮🇹" },
    { code: "LV", name: "Latvia",         flag: "🇱🇻" },
    { code: "LT", name: "Lithuania",      flag: "🇱🇹" },
    { code: "LU", name: "Luxembourg",     flag: "🇱🇺" },
    { code: "MT", name: "Malta",          flag: "🇲🇹" },
    { code: "NL", name: "Netherlands",    flag: "🇳🇱" },
    { code: "PL", name: "Poland",         flag: "🇵🇱" },
    { code: "PT", name: "Portugal",       flag: "🇵🇹" },
    { code: "RO", name: "Romania",        flag: "🇷🇴" },
    { code: "SK", name: "Slovakia",       flag: "🇸🇰" },
    { code: "SI", name: "Slovenia",       flag: "🇸🇮" },
    { code: "ES", name: "Spain",          flag: "🇪🇸" },
    { code: "SE", name: "Sweden",         flag: "🇸🇪" }
  ];

  App.countryByCode = function (code) {
    var c = App.COUNTRIES.find(function (x) { return x.code === code; });
    if (c) return c;
    if (App.Store && App.Store.customCountries) {
      return App.Store.customCountries().find(function (x) { return x.code === code; });
    }
    return undefined;
  };

  // All selectable countries = the 27 EU members + any custom ones the user added.
  App.allCountries = function () {
    var custom = (App.Store && App.Store.customCountries) ? App.Store.customCountries() : [];
    return App.COUNTRIES.concat(custom);
  };

  /* ---- LME price rows shown in the manual editor ---- */
  App.PRICE_ROWS = [
    { key: "copper",    label: "Copper (Grade A)",  metal: "copper",    hasPremium: true, premiumLabel: "Cu eq premium CIF-EU" },
    { key: "aluminium", label: "Aluminium (P1020)", metal: "aluminium", hasPremium: true, premiumLabel: "Al premium duty-paid EU" },
    { key: "zinc",      label: "Zinc (SHG)",        metal: "zinc" },
    { key: "lead",      label: "Lead",              metal: "lead" },
    { key: "nickel",    label: "Nickel",            metal: "stainless" },
    { key: "gold",      label: "Gold spot",         metal: "gold", unit: "/oz" }
  ];

  /* ---- The top ticker strip (mirrors a trading-desk board) ---- */
  // kind: metal (LME/spot price) | premium (regional premium)
  App.TICKER = [
    { key: "copper",    label: "LME COPPER (3M)",      metal: "copper",    unit: "/MT", kind: "metal" },
    { key: "aluminium", label: "LME ALUMINIUM (3M)",   metal: "aluminium", unit: "/MT", kind: "metal" },
    { key: "zinc",      label: "LME ZINC (3M)",        metal: "zinc",      unit: "/MT", kind: "metal" },
    { key: "lead",      label: "LME LEAD (3M)",        metal: "lead",      unit: "/MT", kind: "metal" },
    { key: "nickel",    label: "LME NICKEL (3M)",      metal: "stainless", unit: "/MT", kind: "metal" },
    { key: "gold",      label: "GOLD SPOT",            metal: "gold",      unit: "/oz", kind: "metal" },
    { key: "aluminium", label: "AL PREMIUM DP-EU",     metal: "aluminium", unit: "/MT spot · Fastmarkets MB", kind: "premium" },
    { key: "copper",    label: "CU EQ PREMIUM CIF-EU", metal: "copper",    unit: "/MT · Fastmarkets MB", kind: "premium" }
  ];

  /* Reference link for the EU aluminium premium the user mentioned. */
  App.PREMIUM_SOURCE_URL =
    "https://www.lme.com/metals/non-ferrous/lme-aluminium-premiums/lme-aluminium-premium-duty-paid-european-fastmarkets-mb";

  /* Job titles that flag someone responsible for BUYING metals.
     Sent to the Apollo proxy as person_titles (partial matching). */
  App.BUYER_TITLES = [
    "procurement", "purchasing", "buyer", "sourcing", "supply chain",
    "trader", "trading", "commodity", "raw materials", "category manager",
    "commercial", "head of metals"
  ];

  /* Deal pipeline stages (Kanban columns). */
  App.STAGES = [
    { key: "lead",        label: "Lead",         color: "#7f93a8" },
    { key: "offer",       label: "Offer sent",   color: "#3b9ae1" },
    { key: "negotiation", label: "Negotiation",  color: "#f5b915" },
    { key: "contract",    label: "Contract",     color: "#b07cf0" },
    { key: "won",         label: "Won",          color: "#30a46c" },
    { key: "lost",        label: "Lost",         color: "#e5484d" }
  ];
  App.stageLabel = function (k) { var s = App.STAGES.find(function (x) { return x.key === k; }); return s ? s.label : k; };

  /* Basic sanctions/compliance screen list (INDICATIVE ONLY — not a substitute
     for a real OFAC/EU/UK SDN screening service). Matches buyer name/country
     against sanctioned jurisdictions and a few high-risk keywords. */
  App.SANCTIONS_KEYWORDS = [
    "russia", "russian", "belarus", "north korea", "dprk", "iran", "iranian",
    "syria", "syrian", "crimea", "donetsk", "luhansk", "myanmar", "cuba",
    "rusal", "norilsk", "nornickel", "sberbank", "vtb", "gazprom", "rosneft"
  ];
  App.screenSanctions = function (text) {
    var t = (" " + (text || "") + " ").toLowerCase();
    return App.SANCTIONS_KEYWORDS.filter(function (kw) { return t.indexOf(kw) !== -1; });
  };

})(window.App);
