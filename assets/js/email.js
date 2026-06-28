/* ============================================================
   email.js  —  Gmail compose links + pre-written templates
   ============================================================ */
window.App = window.App || {};

(function (App) {
  "use strict";

  var Email = {
    /* Build a pre-written subject + body for a company, including the
       products they buy and today's live prices from the panel.
       Optional `person` targets a specific contact for the greeting. */
    buildDraft: function (company, person) {
      var s = App.Store.settings();
      var prices = App.Store.prices();

      var products = (company.materials || [])
        .map(function (id) { var p = App.productById(id); return p ? p.name : null; })
        .filter(Boolean);

      var contactName = (person && person.name) || company.contactName;
      var greeting = contactName
        ? "Dear " + firstName(contactName) + ","
        : "Dear Sir or Madam,";

      var productLines = products.length
        ? products.map(function (n) { return "  • " + n; }).join("\n")
        : "  • Copper, aluminium, zinc and lead — full list on request";

      var priceLines = buildPriceBlock(prices);
      var headline = products.length ? products[0] : "non-ferrous metals";

      // If a default template is set, render it with placeholders.
      var tplId = s.defaultTemplateId;
      var tpl = tplId && (s.templates || []).filter(function (t) { return t.id === tplId; })[0];
      if (tpl) {
        var map = {
          "{{contact}}": contactName ? firstName(contactName) : "Sir or Madam",
          "{{company}}": company.name || "your company",
          "{{products}}": products.length ? products.join(", ") : "non-ferrous metals",
          "{{prices}}": priceLines.trim(),
          "{{me}}": s.senderName || "",
          "{{myCompany}}": s.companyName || ""
        };
        function sub(str) {
          return String(str || "").replace(/\{\{contact\}\}|\{\{company\}\}|\{\{products\}\}|\{\{prices\}\}|\{\{me\}\}|\{\{myCompany\}\}/g, function (m) { return map[m]; });
        }
        return { subject: sub(tpl.subject) || (s.companyName + " — offer"), body: sub(tpl.body) };
      }

      var subject = products.length
        ? (headline + (products.length > 1 ? " & more" : "") + " — direct from " + s.companyName)
        : ("Non-ferrous supply — " + s.companyName);

      // A tighter, trader-style pitch: who we are, what we supply, today's
      // reference prices, why us, and a single clear call to action.
      var body =
        greeting + "\n\n" +
        "I'm " + s.senderName + (s.senderTitle ? ", " + s.senderTitle : "") +
        " at " + s.companyName + ", a direct supplier of non-ferrous metals. " +
        "I'm reaching out because " + (company.name || "your team") +
        " is active in exactly the material we move, and I'd like to be a reliable second source for you.\n\n" +
        "What we can supply" + (products.length ? " to you" : "") + ":\n" +
        productLines + "\n\n" +
        priceLines +
        "\nWhy work with us:\n" +
        "  • Producer-direct pricing, formula-linked to the LME\n" +
        "  • SGS / pre-shipment inspection and full specs on every lot\n" +
        "  • CIF or FOB, flexible Incoterms and recurring monthly tonnage\n\n" +
        "If you can share your current requirement — material, target tonnage and delivery port — " +
        "I'll come back with a firm offer the same day.\n\n" +
        "Best regards,\n" +
        s.senderName + "\n" +
        (s.senderTitle ? s.senderTitle + "\n" : "") +
        s.companyName +
        (s.phone ? "\nTel: " + s.phone : "") +
        (s.website ? "\n" + s.website : "") +
        (s.senderEmail ? "\n" + s.senderEmail : "") +
        (s.signature ? "\n\n" + s.signature : "");

      // Optional engagement tracking link (logged by your proxy on click).
      if (s.trackEmails && company.id) {
        var base = (s.apolloProxyUrl || "").replace(/\/+$/, "");
        if (base) body += "\n\nView our latest catalogue & prices: " + base + "/api/track?c=" + company.id;
      }

      return { subject: subject, body: body };
    },

    /* Gmail "compose" deep link — opens a new mail pre-filled, ready to review + send. */
    composeUrl: function (company, person) {
      var draft = this.buildDraft(company, person);
      var to = (person && person.email) || company.email || "";
      var params =
        "view=cm&fs=1" +
        "&to=" + encodeURIComponent(to) +
        "&su=" + encodeURIComponent(draft.subject) +
        "&body=" + encodeURIComponent(draft.body);
      return "https://mail.google.com/mail/?" + params;
    },

    /* Gmail search link — jumps to the thread with this contact. */
    threadUrl: function (company) {
      var email = company.email || "";
      var q = email
        ? "(to:" + email + " OR from:" + email + ")"
        : (company.name || "");
      return "https://mail.google.com/mail/u/0/#search/" + encodeURIComponent(q);
    }
  };

  function firstName(full) {
    return String(full || "").trim().split(/\s+/)[0] || full;
  }

  function buildPriceBlock(prices) {
    var rows = prices.rows || {};
    var lines = [];
    function add(label, v) {
      if (v != null && v !== "" && !isNaN(v)) {
        lines.push("  • " + label + ": " + Number(v).toLocaleString("en-US") + " " + prices.currency + "/MT");
      }
    }
    add("LME Copper", rows.copper && rows.copper.value);
    var alAllIn = App.Prices.aluminiumAllIn(prices);
    if (alAllIn != null) {
      add("LME Aluminium (incl. EU duty-paid premium)", alAllIn);
    } else {
      add("LME Aluminium", rows.aluminium && rows.aluminium.value);
    }
    add("LME Zinc", rows.zinc && rows.zinc.value);
    add("LME Lead", rows.lead && rows.lead.value);
    add("LME Nickel", rows.nickel && rows.nickel.value);

    if (!lines.length) return "";
    return "Indicative reference prices today:\n" + lines.join("\n") +
      "\n(Offers are formula-based on the prevailing exchange price; final price confirmed at contract.)\n";
  }

  App.Email = Email;

})(window.App);
