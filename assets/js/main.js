/* ==========================================================================
   Zwartwerk — sitescript
   Let op: dit is een front-end prototype. Abonnementen en accounts worden
   in de browser (localStorage) bewaard. Voor livegang koppelen aan een
   echte backend + betaalprovider (bijv. Mollie). Zie README.md.
   ========================================================================== */
(function () {
  "use strict";

  document.documentElement.classList.remove("no-js");

  /* ------------------------------------------------------------------------
     Instellingen — prijzen en acties hier aanpassen
     ------------------------------------------------------------------------ */
  var CONFIG = {
    // Prijzen per levering, inclusief verzending. We versturen alleen zakken van
    // 250 gram, zodat alles door de brievenbus past (500 gram = 2 zakken).
    sizes: {
      "250": { label: "250 gram", bags: "1 zak van 250 gram", cups: "± 30 koppen", price: 16 },
      "500": { label: "500 gram", bags: "2 zakken van 250 gram", cups: "± 60 koppen", price: 29 }
    },
    // De bonen wisselen per maand. Bij 2× per maand krijg je binnen een maand
    // twee leveringen van dezelfde koffie; de maand erna een nieuwe smaak.
    freqs: {
      "1m": { label: "1× per maand", perMonth: 1 },
      "2m": { label: "2× per maand", perMonth: 2 }
    },
    cancelDays: 7, // wijzigen/opzeggen kan tot 7 dagen voor de volgende levering
    grinds: {
      bonen: "Hele bonen",
      espresso: "Espresso",
      filter: "Filter / V60",
      frenchpress: "French press",
      mokapot: "Mokapot"
    },
    roasts: {
      verras: "Verras me",
      licht: "Licht",
      "medium-licht": "Medium-licht",
      medium: "Medium",
      "medium-donker": "Medium-donker",
      donker: "Donker"
    },
    pay: "iDEAL | Wero",
    email: "info@zwartwerkkoffie.nl",
    welcomeDiscount: 0.25 // 25% korting op de eerste levering
  };

  var eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  var dateFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  var dateShort = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  var monthFmt = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ------------------------------------------------------------------------
     Iconen (sprite, inline geïnjecteerd zodat <use href="#i-..."> overal werkt)
     ------------------------------------------------------------------------ */
  var ICONS = {
    bean: '<path d="M12 3c4.5 0 7 4 7 9s-2.5 9-7 9-7-4-7-9 2.5-9 7-9z"/><path d="M13.5 3.3C10 7 14 11 11.5 14.5 10 16.5 10.8 19 10.5 20.8"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    flame: '<path d="M12 21c-4 0-6.5-2.8-6.5-6.3 0-3.7 3-5.6 3.8-9.2 2.6 1.6 3.4 4 3.2 5.8 1-.6 1.8-1.9 2-3.3 2 1.8 4 4.2 4 6.9 0 3.5-2.5 6.1-6.5 6.1z"/>',
    mountain: '<path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M7.2 11l1.8 1.5 1.6-1.3"/>',
    leaf: '<path d="M12 21V10"/><path d="M12 13c-5 0-8-3-8-8 5 0 8 3 8 8z"/><path d="M12 11c0-4.5 3-7 8-7 0 5-3 7-8 7z"/>',
    cup: '<path d="M4 9h13v5a6 6 0 01-6 6h-1a6 6 0 01-6-6z"/><path d="M17 11h1.5a2.5 2.5 0 010 5H16"/><path d="M8 2.5c0 1.5 1.5 1.5 1.5 3S8 7 8 7M12 2.5c0 1.5 1.5 1.5 1.5 3S12 7 12 7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A17 17 0 013 5a2 2 0 012-2z"/>',
    chat: '<path d="M4 19l1.5-4A8 8 0 1112 20a8 8 0 01-4-1z"/><path d="M9 10.5c.3 1.8 2.2 3.7 4 4l1.2-1.1 1.8.8"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    box: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>',
    refresh: '<path d="M20 11a8 8 0 00-14.3-4.3L4 9M4 4v5h5M4 13a8 8 0 0014.3 4.3L20 15M20 20v-5h-5"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    passport: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><circle cx="12" cy="10" r="3.5"/><path d="M8.5 10h7M12 6.5c-1.2 1-1.2 6 0 7M12 6.5c1.2 1 1.2 6 0 7M8 17.5h8"/>',
    receipt: '<path d="M5 3h14v18l-2.3-1.5L14.3 21 12 19.5 9.7 21l-2.4-1.5L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    logout: '<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 16l-4-4 4-4M6 12h11"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8S10.5 3.5 8 4s-1.5 4 4 4zM12 8s1.5-4.5 4-4 1.5 4-4 4z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
    facebook: '<path d="M14 8h3V4h-3a4 4 0 00-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    return: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    heart: '<path d="M12 20s-7.5-4.5-7.5-10A4.5 4.5 0 0112 7.2 4.5 4.5 0 0119.5 10c0 5.5-7.5 10-7.5 10z"/>',
    skip: '<path d="M5 5l9 7-9 7zM18 5v14"/>'
  };
  (function injectSprite() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">';
    Object.keys(ICONS).forEach(function (k) {
      s += '<symbol id="i-' + k + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICONS[k] + "</symbol>";
    });
    s += "</svg>";
    var d = document.createElement("div");
    d.innerHTML = s;
    document.body.insertBefore(d.firstChild, document.body.firstChild);
  })();
  function icon(name) { return '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }

  /* ------------------------------------------------------------------------
     Opslag (veilig: werkt ook als localStorage geblokkeerd is)
     ------------------------------------------------------------------------ */
  var memory = {};
  var store = {
    get: function (k, fallback) {
      try {
        var v = localStorage.getItem(k);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return k in memory ? memory[k] : fallback;
      }
    },
    set: function (k, v) {
      memory[k] = v;
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* negeren */ }
    },
    del: function (k) {
      delete memory[k];
      try { localStorage.removeItem(k); } catch (e) { /* negeren */ }
    }
  };
  var ACCOUNTS = "zw_accounts";
  var SESSION = "zw_session";
  function getAccounts() { return store.get(ACCOUNTS, {}); }
  function saveAccount(acc) {
    var all = getAccounts();
    all[acc.email.toLowerCase()] = acc;
    store.set(ACCOUNTS, all);
  }
  function currentAccount() {
    var email = store.get(SESSION, null);
    if (!email) return null;
    var acc = getAccounts()[email];
    return acc ? migrate(acc) : null;
  }
  function login(email) { store.set(SESSION, email.toLowerCase()); }
  function logout() { store.del(SESSION); }

  /* ------------------------------------------------------------------------
     Datumhulpjes
     ------------------------------------------------------------------------ */
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  // Eerste levering: eerstvolgende dinsdag, minimaal 3 dagen vooruit (tijd om vers te branden)
  function firstDeliveryDate(minDays) {
    var d = addDays(startOfDay(new Date()), minDays || 3);
    while (d.getDay() !== 2) d = addDays(d, 1);
    return d;
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function addMonths(d, n) {
    var x = new Date(d);
    var day = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + n);
    var last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
    return x;
  }

  /* Leverschema. Elke 'periode' is een maand vanaf de startdatum (anchor) en
     heeft één smaak. 1× per maand: één levering per periode. 2× per maand:
     een tweede levering 14 dagen later, met dezelfde bonen. */
  function schedule(sub, from, count) {
    var anchor = startOfDay(new Date(sub.anchor));
    var per = CONFIG.freqs[sub.freq].perMonth;
    var out = [];
    var start = startOfDay(from);
    for (var k = 0; out.length < count && k < 240; k++) {
      var base = addMonths(anchor, k);
      while (base.getDay() !== 2) base = addDays(base, 1); // we leveren op dinsdag
      for (var j = 0; j < per; j++) {
        var d = addDays(base, j * 14);
        var skipped = (sub.skipped || []).some(function (x) { return +startOfDay(new Date(x)) === +d; });
        if (d >= start && !skipped) out.push({ date: d, period: k, newFlavour: j === 0, flavourMonth: base });
        if (out.length >= count) break;
      }
    }
    return out;
  }
  function nextAfter(sub, date) { return schedule(sub, addDays(date, 1), 1)[0].date; }
  // Laatste dag waarop je nog kunt wijzigen/opzeggen voor een levering
  function deadlineFor(date) { return addDays(date, -CONFIG.cancelDays); }

  /* ------------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------------ */
  var toastEl;
  var toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-visible"); }, 3200);
  }

  /* ------------------------------------------------------------------------
     Algemeen: navigatie, jaartal, reveal-animaties, header-accountlink
     ------------------------------------------------------------------------ */
  var navToggle = $(".nav-toggle");
  var nav = $(".nav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.innerHTML = icon(open ? "close" : "menu");
    });
    $$("a", nav).forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.innerHTML = icon("menu");
      });
    });
  }
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  var acc0 = currentAccount();
  $$("[data-account-label]").forEach(function (el) {
    el.textContent = acc0 ? "Hoi " + acc0.name.split(" ")[0] : "Inloggen";
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    $$(".reveal").forEach(function (el) { el.classList.add("is-in"); });
  }

  // Nieuwsbrief (footer)
  $$(".newsletter").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("input", f);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
        toast("Vul een geldig e-mailadres in.");
        input.focus();
        return;
      }
      input.value = "";
      toast("Top! Je hoort van ons zodra er een nieuwe batch uit de brander komt.");
    });
  });

  /* ------------------------------------------------------------------------
     Formuliervalidatie
     ------------------------------------------------------------------------ */
  var validators = {
    required: function (v) { return v.trim().length > 0; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); },
    postcode: function (v) { return /^[1-9][0-9]{3}\s?[a-zA-Z]{2}$/.test(v.trim()); },
    password: function (v) { return v.length >= 6; }
  };
  function validateForm(form) {
    var firstBad = null;
    $$("[data-validate]", form).forEach(function (input) {
      var field = input.closest(".field");
      var rules = input.getAttribute("data-validate").split(" ");
      var ok = true;
      if (input.type === "checkbox") {
        ok = input.checked;
      } else {
        rules.forEach(function (r) { if (validators[r] && !validators[r](input.value)) ok = false; });
      }
      if (field) field.classList.toggle("invalid", !ok);
      input.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !firstBad) firstBad = input;
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }
  document.addEventListener("input", function (e) {
    var f = e.target.closest && e.target.closest(".field.invalid");
    if (f) f.classList.remove("invalid");
  });

  /* ------------------------------------------------------------------------
     Configurator (home)
     ------------------------------------------------------------------------ */
  var subForm = $("#subscribe-form");
  if (subForm) initConfigurator(subForm);

  function readChoice(form, name) {
    var el = $('input[name="' + name + '"]:checked', form);
    return el ? el.value : null;
  }

  function initConfigurator(form) {
    // prijzen in de kaarten zetten
    $$("[data-size-price]", form).forEach(function (el) {
      el.textContent = eur.format(CONFIG.sizes[el.getAttribute("data-size-price")].price) + " per levering";
    });

    // voorkeuze vanuit ?plan=500 of knoppen met data-pick
    var params = new URLSearchParams(location.search);
    if (params.get("plan") && CONFIG.sizes[params.get("plan")]) {
      var r = $('input[name="size"][value="' + params.get("plan") + '"]', form);
      if (r) r.checked = true;
    }
    $$("[data-pick-size]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var r = $('input[name="size"][value="' + btn.getAttribute("data-pick-size") + '"]', form);
        if (r) { r.checked = true; update(); }
      });
    });

    var first = firstDeliveryDate();

    function update() {
      var size = readChoice(form, "size");
      var freq = readChoice(form, "freq");
      var grind = readChoice(form, "grind");
      var roast = readChoice(form, "roast");
      var s = CONFIG.sizes[size];
      var f = CONFIG.freqs[freq];
      var price = s.price;
      var firstPrice = price * (1 - CONFIG.welcomeDiscount);
      var monthly = price * f.perMonth;

      $("#sum-size").textContent = s.label;
      $("#sum-freq").textContent = f.label;
      $("#sum-grind").textContent = CONFIG.grinds[grind];
      $("#sum-roast").textContent = CONFIG.roasts[roast];
      $("#sum-price").textContent = eur.format(price);
      $("#sum-discount").textContent = "− " + eur.format(price - firstPrice);
      $("#sum-first").textContent = eur.format(firstPrice);
      $("#sum-monthly").textContent = "Daarna " + eur.format(price) + " per levering" + (f.perMonth > 1 ? " (" + eur.format(monthly) + " per maand)" : "");
      $("#sum-date").textContent = capitalize(dateFmt.format(first));
      var note = $("#freq-note");
      if (note) note.hidden = f.perMonth < 2;
    }
    form.addEventListener("change", update);
    update();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validateForm(form)) {
        toast("Nog even checken: een paar velden missen.");
        return;
      }
      var fd = new FormData(form);
      var email = String(fd.get("email")).trim().toLowerCase();
      var existing = getAccounts()[email];
      var acc = {
        name: String(fd.get("firstname")).trim() + " " + String(fd.get("lastname")).trim(),
        email: email,
        password: String(fd.get("password")),
        phone: String(fd.get("phone") || "").trim(),
        address: {
          street: String(fd.get("street")).trim(),
          nr: String(fd.get("nr")).trim(),
          postcode: String(fd.get("postcode")).trim().toUpperCase(),
          city: String(fd.get("city")).trim()
        },
        memberSince: new Date().toISOString(),
        newsletter: !!fd.get("newsletter"),
        sub: {
          size: readChoice(form, "size"),
          freq: readChoice(form, "freq"),
          grind: readChoice(form, "grind"),
          roast: readChoice(form, "roast"),
          pay: "ideal-wero",
          status: "actief",
          pausedUntil: null,
          anchor: first.toISOString(),
          nextDelivery: first.toISOString(),
          note: ""
        },
        deliveries: existing ? existing.deliveries : [],
        referral: "ZW-" + String(fd.get("firstname")).trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) + Math.floor(100 + Math.random() * 900)
      };
      saveAccount(acc);
      login(email);

      $("#sub-flow").hidden = true;
      var ok = $("#sub-success");
      $("#success-name").textContent = acc.name.split(" ")[0];
      $("#success-date").textContent = dateFmt.format(first);
      ok.classList.add("is-visible");
      ok.scrollIntoView({ behavior: "smooth", block: "start" });
      $$("[data-account-label]").forEach(function (el) { el.textContent = "Hoi " + acc.name.split(" ")[0]; });
    });
  }

  /* ------------------------------------------------------------------------
     FAQ: zoeken en categorieën (klantenservice)
     ------------------------------------------------------------------------ */
  var faqSearch = $("#faq-search");
  if (faqSearch) {
    var groups = $$(".faq-group");
    var catBtns = $$(".faq-cats button");
    var empty = $(".faq-empty");
    var activeCat = "alle";

    function filterFaq() {
      var q = faqSearch.value.trim().toLowerCase();
      var anyVisible = false;
      groups.forEach(function (g) {
        var catOk = activeCat === "alle" || g.getAttribute("data-cat") === activeCat;
        var groupVisible = false;
        $$("details", g).forEach(function (d) {
          var match = !q || d.textContent.toLowerCase().indexOf(q) > -1;
          d.hidden = !(match && catOk);
          if (q && match && catOk) d.open = true;
          if (!d.hidden) groupVisible = true;
        });
        g.hidden = !groupVisible;
        if (groupVisible) anyVisible = true;
      });
      empty.style.display = anyVisible ? "none" : "block";
    }
    faqSearch.addEventListener("input", filterFaq);
    catBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        catBtns.forEach(function (x) { x.classList.remove("is-active"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("is-active");
        b.setAttribute("aria-pressed", "true");
        activeCat = b.getAttribute("data-cat");
        filterFaq();
      });
    });
    // deeplink naar categorie: klantenservice.html#faq-bezorging
    var hashCat = location.hash.match(/^#faq-(\w+)/);
    if (hashCat) {
      var b = $('.faq-cats button[data-cat="' + hashCat[1] + '"]');
      if (b) b.click();
    }
  }

  /* ------------------------------------------------------------------------
     Contactformulier
     ------------------------------------------------------------------------ */
  var contactForm = $("#contact-form");
  if (contactForm) {
    var acc1 = currentAccount();
    if (acc1) {
      contactForm.elements.name.value = acc1.name;
      contactForm.elements.email.value = acc1.email;
    }
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validateForm(contactForm)) return;
      // Zonder server: open het mailprogramma met een ingevuld bericht
      var el = contactForm.elements;
      var body = el.message.value.trim() + "\n\n—\nNaam: " + el.name.value.trim() + "\nE-mail: " + el.email.value.trim() +
        (el.batch.value.trim() ? "\nBatchnummer: " + el.batch.value.trim() : "");
      location.href = "mailto:" + CONFIG.email + "?subject=" + encodeURIComponent(el.topic.value) + "&body=" + encodeURIComponent(body);
      $("#contact-msg").textContent = "Je mailprogramma opent met je bericht. Opent er niets? Mail ons direct op " + CONFIG.email + ".";
      $("#contact-msg").classList.add("ok");
    });
  }

  /* ------------------------------------------------------------------------
     Account
     ------------------------------------------------------------------------ */
  var accountRoot = $("#account-root");
  if (accountRoot) initAccount();

  // Voorbeeldgegevens voor het demo-account
  var ORIGINS = [
    { country: "Ethiopië", region: "Guji", farm: "Coöperatie Hambela", process: "Natural", notes: ["bosbes", "jasmijn", "melkchocolade"], roast: 1 },
    { country: "Colombia", region: "Huila", farm: "Finca La Esperanza", process: "Washed", notes: ["rode appel", "karamel", "cacao"], roast: 3 },
    { country: "Kenia", region: "Nyeri", farm: "Gatomboya Factory", process: "Washed", notes: ["zwarte bes", "grapefruit", "rietsuiker"], roast: 2 },
    { country: "Guatemala", region: "Huehuetenango", farm: "Familie López", process: "Washed", notes: ["hazelnoot", "sinaasappel", "bruine suiker"], roast: 3 },
    { country: "Brazilië", region: "Mogiana", farm: "Fazenda Santa Inês", process: "Natural", notes: ["pinda", "pure chocolade", "toffee"], roast: 4 },
    { country: "Rwanda", region: "Nyamasheke", farm: "Kanzu Washing Station", process: "Washed", notes: ["cranberry", "zwarte thee", "honing"], roast: 2 },
    { country: "Indonesië", region: "Sumatra", farm: "Kleine boeren Gayo", process: "Wet-hulled", notes: ["kruiden", "cederhout", "pure chocolade"], roast: 5 }
  ];

  function makeDemoAccount() {
    var next = firstDeliveryDate(10);
    var sub = {
      size: "500", freq: "2m", grind: "bonen", roast: "verras", pay: "ideal-wero",
      status: "actief", pausedUntil: null, note: "Liever niet te zuur.",
      anchor: addMonths(next, -4).toISOString(), nextDelivery: next.toISOString()
    };
    var ratings = [5, 4, 0, 0];
    var deliveries = schedule(sub, new Date(sub.anchor), 8).map(function (s, i) {
      var o = ORIGINS[s.period % ORIGINS.length];
      var m = s.flavourMonth;
      return {
        batch: "ZW-" + (m.getFullYear() % 100) + String(m.getMonth() + 1).padStart(2, "0") + "-" + (12 + s.period * 3),
        date: s.date.toISOString(),
        country: o.country, region: o.region, farm: o.farm, process: o.process, notes: o.notes, roast: o.roast,
        size: "500", grind: "bonen", price: i === 0 ? 29 * (1 - CONFIG.welcomeDiscount) : 29,
        status: "bezorgd",
        rating: ratings[s.period] || 0
      };
    });
    return {
      name: "Sam de Vries",
      email: "demo@zwartwerk.nl",
      password: "koffie",
      phone: "06 12345678",
      address: { street: "Voorbeeldstraat", nr: "12", postcode: "3741 AB", city: "Baarn" },
      memberSince: sub.anchor,
      newsletter: true,
      sub: sub,
      deliveries: deliveries,
      referral: "ZW-SAM482"
    };
  }

  // Unieke batches (bij 2× per maand komt dezelfde batch twee keer)
  function batches(acc) {
    var seen = {};
    return acc.deliveries.filter(function (d) {
      if (seen[d.batch]) return false;
      seen[d.batch] = true;
      return true;
    });
  }
  // Oudere accounts (uit de eerste versie) bijwerken naar het huidige model
  function migrate(acc) {
    var sub = acc.sub;
    if (!CONFIG.freqs[sub.freq]) sub.freq = sub.freq === "2w" ? "2m" : "1m";
    if (!CONFIG.sizes[sub.size]) sub.size = "500";
    if (!sub.anchor) sub.anchor = sub.nextDelivery;
    sub.pay = "ideal-wero";
    acc.deliveries.forEach(function (d) { if (!CONFIG.sizes[d.size]) d.size = "500"; });
    return acc;
  }

  function initAccount() {
    var authView = $("#auth-view");
    var dashView = $("#dash-view");

    function show() {
      var acc = currentAccount();
      authView.hidden = !!acc;
      dashView.hidden = !acc;
      if (acc) renderDashboard(acc);
    }

    // Inloggen
    $("#login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var msg = $("#login-msg");
      if (!validateForm(f)) return;
      var email = f.elements.email.value.trim().toLowerCase();
      var acc = getAccounts()[email];
      if (email === "demo@zwartwerk.nl" && !acc) { acc = makeDemoAccount(); saveAccount(acc); }
      if (!acc || acc.password !== f.elements.password.value) {
        msg.textContent = "Dat e-mailadres en wachtwoord kennen we niet samen. Probeer het nog eens.";
        return;
      }
      msg.textContent = "";
      login(email);
      show();
      window.scrollTo(0, 0);
    });
    $("#demo-login").addEventListener("click", function () {
      var demo = makeDemoAccount();
      saveAccount(demo);
      login(demo.email);
      show();
      window.scrollTo(0, 0);
      toast("Je bekijkt nu het demo-account.");
    });
    $("#forgot-link").addEventListener("click", function (e) {
      e.preventDefault();
      var email = $("#login-form").elements.email.value.trim();
      $("#login-msg").classList.add("ok");
      $("#login-msg").textContent = email
        ? "Als " + email + " bij ons bekend is, ontvang je binnen een paar minuten een resetlink."
        : "Vul eerst je e-mailadres in, dan sturen we je een resetlink.";
    });

    show();
  }

  function renderDashboard(acc) {
    var root = $("#dash-view");
    var sub = acc.sub;
    var size = CONFIG.sizes[sub.size];
    var freq = CONFIG.freqs[sub.freq];
    var next = new Date(sub.nextDelivery);
    var firstName = acc.name.split(" ")[0];

    // Leveringen die al geweest zouden zijn: niet automatisch toevoegen (prototype)
    function persist() { saveAccount(acc); }

    // ---- zijbalk
    $(".acc-user .avatar", root).textContent = firstName.charAt(0).toUpperCase();
    $(".acc-user .name", root).textContent = acc.name;
    $(".acc-user .since", root).textContent = "Lid sinds " + monthFmt.format(new Date(acc.memberSince));

    // ---- panelen wisselen
    var buttons = $$(".acc-nav [data-tab]", root);
    function openTab(id, focus) {
      buttons.forEach(function (b) {
        var on = b.getAttribute("data-tab") === id;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      $$(".acc-panel", root).forEach(function (p) { p.classList.toggle("is-active", p.id === "tab-" + id); });
      if (history.replaceState) history.replaceState(null, "", "#" + id);
      if (focus) { var h = $("#tab-" + id + " h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } }
    }
    buttons.forEach(function (b) {
      b.onclick = function () { openTab(b.getAttribute("data-tab"), true); };
    });
    var initial = location.hash.replace("#", "");
    openTab($("#tab-" + initial) ? initial : "overzicht");

    $("#logout-btn").onclick = function () {
      logout();
      location.href = "account.html";
    };

    // ---- OVERZICHT
    var statusChip = sub.status === "actief"
      ? '<span class="chip chip--ok">Actief</span>'
      : sub.status === "gepauzeerd"
        ? '<span class="chip chip--warn">Gepauzeerd</span>'
        : '<span class="chip">Opgezegd</span>';

    var days = Math.max(0, Math.ceil((startOfDay(next) - startOfDay(new Date())) / 864e5));
    var allBatches = batches(acc);
    var rated = allBatches.filter(function (d) { return d.rating; }).length;
    var countries = uniq(acc.deliveries.map(function (d) { return d.country; }));
    var last = acc.deliveries[acc.deliveries.length - 1];
    var today = startOfDay(new Date());
    var nextInfo = schedule(sub, next, 1)[0];
    var newFlavour = !nextInfo || +nextInfo.date !== +startOfDay(next) || nextInfo.newFlavour;
    var locked = today > deadlineFor(next); // binnen 7 dagen: wordt al gebrand
    var bagsShort = sub.size === "500" ? "2×250g" : "250g";

    var nextBlock;
    if (sub.status === "opgezegd") {
      nextBlock = '<h3>Je abonnement</h3><div class="big">Opgezegd</div><p class="muted" style="margin-top:10px">Jammer dat je gaat! Je kunt op elk moment weer instappen — je bonenhistorie bewaren we, zodat je geen smaak twee keer krijgt.</p>' + (sub.lastDelivery && new Date(sub.lastDelivery) >= today ? '<p class="muted">Je laatste levering komt nog op ' + esc(dateFmt.format(new Date(sub.lastDelivery))) + '.</p>' : '') + '<div class="actions"><button class="btn" data-action="restart">Abonnement hervatten</button></div>';
    } else if (sub.status === "gepauzeerd") {
      nextBlock = '<h3>Volgende levering ' + statusChip + '</h3><div class="big">' + esc(capitalize(dateFmt.format(next))) + '</div><p class="muted" style="margin-top:10px">Je abonnement staat op pauze. Daarna gaan we gewoon verder met een nieuwe verrassing.</p><div class="actions"><button class="btn" data-action="resume">Nu hervatten</button></div>';
    } else {
      nextBlock = '<h3>Volgende levering ' + statusChip + "</h3>" +
        '<div class="big">' + esc(capitalize(dateFmt.format(next))) + "</div>" +
        '<div class="countdown" aria-label="Nog ' + days + ' dagen"><div><b>' + days + '</b><span>dagen</span></div><div><b>' + (newFlavour ? "?" : "=") + '</b><span>' + (newFlavour ? "nieuwe smaak" : "zelfde smaak") + '</span></div><div><b>' + bagsShort + '</b><span>brievenbus</span></div></div>' +
        '<p class="muted" style="margin:10px 0 0">' + (newFlavour
          ? "Nieuwe maand, nieuwe smaak. Welke bonen? Dat blijft een verrassing tot de brievenbus klepert."
          : "Tweede levering van deze maand: dezelfde bonen als je vorige zak, zodat je er nog even van kunt genieten. Volgende maand weer iets nieuws.") + "</p>" +
        '<p class="muted" style="margin:6px 0 0;font-size:.9rem">' + (locked
          ? "Deze levering wordt al voor je gebrand. Wijzigingen gelden vanaf " + esc(dateFmt.format(nextAfter(sub, next))) + "."
          : "Wijzigen, overslaan of opzeggen kan nog tot en met " + esc(dateFmt.format(deadlineFor(next))) + ".") + "</p>" +
        '<div class="actions"><button class="btn btn--small" data-action="skip">' + icon("skip") + ' Overslaan</button><button class="btn btn--ghost btn--small" data-action="pause">' + icon("pause") + ' Pauzeren</button><button class="btn btn--ghost btn--small" data-goto="abonnement">' + icon("edit") + " Wijzigen</button></div>";
    }

    $("#tab-overzicht").innerHTML =
      '<span class="kicker">Mijn Zwartwerk</span>' +
      "<h2>Goedemorgen, " + esc(firstName) + ".</h2>" +
      '<p class="lead">Alles over je abonnement, leveringen en bonen op één plek.</p>' +
      '<div class="tiles">' +
      '<div class="tile tile--highlight two3">' + nextBlock + '<img class="mystery-bean" src="assets/img/zwartwerk-boon.png" alt=""></div>' +
      '<div class="tile third"><h3>Jouw abonnement</h3><dl class="kv">' +
      "<dt>Zak</dt><dd>" + esc(size.label) + "</dd><dt>Ritme</dt><dd>" + esc(freq.label) + "</dd><dt>Maling</dt><dd>" + esc(CONFIG.grinds[sub.grind]) + "</dd><dt>Profiel</dt><dd>" + esc(CONFIG.roasts[sub.roast]) + "</dd><dt>Prijs</dt><dd>" + eur.format(size.price) + " / levering</dd></dl><p class=\"muted\" style=\"font-size:.85rem;margin:10px 0 0\">Inclusief verzending</p>" +
      '<div class="actions"><button class="link-arrow" style="background:none;border:0;padding:0;cursor:pointer;color:var(--copper)" data-goto="abonnement">Aanpassen</button></div></div>' +
      '<div class="tile third"><h3>Bonenpaspoort</h3><div class="big">' + allBatches.length + " <small>" + (allBatches.length === 1 ? "smaak" : "smaken") + "</small></div>" +
      '<p class="muted" style="margin:8px 0 0">' + countries.length + " " + (countries.length === 1 ? "land" : "landen") + " geproefd · " + rated + " beoordeeld</p>" +
      '<div class="progress" aria-hidden="true"><i style="width:' + Math.min(100, (countries.length / 12) * 100) + '%"></i></div><p class="muted" style="font-size:.85rem;margin:0">' + countries.length + " van 12 herkomstlanden</p>" +
      '<div class="actions"><button class="link-arrow" style="background:none;border:0;padding:0;cursor:pointer;color:var(--copper)" data-goto="paspoort">Bekijk paspoort</button></div></div>' +
      '<div class="tile third"><h3>Laatst ontvangen</h3>' +
      (last
        ? '<div class="big" style="font-size:2rem">' + esc(last.country) + '</div><p class="muted" style="margin:6px 0 0">' + esc(last.region) + " · " + esc(last.notes.join(", ")) + "</p>" + (last.rating ? "" : '<div class="actions"><button class="btn btn--small" data-goto="paspoort">' + icon("star") + " Beoordeel</button></div>")
        : '<div class="big" style="font-size:2rem">Nog even…</div><p class="muted" style="margin:6px 0 0">Je eerste zak wordt vers voor je gebrand. Hier verschijnt straks je eerste batch.</p>') +
      "</div>" +
      '<div class="tile third"><h3>Vrienden uitnodigen ' + icon("gift").replace("<svg", '<svg style="width:22px;height:22px;color:var(--copper)"') + '</h3><p class="muted" style="margin:0 0 12px">Deel je code: je vriend krijgt de eerste zak halve prijs, jij krijgt € 5 korting op je volgende levering.</p><div style="display:flex;gap:8px"><input type="text" readonly value="' + esc(acc.referral) + '" aria-label="Jouw uitnodigingscode" style="font-family:var(--f-label);letter-spacing:.14em;font-weight:700"><button class="btn btn--small" data-action="copy-ref">Kopieer</button></div></div>' +
      "</div>";

    // ---- ABONNEMENT
    var paused = sub.status === "gepauzeerd";
    $("#tab-abonnement").innerHTML =
      '<span class="kicker">Abonnement</span><h2>Jouw abonnement</h2>' +
      '<p class="lead">Pas je zak, ritme of maling aan wanneer je wilt. Wijzigingen die je tot 7 dagen voor een levering doorgeeft, gelden al voor die levering.</p>' +
      '<form id="plan-form" class="tiles">' +
      '<div class="tile wide"><h3>Hoeveelheid</h3><div class="options options--2">' +
      Object.keys(CONFIG.sizes).map(function (k) {
        var s = CONFIG.sizes[k];
        return '<label class="option"><input type="radio" name="size" value="' + k + '"' + (sub.size === k ? " checked" : "") + '><span class="card"><span class="title">' + s.label + '</span><span class="sub">' + s.bags + " · " + s.cups + '</span><span class="price">' + eur.format(s.price) + " incl. verzending</span></span></label>";
      }).join("") +
      "</div></div>" +
      '<div class="tile"><h3>Ritme</h3><div class="options">' +
      Object.keys(CONFIG.freqs).map(function (k) {
        return '<label class="option"><input type="radio" name="freq" value="' + k + '"' + (sub.freq === k ? " checked" : "") + '><span class="card"><span class="title small">' + CONFIG.freqs[k].label + "</span></span></label>";
      }).join("") +
      '</div><p class="muted" style="font-size:.9rem;margin:12px 0 0">De bonen wisselen per maand. Bij 2× per maand krijg je twee leveringen van dezelfde smaak.</p></div><div class="tile"><h3>Maling</h3><div class="field"><label class="visually-hidden" for="p-grind">Maling</label><select id="p-grind" name="grind">' +
      Object.keys(CONFIG.grinds).map(function (k) { return '<option value="' + k + '"' + (sub.grind === k ? " selected" : "") + ">" + CONFIG.grinds[k] + "</option>"; }).join("") +
      '</select></div><h3 style="margin-top:20px">Brandprofiel</h3><div class="field"><label class="visually-hidden" for="p-roast">Brandprofiel</label><select id="p-roast" name="roast">' +
      Object.keys(CONFIG.roasts).map(function (k) { return '<option value="' + k + '"' + (sub.roast === k ? " selected" : "") + ">" + CONFIG.roasts[k] + "</option>"; }).join("") +
      "</select></div></div>" +
      '<div class="tile wide"><h3>Notitie voor de brander</h3><div class="field"><label class="visually-hidden" for="p-note">Notitie</label><textarea id="p-note" name="note" placeholder="Bijv. ‘Ik hou van fruitig’ of ‘liever geen hele donkere branding’." style="min-height:90px">' + esc(sub.note) + '</textarea></div><p class="muted" style="font-size:.9rem;margin:10px 0 0">We gebruiken dit (en je beoordelingen) om de verrassing nog beter op jou af te stemmen.</p>' +
      '<div class="actions"><button type="submit" class="btn">Wijzigingen opslaan</button></div></div>' +
      "</form>" +
      '<div class="tiles" style="margin-top:16px">' +
      '<div class="tile"><h3>Even geen koffie nodig?</h3><p class="muted">Op vakantie of nog genoeg in huis? Sla een levering over of pauzeer tot 3 maanden. Kost niks.</p><div class="actions">' +
      (sub.status === "opgezegd" ? '<button class="btn btn--small" data-action="restart">Hervatten</button>' : paused ? '<button class="btn btn--small" data-action="resume">Hervatten</button>' : '<button class="btn btn--small" data-action="skip">' + icon("skip") + ' Volgende overslaan</button><button class="btn btn--ghost btn--small" data-action="pause">' + icon("pause") + " Pauzeren</button>") +
      "</div></div>" +
      '<div class="tile"><h3>Opzeggen</h3><p class="muted">Geen vaste looptijd, geen kleine lettertjes. Opzeggen kan tot 7 dagen voor je volgende levering.</p><div class="actions">' +
      (sub.status === "opgezegd" ? '<span class="chip">Opgezegd</span>' : '<button class="btn btn--danger btn--small" data-action="cancel">Abonnement opzeggen</button>') +
      "</div></div></div>";

    $("#plan-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      sub.size = readChoice(f, "size");
      sub.freq = readChoice(f, "freq");
      sub.grind = f.elements.grind.value;
      sub.roast = f.elements.roast.value;
      sub.note = f.elements.note.value.trim();
      persist();
      renderDashboard(acc);
      toast(locked
        ? "Opgeslagen! Je levering van " + dateFmt.format(next) + " wordt al gebrand, dus dit geldt vanaf " + dateFmt.format(nextAfter(sub, next)) + "."
        : "Opgeslagen! Geldt vanaf je volgende levering.");
    });

    // ---- LEVERINGEN
    var upcoming = sub.status === "opgezegd"
      ? (sub.lastDelivery && new Date(sub.lastDelivery) >= today ? schedule(sub, new Date(sub.lastDelivery), 1) : [])
      : schedule(sub, next, 4);
    $("#tab-leveringen").innerHTML =
      '<span class="kicker">Leveringen</span><h2>Leveringen</h2>' +
      '<p class="lead">Wat eraan komt en wat je al hebt gehad. Elke maand een nieuwe batch, met een eigen batchnummer.</p>' +
      '<h3 style="margin:0 0 12px">Gepland</h3>' +
      (upcoming.length
        ? '<div class="table-wrap" style="margin-bottom:32px"><table class="table"><thead><tr><th>Datum</th><th>Smaak</th><th>Inhoud</th><th>Maling</th><th>Bedrag</th><th>Status</th></tr></thead><tbody>' +
        upcoming.map(function (u, i) {
          var d = u.date;
          var status = i === 0 && paused ? '<span class="chip chip--warn">Na pauze</span>'
            : today > deadlineFor(d) ? '<span class="chip chip--copper">Wordt gebrand</span>'
              : '<span class="chip">Gepland</span>';
          return "<tr><td>" + esc(capitalize(dateFmt.format(d))) + "</td><td>" + (u.newFlavour ? "Nieuwe smaak" : "Zelfde als vorige") + "</td><td>" + esc(size.bags) + "</td><td>" + esc(CONFIG.grinds[sub.grind]) + "</td><td>" + eur.format(size.price) + "</td><td>" + status + "</td></tr>";
        }).join("") + "</tbody></table></div>"
        : '<p class="muted" style="margin-bottom:32px">Geen geplande leveringen.</p>') +
      '<h3 style="margin:0 0 12px">Geschiedenis</h3>' +
      (acc.deliveries.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Datum</th><th>Batch</th><th>Herkomst</th><th>Inhoud</th><th>Status</th></tr></thead><tbody>' +
        acc.deliveries.slice().reverse().map(function (d) {
          return "<tr><td>" + dateShort.format(new Date(d.date)) + "</td><td>" + esc(d.batch) + "</td><td>" + esc(d.country) + " · " + esc(d.region) + "</td><td>" + esc(CONFIG.sizes[d.size].bags) + ", " + esc(CONFIG.grinds[d.grind]) + '</td><td><span class="chip chip--ok">Bezorgd</span></td></tr>';
        }).join("") + "</tbody></table></div>"
        : '<p class="muted">Nog geen leveringen. Je eerste zak is in de maak!</p>') +
      '<p class="muted" style="margin-top:20px;font-size:.93rem">Iets mis met een levering? <a href="klantenservice.html#contact">Laat het ons weten</a>, dan lossen we het op.</p>';

    // ---- PASPOORT
    $("#tab-paspoort").innerHTML =
      '<span class="kicker">Bonenpaspoort</span><h2>Jouw bonenpaspoort</h2>' +
      '<p class="lead">Elke smaak die je van ons kreeg, met herkomst en smaaknotities. Geef ze een score: hoe meer we weten, hoe beter we je kunnen verrassen.</p>' +
      (allBatches.length
        ? '<div class="world"><span class="lbl">Landen in je paspoort</span><div class="world-list" style="margin-top:10px">' + countries.map(function (c) { return '<span class="chip chip--copper">' + icon("pin").replace("<svg", '<svg style="width:14px;height:14px"') + " " + esc(c) + "</span>"; }).join("") + "</div></div>" +
        '<div class="passport">' +
        allBatches.slice().reverse().map(function (d) {
          return '<article class="bean-card"><header><div><div class="batch">Batch ' + esc(d.batch) + '</div><div class="country">' + esc(d.country) + '</div><div class="farm">' + esc(d.region) + " · " + esc(d.farm) + "</div></div>" +
            '<span class="chip">' + esc(d.process) + "</span></header>" +
            '<div class="notes">' + d.notes.map(function (n) { return '<span class="chip">' + esc(n) + "</span>"; }).join("") + "</div>" +
            '<div class="roast-scale" aria-label="Brandprofiel ' + d.roast + ' van 5">' + ["Light", "Med. light", "Medium", "Med. dark", "Dark"].map(function (l, i) { return '<span class="' + (i + 1 === d.roast ? "on" : "") + '">' + l + "</span>"; }).join("") + "</div>" +
            '<div class="stars" role="group" aria-label="Beoordeling"><span class="lbl">' + (d.rating ? "Jouw score" : "Beoordeel") + "</span>" +
            [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="' + (n <= d.rating ? "on" : "") + '" data-rate="' + esc(d.batch) + ":" + n + '" aria-label="' + n + ' sterren">' + icon("star") + "</button>"; }).join("") +
            "</div></article>";
        }).join("") + "</div>"
        : '<div class="panel center"><img src="assets/img/zwartwerk-boon-lijn.png" alt="" style="width:200px;margin:0 auto 18px;opacity:.8"><h3>Je paspoort is nog leeg</h3><p class="muted" style="margin:0">Na je eerste levering verschijnt hier je eerste stempel.</p></div>');

    // ---- BETALINGEN
    var invoices = acc.deliveries.slice().reverse();
    $("#tab-betalingen").innerHTML =
      '<span class="kicker">Betalingen</span><h2>Betalingen & facturen</h2>' +
      '<p class="lead">We rekenen pas af als je zak onderweg is. Alle bedragen zijn inclusief btw en verzending.</p>' +
      '<div class="tiles" style="margin-bottom:24px"><div class="tile"><h3>Betaalmethode</h3><div class="big" style="font-size:2rem">' + esc(CONFIG.pay) + '</div><p class="muted" style="margin:8px 0 0">Via Mollie. Je eerste betaling deed je met iDEAL | Wero; volgende leveringen schrijven we automatisch af van dezelfde rekening (NL•• •••• •••• •••• 42).</p><div class="actions"><button class="btn btn--ghost btn--small" data-action="change-pay">Andere rekening koppelen</button></div></div>' +
      '<div class="tile"><h3>Totaal besteed</h3><div class="big">' + eur.format(acc.deliveries.reduce(function (s, d) { return s + d.price; }, 0)) + '</div><p class="muted" style="margin:8px 0 0">Aan ' + acc.deliveries.length + " leveringen vers gebrande koffie, verzending inbegrepen.</p></div></div>" +
      (invoices.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Factuur</th><th>Datum</th><th>Omschrijving</th><th>Bedrag</th><th>Status</th><th></th></tr></thead><tbody>' +
        invoices.map(function (d, i) {
          return "<tr><td>F" + (2400 + invoices.length - i) + "</td><td>" + dateShort.format(new Date(d.date)) + "</td><td>" + esc(CONFIG.sizes[d.size].label) + " koffie · batch " + esc(d.batch) + "</td><td>" + eur.format(d.price) + '</td><td><span class="chip chip--ok">Betaald</span></td><td><a href="#" data-action="invoice">PDF</a></td></tr>';
        }).join("") + "</tbody></table></div>"
        : '<p class="muted">Nog geen facturen.</p>');

    // ---- GEGEVENS
    var a = acc.address;
    $("#tab-gegevens").innerHTML =
      '<span class="kicker">Gegevens</span><h2>Mijn gegevens</h2><p class="lead">Klopt alles nog? Een verhuizing is zo doorgegeven.</p>' +
      '<form id="details-form" class="panel" novalidate><div class="field-grid">' +
      '<div class="field half"><label class="lbl" for="d-name">Naam</label><input id="d-name" name="name" type="text" value="' + esc(acc.name) + '" data-validate="required" autocomplete="name"><span class="err">Vul je naam in.</span></div>' +
      '<div class="field half"><label class="lbl" for="d-phone">Telefoon <span class="muted">(optioneel)</span></label><input id="d-phone" name="phone" type="tel" value="' + esc(acc.phone) + '" autocomplete="tel"></div>' +
      '<div class="field"><label class="lbl" for="d-email">E-mailadres</label><input id="d-email" name="email" type="email" value="' + esc(acc.email) + '" readonly aria-describedby="d-email-hint"><span id="d-email-hint" class="muted" style="font-size:.85rem">Je e-mailadres wijzigen? Neem even contact op.</span></div>' +
      '<div class="field twothird"><label class="lbl" for="d-street">Straat</label><input id="d-street" name="street" type="text" value="' + esc(a.street) + '" data-validate="required" autocomplete="address-line1"><span class="err">Vul je straat in.</span></div>' +
      '<div class="field third"><label class="lbl" for="d-nr">Huisnr.</label><input id="d-nr" name="nr" type="text" value="' + esc(a.nr) + '" data-validate="required"><span class="err">Huisnummer?</span></div>' +
      '<div class="field third"><label class="lbl" for="d-postcode">Postcode</label><input id="d-postcode" name="postcode" type="text" value="' + esc(a.postcode) + '" data-validate="postcode" autocomplete="postal-code"><span class="err">Bijv. 1234 AB</span></div>' +
      '<div class="field twothird"><label class="lbl" for="d-city">Plaats</label><input id="d-city" name="city" type="text" value="' + esc(a.city) + '" data-validate="required" autocomplete="address-level2"><span class="err">Vul je plaats in.</span></div>' +
      '<div class="field"><label class="checkbox"><input type="checkbox" name="newsletter"' + (acc.newsletter ? " checked" : "") + "> Stuur me het verhaal achter elke nieuwe batch per mail</label></div>" +
      '</div><div class="actions"><button type="submit" class="btn">Opslaan</button></div></form>' +
      '<form id="pw-form" class="panel" style="margin-top:16px" novalidate><h3>Wachtwoord wijzigen</h3><div class="field-grid">' +
      '<div class="field half"><label class="lbl" for="pw-old">Huidig wachtwoord</label><input id="pw-old" name="old" type="password" autocomplete="current-password" data-validate="required"><span class="err">Vul je huidige wachtwoord in.</span></div>' +
      '<div class="field half"><label class="lbl" for="pw-new">Nieuw wachtwoord</label><input id="pw-new" name="new" type="password" autocomplete="new-password" data-validate="password"><span class="err">Minimaal 6 tekens.</span></div>' +
      '</div><p class="form-msg" id="pw-msg"></p><div class="actions" style="margin-top:4px"><button type="submit" class="btn btn--ghost">Wachtwoord opslaan</button></div></form>';

    $("#details-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      if (!validateForm(f)) return;
      acc.name = f.elements.name.value.trim();
      acc.phone = f.elements.phone.value.trim();
      acc.address = { street: f.elements.street.value.trim(), nr: f.elements.nr.value.trim(), postcode: f.elements.postcode.value.trim().toUpperCase(), city: f.elements.city.value.trim() };
      acc.newsletter = f.elements.newsletter.checked;
      persist();
      renderDashboard(acc);
      toast("Je gegevens zijn bijgewerkt.");
    });
    $("#pw-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var msg = $("#pw-msg");
      if (!validateForm(f)) return;
      if (f.elements.old.value !== acc.password) { msg.classList.remove("ok"); msg.textContent = "Je huidige wachtwoord klopt niet."; return; }
      acc.password = f.elements.new.value;
      persist();
      f.reset();
      msg.classList.add("ok");
      msg.textContent = "Wachtwoord gewijzigd.";
    });

    // ---- acties (event delegation)
    root.onclick = function (e) {
      var rate = e.target.closest("[data-rate]");
      if (rate) {
        var p = rate.getAttribute("data-rate").split(":");
        acc.deliveries.forEach(function (d) { if (d.batch === p[0]) d.rating = +p[1]; });
        persist();
        renderDashboard(acc);
        openTab("paspoort");
        toast(+p[1] >= 4 ? "Genoteerd! We zoeken meer in deze richting." : "Dank! Daar houden we rekening mee.");
        return;
      }
      var goto = e.target.closest("[data-goto]");
      if (goto) {
        e.preventDefault();
        openTab(goto.getAttribute("data-goto"), true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      if (action === "invoice") { e.preventDefault(); toast("In de live-versie download je hier je PDF-factuur."); return; }
      if (action === "copy-ref") {
        var input = btn.parentNode.querySelector("input");
        if (navigator.clipboard) navigator.clipboard.writeText(input.value).catch(function () {});
        input.select();
        toast("Code gekopieerd — deel ’m met een koffieliefhebber!");
        return;
      }
      if (action === "skip") {
        // Binnen 7 dagen wordt de zak al gebrand: dan kun je pas de levering daarna overslaan
        var target = locked ? nextAfter(sub, next) : next;
        var after = nextAfter(sub, target);
        confirmModal(locked ? "Levering van " + dateFmt.format(target) + " overslaan?" : "Volgende levering overslaan?",
          (locked ? "Je levering van " + dateFmt.format(next) + " wordt al voor je gebrand en komt gewoon. " : "") +
          "We slaan de levering van " + dateFmt.format(target) + " over. De zak daarna komt op " + dateFmt.format(after) + ".",
          "Ja, overslaan", function () {
            if (!locked) sub.nextDelivery = after.toISOString();
            else (sub.skipped = sub.skipped || []).push(target.toISOString());
            persist(); renderDashboard(acc); toast("Levering overgeslagen.");
          });
        return;
      }
      if (action === "pause") { pauseModal(); return; }
      if (action === "resume" || action === "restart") {
        sub.status = "actief";
        sub.pausedUntil = null;
        sub.lastDelivery = null;
        var earliest = firstDeliveryDate();
        if (action === "restart" || new Date(sub.nextDelivery) < earliest) {
          if (action === "restart") sub.anchor = earliest.toISOString();
          sub.nextDelivery = schedule(sub, earliest, 1)[0].date.toISOString();
        }
        persist(); renderDashboard(acc);
        toast(action === "restart" ? "Welkom terug! Je volgende verrassing is onderweg." : "Hervat! We branden weer voor je.");
        return;
      }
      if (action === "cancel") { cancelModal(); return; }
      if (action === "change-pay") { payModal(); return; }
    };

    function confirmModal(title, text, okLabel, onOk) {
      var d = modal('<h2>' + esc(title) + '</h2><p class="muted">' + esc(text) + '</p><div class="actions"><button class="btn btn--ghost" value="cancel">Terug</button><button class="btn" value="ok">' + esc(okLabel) + "</button></div>");
      d.addEventListener("close", function () { if (d.returnValue === "ok") onOk(); });
    }
    function pauseModal() {
      var from = locked ? nextAfter(sub, next) : next; // eerste levering die nog gepauzeerd kan worden
      var d = modal('<h2>Abonnement pauzeren</h2><p class="muted">Hoe lang wil je pauzeren? Je kunt altijd eerder hervatten.' + (locked ? " Je levering van " + esc(dateFmt.format(next)) + " wordt al gebrand en komt nog." : "") + '</p><div class="options" style="margin-bottom:8px">' +
        [1, 2, 3].map(function (m, i) {
          var resume = schedule(sub, addMonths(from, m), 1)[0].date;
          return '<label class="option"><input type="radio" name="months" value="' + m + '"' + (i === 0 ? " checked" : "") + '><span class="card"><span class="title small">' + m + " " + (m === 1 ? "maand" : "maanden") + '</span><span class="sub">Eerstvolgende levering: ' + esc(dateFmt.format(resume)) + "</span></span></label>";
        }).join("") +
        '</div><div class="actions"><button class="btn btn--ghost" value="cancel">Terug</button><button class="btn" value="ok">Pauzeren</button></div>');
      d.addEventListener("close", function () {
        if (d.returnValue !== "ok") return;
        var m = +readChoice(d, "months");
        var resume = schedule(sub, addMonths(from, m), 1)[0].date;
        if (locked) {
          // de levering die al gebrand wordt gaat nog door; daarna pauze
          sub.pausedUntil = resume.toISOString();
          (sub.skipped = sub.skipped || []);
          schedule(sub, addDays(next, 1), 12).forEach(function (u) { if (u.date < resume) sub.skipped.push(u.date.toISOString()); });
          persist(); renderDashboard(acc); toast("Na je levering van " + dateFmt.format(next) + " pauzeren we tot " + dateFmt.format(resume) + ".");
          return;
        }
        sub.status = "gepauzeerd";
        sub.pausedUntil = resume.toISOString();
        sub.nextDelivery = resume.toISOString();
        persist(); renderDashboard(acc); toast("Gepauzeerd. Je volgende levering is op " + dateFmt.format(resume) + ".");
      });
    }
    function cancelModal() {
      var d = modal('<h2>Jammer dat je gaat</h2><p class="muted">' + (locked
          ? "Je levering van " + esc(dateFmt.format(next)) + " wordt al voor je gebrand; die ontvang je nog. Daarna stopt je abonnement. "
          : "Je abonnement stopt direct; je volgende levering (" + esc(dateFmt.format(next)) + ") komt niet meer. ") +
        'Mogen we vragen waarom? Daar leren we van. <strong style="color:var(--cream)">Tip:</strong> pauzeren kan ook, dan houden we je plekje warm.</p>' +
        '<div class="field" style="margin-bottom:16px"><label class="lbl" for="cancel-reason">Reden</label><select id="cancel-reason"><option>Te veel koffie in huis</option><option>Te duur</option><option>Smaak viel tegen</option><option>Ik ga ergens anders koffie halen</option><option>Anders</option></select></div>' +
        '<div class="actions"><button class="btn btn--ghost" value="pause">Liever pauzeren</button><button class="btn btn--danger" value="ok">Definitief opzeggen</button></div>');
      d.addEventListener("close", function () {
        if (d.returnValue === "pause") { pauseModal(); return; }
        if (d.returnValue !== "ok") return;
        sub.status = "opgezegd";
        sub.lastDelivery = locked ? next.toISOString() : null;
        persist(); renderDashboard(acc); openTab("abonnement"); toast("Je abonnement is opgezegd. Je bent altijd welkom terug.");
      });
    }
    function payModal() {
      var d = modal('<h2>Andere rekening koppelen</h2><p class="muted">Je gaat naar de beveiligde betaalomgeving van Mollie. Daar doe je een verificatiebetaling van € 0,01 met iDEAL | Wero vanaf je nieuwe rekening. Volgende leveringen schrijven we daarna van die rekening af.</p>' +
        '<p class="demo-note">Prototype: de koppeling met Mollie wordt actief zodra de site live gaat.</p><div class="actions"><button class="btn btn--ghost" value="cancel">Terug</button><button class="btn" value="ok">Naar Mollie</button></div>');
      d.addEventListener("close", function () {
        if (d.returnValue !== "ok") return;
        toast("In de live-versie ga je nu naar Mollie.");
      });
    }
  }

  function modal(html) {
    var d = document.createElement("dialog");
    d.className = "modal";
    d.innerHTML = '<form method="dialog">' + html + "</form>";
    document.body.appendChild(d);
    d.addEventListener("close", function () { setTimeout(function () { d.remove(); }, 0); });
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    return d;
  }

  function uniq(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }
})();
