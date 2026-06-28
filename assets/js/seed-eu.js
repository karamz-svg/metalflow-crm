/* ============================================================
   seed-eu.js  —  EU non-ferrous starter buyer list (research leads)
   ------------------------------------------------------------
   Real, publicly-known non-ferrous producers, smelters, refiners,
   fabricators and recyclers across the EU, with their public website
   domains. These are STARTING RESEARCH LEADS, not verified buyers:
     • Contact emails/phones are intentionally LEFT BLANK — use the
       Apollo "Find buyers" / "Find buyers (all)" button to pull
       VERIFIED procurement contacts (emails) for each domain. We do
       not hand-type emails, to avoid fabricated/incorrect addresses.
     • The "materials" tags are INDICATIVE; verify before pitching.
     • Domains are best-effort — Apollo matches by domain, so a wrong
       one simply returns no results (low risk). Verify as you go.
   Coverage note: big industrial countries have many entries; small
   member states have few or none with a real non-ferrous presence,
   so they're lighter on purpose (no invented companies).
   Load from the app: Import → "Load EU starter list".
   ============================================================ */
window.App = window.App || {};

(function (App) {
  "use strict";

  var N = "Research lead — verify domain & contact; pull verified emails via Apollo.";
  function C(name, country, city, website, materials, email) {
    return { name: name, country: country, city: city, website: website, materials: materials, email: email || "", notes: N };
  }

  App.EU_SEED = [
    /* ---------------- Germany ---------------- */
    C("Aurubis AG", "DE", "Hamburg", "aurubis.com", ["copper-cathode", "cu-scrap-millberry", "copper-billet"], "info@aurubis.com"),
    C("Wieland-Werke AG", "DE", "Ulm", "wieland.com", ["brass-alloy-ingots", "brass-billet", "copper-busbar"], "info@wieland.com"),
    C("KME Germany GmbH", "DE", "Osnabrück", "kme.com", ["copper-busbar", "copper-pipe", "brass-billet"]),
    C("TRIMET Aluminium SE", "DE", "Essen", "trimet.eu", ["aluminium-ingots", "al-sows", "al-scrap-ubc"], "sales@trimet.de"),
    C("Speira GmbH", "DE", "Grevenbroich", "speira.com", ["aluminium-ingots", "al-scrap-ubc"]),
    C("MKM Mansfelder Kupfer und Messing", "DE", "Hettstedt", "mkm.eu", ["copper-busbar", "copper-rod", "brass-billet"]),
    C("Diehl Metall", "DE", "Röthenbach", "diehl.com", ["brass-alloy-ingots", "brass-billet"]),
    C("Otto Fuchs KG", "DE", "Meinerzhagen", "otto-fuchs.com", ["aluminium-ingots", "brass-alloy-ingots"]),
    C("ELG Haniel", "DE", "Duisburg", "elg.de", ["ss-304"]),
    C("Oryx Stainless", "DE", "Mülheim", "oryx.de", ["ss-304"]),
    C("TSR Recycling", "DE", "Lünen", "tsr.eu", ["cu-scrap-berry", "al-scrap-ubc", "ss-304"]),
    C("Scholz Recycling", "DE", "Essingen", "scholz-recycling.de", ["cu-scrap-berry", "al-scrap-ubc"]),
    C("Novelis Deutschland", "DE", "Göttingen", "novelis.com", ["al-scrap-ubc", "aluminium-ingots"]),
    C("HME Brass Germany", "DE", "Berlin", "hmemetal.com", ["brass-alloy-ingots", "brass-billet"]),

    /* ---------------- Italy ---------------- */
    C("KME Italy S.p.A.", "IT", "Florence", "kme.com", ["copper-busbar", "copper-pipe"]),
    C("Raffmetal S.p.A.", "IT", "Casto (Brescia)", "raffmetal.it", ["aluminium-ingots", "al-scrap-ubc"]),
    C("Eural Gnutti S.p.A.", "IT", "Rovato (Brescia)", "eural.com", ["brass-billet", "brass-alloy-ingots"]),
    C("Eredi Gnutti Metalli", "IT", "Brescia", "egm.it", ["brass-billet", "copper-busbar"]),
    C("Profilglass S.p.A.", "IT", "Fano", "profilglass.it", ["aluminium-ingots", "al-scrap-ubc"]),
    C("Laminazione Sottile", "IT", "San Marco Evangelista", "laminazionesottile.com", ["aluminium-ingots", "al-scrap-ubc"]),
    C("Metra S.p.A.", "IT", "Rodengo Saiano", "metra.it", ["aluminium-ingots"]),
    C("Service Metal Company", "IT", "Brescia", "servicemetalco.com", ["brass-billet", "brass-alloy-ingots"]),

    /* ---------------- France ---------------- */
    C("Nexans", "FR", "Paris", "nexans.com", ["copper-rod", "copper-busbar"]),
    C("Constellium SE", "FR", "Paris", "constellium.com", ["aluminium-ingots", "al-scrap-ubc"]),
    C("Recylex SA", "FR", "Suresnes", "recylex.eu", ["lead-refined", "lead-oxide", "zinc-oxide"]),
    C("Aluminium Dunkerque", "FR", "Dunkerque", "aluminiumdunkerque.com", ["aluminium-ingots", "al-sows"]),
    C("Derichebourg Environnement", "FR", "Paris", "derichebourg.com", ["cu-scrap-berry", "al-scrap-ubc", "ss-304"]),
    C("Paprec Group", "FR", "La Courneuve", "paprec.com", ["cu-scrap-berry", "al-scrap-ubc"]),
    C("Eramet", "FR", "Paris", "eramet.com", ["ss-304"]),

    /* ---------------- Spain ---------------- */
    C("Atlantic Copper S.L.U.", "ES", "Huelva", "atlanticcopper.es", ["copper-cathode", "copper-billet"]),
    C("Cunext Group", "ES", "Córdoba", "cunext.com", ["copper-rod", "copper-cathode"]),
    C("La Farga", "ES", "Les Masies de Voltregà", "lafarga.com", ["copper-rod", "copper-busbar", "cu-scrap-millberry"]),
    C("Aludium", "ES", "Madrid", "aludium.com", ["aluminium-ingots", "al-scrap-ubc"]),
    C("Alcoa San Ciprián", "ES", "Lugo", "alcoa.com", ["aluminium-ingots", "al-sows"]),
    C("Befesa S.A.", "ES", "Bilbao", "befesa.com", ["zinc-oxide", "al-scrap-ubc"]),

    /* ---------------- Poland ---------------- */
    C("KGHM Polska Miedź S.A.", "PL", "Lubin", "kghm.com", ["copper-cathode", "copper-rod", "copper-billet"]),
    C("Grupa Kęty S.A.", "PL", "Kęty", "grupakety.com", ["aluminium-ingots", "al-scrap-ubc"]),
    C("Boryszew S.A. (Hutmen)", "PL", "Warsaw", "boryszew.com", ["brass-billet", "copper-busbar"]),
    C("Impexmetal S.A.", "PL", "Warsaw", "impexmetal.com", ["brass-alloy-ingots", "copper-busbar"]),
    C("Huta Cynku Miasteczko Śląskie", "PL", "Miasteczko Śląskie", "hcm.com.pl", ["zinc-ingot-hg", "zinc-oxide"]),

    /* ---------------- Belgium ---------------- */
    C("Umicore", "BE", "Brussels", "umicore.com", ["lead-oxide", "zinc-oxide", "copper-cathode"]),
    C("Aurubis Beerse", "BE", "Beerse", "aurubis.com", ["copper-cathode", "cu-scrap-millberry"]),
    C("Campine NV", "BE", "Beerse", "campine.com", ["lead-oxide", "lead-antimony"]),

    /* ---------------- Netherlands ---------------- */
    C("Nyrstar Budel", "NL", "Budel", "nyrstar.com", ["zinc-ingot-hg", "zinc-oxide"]),
    C("Nedzink B.V.", "NL", "Budel", "nedzink.com", ["zinc-ingot-hg", "zinc-oxide"]),
    C("Aldel (Aluminium Delfzijl)", "NL", "Delfzijl", "aldel.nl", ["aluminium-ingots", "al-sows"]),
    C("Oryx Stainless (NL)", "NL", "Roermond", "oryx.de", ["ss-304"]),

    /* ---------------- Sweden ---------------- */
    C("Boliden AB", "SE", "Stockholm", "boliden.com", ["copper-cathode", "zinc-ingot-hg", "lead-refined"]),
    C("Gränges AB", "SE", "Stockholm", "granges.com", ["aluminium-ingots", "al-scrap-ubc"]),
    C("Stena Metall AB", "SE", "Gothenburg", "stenametall.com", ["cu-scrap-berry", "al-scrap-ubc", "ss-304"]),

    /* ---------------- Finland ---------------- */
    C("Kuusakoski Oy", "FI", "Espoo", "kuusakoski.com", ["cu-scrap-millberry", "al-scrap-ubc", "ss-304"]),
    C("Boliden Harjavalta Oy", "FI", "Harjavalta", "boliden.com", ["copper-cathode"]),

    /* ---------------- Austria ---------------- */
    C("AMAG Austria Metall AG", "AT", "Ranshofen", "amag.at", ["aluminium-ingots", "al-scrap-ubc", "al-sows"], "md-amag@amag.at"),
    C("Montanwerke Brixlegg AG", "AT", "Brixlegg", "montanwerke-brixlegg.com", ["copper-cathode", "cu-scrap-millberry"]),

    /* ---------------- Greece ---------------- */
    C("ElvalHalcor S.A.", "GR", "Athens", "elvalhalcor.com", ["copper-busbar", "aluminium-ingots", "copper-pipe"]),
    C("Metlen (Aluminium of Greece)", "GR", "Athens", "metlen.com", ["aluminium-ingots", "al-sows"]),
    C("Viohalco", "GR", "Athens", "viohalco.com", ["copper-busbar", "aluminium-ingots"]),

    /* ---------------- Bulgaria ---------------- */
    C("Aurubis Bulgaria AD", "BG", "Pirdop", "aurubis.com", ["copper-cathode"]),
    C("KCM AD", "BG", "Plovdiv", "kcm.bg", ["lead-refined", "zinc-ingot-hg", "zinc-oxide"]),
    C("Alcomet AD", "BG", "Shumen", "alcomet.eu", ["aluminium-ingots", "al-scrap-ubc"]),

    /* ---------------- Slovenia ---------------- */
    C("Talum d.d.", "SI", "Kidričevo", "talum.si", ["aluminium-ingots", "al-sows"]),
    C("Impol Group", "SI", "Slovenska Bistrica", "impol.si", ["aluminium-ingots", "al-scrap-ubc"]),

    /* ---------------- Slovakia ---------------- */
    C("Slovalco a.s.", "SK", "Žiar nad Hronom", "slovalco.sk", ["aluminium-ingots", "al-sows"]),
    C("Kovohuty a.s.", "SK", "Krompachy", "kovohuty.sk", ["copper-cathode", "cu-scrap-millberry"]),

    /* ---------------- Czechia ---------------- */
    C("Kovohutě Příbram", "CZ", "Příbram", "kovohute.cz", ["lead-refined", "lead-oxide"]),
    C("AL INVEST Břidličná, a.s.", "CZ", "Břidličná", "alinvest.cz", ["aluminium-ingots", "al-scrap-ubc"]),

    /* ---------------- Romania ---------------- */
    C("Alro S.A.", "RO", "Slatina", "alro.ro", ["aluminium-ingots", "al-sows", "al-scrap-ubc"]),

    /* ---------------- Hungary ---------------- */
    C("Hydro Extrusion Hungary", "HU", "Székesfehérvár", "hydro.com", ["aluminium-ingots", "al-scrap-ubc"]),

    /* ---------------- Denmark ---------------- */
    C("H.J. Hansen Recycling", "DK", "Odense", "hjhansen.dk", ["cu-scrap-berry", "al-scrap-ubc", "ss-304"]),
    C("Stena Recycling Denmark", "DK", "Roskilde", "stenarecycling.dk", ["cu-scrap-berry", "al-scrap-ubc"]),

    /* ---------------- Croatia ---------------- */
    C("TLM d.d. Šibenik", "HR", "Šibenik", "tlm.hr", ["aluminium-ingots", "al-scrap-ubc"]),

    /* ---------------- Luxembourg ---------------- */
    C("Befesa (HQ)", "LU", "Luxembourg", "befesa.com", ["zinc-oxide"]),

    /* ---------------- Portugal ---------------- */
    C("Cabelte", "PT", "Porto", "cabelte.pt", ["copper-rod", "copper-busbar"]),

    /* ---------------- Ireland ---------------- */
    C("Hammond Lane Metal Company", "IE", "Dublin", "hammondlane.ie", ["cu-scrap-berry", "al-scrap-ubc", "ss-304"]),

    /* ---------------- Lithuania ---------------- */
    C("EMP Recycling", "LT", "Vilnius", "emp.lt", ["cu-scrap-berry", "al-scrap-ubc"]),

    /* ---------------- Estonia ---------------- */
    C("Kuusakoski AS (Estonia)", "EE", "Tallinn", "kuusakoski.com", ["cu-scrap-millberry", "al-scrap-ubc"])
  ];

})(window.App);
