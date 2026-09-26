/* ==========================================================================
   Khoffie — sitescript
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
    // Losse zak (eenmalig, geen abonnement): prijs per bestelling, zonder welkomstkorting
    oneoffPrices: { "250": 16, "500": 29 },
    cancelDays: 7, // wijzigen/opzeggen kan tot 7 dagen voor de volgende levering
    // We versturen uitsluitend hele bonen: die blijven het langst vers.
    grinds: { bonen: "Hele bonen" },
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
    welcomeDiscount: 0.25, // 25% korting op de eerste levering
    referralDiscount: 0.5 // 50% korting op de eerste levering met een uitnodigingscode
  };

  // Losse zak = ritme "1x": geen abonnement, geen machtiging, geen welkomstkorting
  var ONCE = "1x";

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
    skip: '<path d="M5 5l9 7-9 7zM18 5v14"/>',
    // gevulde iconen zoals op de achterkant van de zak
    "leaf-fill": '<path d="M12 21.5c-.4-3.2-2-5.3-4.8-6.4C3.9 13.8 3 10.6 3.4 6.6c3.9.2 6.8 1.7 8.1 5 1.2-4.5 4-7.3 8.6-8.1.6 4.8-.6 8.6-4.3 11.2-1.6 1.1-2.6 3.2-2.9 6.8z" fill="currentColor" stroke="none"/>',
    dots: '<circle cx="12" cy="7" r="4" fill="currentColor" stroke="none"/><circle cx="7" cy="16" r="4" fill="currentColor" stroke="none"/><circle cx="17" cy="16" r="4" fill="currentColor" stroke="none"/>',
    "sun-half": '<path d="M2 18a10 10 0 0120 0z" fill="currentColor" stroke="none"/>',
    "heart-fill": '<path d="M12 21s-8.5-5.2-8.5-11.2A4.8 4.8 0 0112 7a4.8 4.8 0 018.5 2.8C20.5 15.8 12 21 12 21z" fill="currentColor" stroke="none"/>'
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
     Server (PHP) — als die draait werken aanmelden, betalen en het account echt.
     Zonder server (bijv. lokaal bekijken) valt alles terug op de demo in de browser.
     ------------------------------------------------------------------------ */
  var LIVE = false;
  function api(path, body) {
    var opts = { credentials: "same-origin", headers: { Accept: "application/json" } };
    if (body) {
      opts.method = "POST";
      opts.headers["Content-Type"] = "application/json";
      opts.headers["X-Khoffie"] = "1";
      opts.body = JSON.stringify(body);
    }
    return fetch("api/" + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok || data.ok === false) {
          var err = new Error(data.error || "Er ging iets mis. Probeer het later opnieuw.");
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }
  var livePromise = api("ping.php").then(function (d) {
    if (!d.live) return false;
    LIVE = true;
    Object.keys(d.prices || {}).forEach(function (k) { if (CONFIG.sizes[k]) CONFIG.sizes[k].price = d.prices[k]; });
    Object.keys(d.oneoffPrices || {}).forEach(function (k) { if (CONFIG.oneoffPrices[k] != null) CONFIG.oneoffPrices[k] = d.oneoffPrices[k]; });
    if (typeof d.welcomeDiscount === "number") CONFIG.welcomeDiscount = d.welcomeDiscount;
    if (typeof d.referralDiscount === "number") CONFIG.referralDiscount = d.referralDiscount;
    if (typeof d.cancelDays === "number") CONFIG.cancelDays = d.cancelDays;
    return true;
  }).catch(function () { return false; });

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
  livePromise.then(function (live) {
    if (live) $$("[data-account-label]").forEach(function (el) { el.textContent = "Mijn account"; });
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
      var email = input.value.trim();
      input.value = "";
      if (LIVE) api("newsletter.php", { email: email }).catch(function () {});
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
      if (input.disabled) return; // uitgeschakelde velden (bijv. machtiging bij een losse zak) tellen niet mee
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
    // voorkeuze vanuit ?plan=500, ?ritme=eenmalig of knoppen met data-pick
    var params = new URLSearchParams(location.search);
    if (params.get("plan") && CONFIG.sizes[params.get("plan")]) {
      var r = $('input[name="size"][value="' + params.get("plan") + '"]', form);
      if (r) r.checked = true;
    }
    if (params.get("ritme") === "eenmalig") $('input[name="freq"][value="' + ONCE + '"]', form).checked = true;
    $$("[data-pick-size]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var r = $('input[name="size"][value="' + btn.getAttribute("data-pick-size") + '"]', form);
        if (r) { r.checked = true; update(); }
      });
    });
    $$("[data-pick-freq]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        var r = $('input[name="freq"][value="' + btn.getAttribute("data-pick-freq") + '"]', form);
        if (!r) return;
        e.preventDefault();
        r.checked = true;
        update();
        r.closest("fieldset").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    var first = firstDeliveryDate();
    var loggedIn = null; // ingelogde klant (live): dan hoeft er geen wachtwoord gekozen te worden

    function isOnce() { return readChoice(form, "freq") === ONCE; }

    // Tekst en velden die alleen bij een abonnement of alleen bij een losse zak horen
    function toggleFor(root, once) {
      $$("[data-for]", root).forEach(function (el) { el.hidden = (el.getAttribute("data-for") === "once") !== once; });
    }

    function update() {
      var size = readChoice(form, "size");
      var once = isOnce();
      var grind = "bonen";
      var s = CONFIG.sizes[size];
      var f = once ? { label: "Eenmalig", perMonth: 0 } : CONFIG.freqs[readChoice(form, "freq")];
      var price = once ? CONFIG.oneoffPrices[size] : s.price;
      var pct = once ? 0 : referralOk ? CONFIG.referralDiscount : CONFIG.welcomeDiscount;
      var firstPrice = Math.round(price * (1 - pct) * 100) / 100;
      $("#sum-discount-label").textContent = referralOk ? "Uitnodigingskorting" : "Welkomstkorting";
      var monthly = price * f.perMonth;

      $$("[data-size-price]", form).forEach(function (el) {
        var k = el.getAttribute("data-size-price");
        el.textContent = once ? eur.format(CONFIG.oneoffPrices[k]) + " eenmalig" : eur.format(CONFIG.sizes[k].price) + " per levering";
      });
      $("#sum-title").textContent = once ? "Jouw bestelling" : "Jouw abonnement";
      $("#sum-size").textContent = s.label;
      $("#sum-freq").textContent = f.label;
      $("#sum-grind").textContent = CONFIG.grinds[grind];
      $("#sum-price-label").textContent = once ? "Prijs" : "Per levering";
      $("#sum-price").textContent = eur.format(price);
      $("#sum-discount-label").hidden = $("#sum-discount").hidden = once;
      $("#sum-discount").textContent = "− " + eur.format(price - firstPrice);
      $("#sum-first-label").textContent = once ? "Totaal" : "Eerste levering";
      $("#sum-first").textContent = eur.format(firstPrice);
      $("#sum-monthly").textContent = once ? "Eenmalig, geen abonnement" : "Daarna " + eur.format(price) + " per levering" + (f.perMonth > 1 ? " (" + eur.format(monthly) + " per maand)" : "");
      $("#sum-date-label").textContent = once ? "Bezorging" : "Eerste levering";
      $("#sum-date").textContent = capitalize(dateFmt.format(first));
      var note = $("#freq-note");
      if (note) note.hidden = once || f.perMonth < 2;
      $("#once-note").hidden = !once;
      toggleFor(form, once);
      // Bij een losse zak geen machtiging en geen uitnodigingscode
      $("#mandate-field").hidden = once;
      form.elements.mandate.disabled = once;
      $("#referral-field").hidden = once;
      if (refInput) refInput.disabled = once;
      $("#pass-hint").textContent = once
        ? "Hiermee log je in om je bestelling en factuur te bekijken."
        : "Hiermee log je in op je account om je abonnement te beheren.";
    }
    // Uitnodigingscode (optioneel): 50% korting op de eerste levering
    var referralOk = false;
    var refInput = form.elements.referral;
    var refMsg = $("#referral-msg");
    function checkReferral() {
      var code = refInput ? refInput.value.trim().toUpperCase() : "";
      if (!code) { referralOk = false; refMsg.textContent = ""; update(); return; }
      var check = LIVE
        ? api("referral.php?code=" + encodeURIComponent(code)).then(function (d) { return d.valid; })
        : Promise.resolve(/^KH-[A-Z]{1,6}\d{3}$/.test(code));
      check.then(function (valid) {
        referralOk = valid;
        refMsg.textContent = valid ? "Code geldig: 50% korting op je eerste levering!" : "Deze code kennen we niet.";
        refMsg.className = "form-msg" + (valid ? " ok" : "");
        update();
      }).catch(function () {});
    }
    if (refInput) refInput.addEventListener("change", checkReferral);
    var params0 = new URLSearchParams(location.search);
    if (refInput && params0.get("code")) { refInput.value = params0.get("code"); checkReferral(); }

    form.addEventListener("change", update);
    update();
    livePromise.then(update); // prijzen van de server

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validateForm(form)) {
        toast("Nog even checken: een paar velden missen.");
        return;
      }
      var fd = new FormData(form);
      var email = String(fd.get("email")).trim().toLowerCase();
      if (LIVE) {
        var btn = $(".summary button[type=submit]");
        btn.disabled = true;
        btn.textContent = "Even geduld…";
        var once0 = isOnce();
        api("subscribe.php", {
          size: readChoice(form, "size"), freq: readChoice(form, "freq"),
          firstname: fd.get("firstname"), lastname: fd.get("lastname"), email: email, phone: fd.get("phone"),
          street: fd.get("street"), nr: fd.get("nr"), postcode: fd.get("postcode"), city: fd.get("city"),
          password: fd.get("password"), referral: fd.get("referral") || "", terms: !!fd.get("terms"), mandate: !!fd.get("mandate")
        }).then(function (d) {
          btn.textContent = "Door naar iDEAL | Wero…";
          location.href = d.checkoutUrl;
        }).catch(function (err) {
          btn.disabled = false;
          btn.textContent = "Afrekenen met iDEAL | Wero";
          toast(err.message);
          if (err.status === 400 && once0 === false && /al een abonnement/.test(err.message)) {
            $('input[name="freq"][value="' + ONCE + '"]', form).checked = true;
            update();
          }
        });
        return;
      }
      var existing = getAccounts()[email];
      var once = isOnce();
      if (once) {
        // Losse zak in het voorbeeld: account (bestaand of nieuw) met een bestelling, zonder abonnement
        var o = existing ? migrate(existing) : {
          email: email, password: String(fd.get("password")), memberSince: new Date().toISOString(), newsletter: false,
          sub: null, deliveries: [], orders: [],
          referral: "KH-" + String(fd.get("firstname")).trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) + Math.floor(100 + Math.random() * 900)
        };
        o.name = String(fd.get("firstname")).trim() + " " + String(fd.get("lastname")).trim();
        o.phone = String(fd.get("phone") || "").trim();
        o.address = { street: String(fd.get("street")).trim(), nr: String(fd.get("nr")).trim(), postcode: String(fd.get("postcode")).trim().toUpperCase(), city: String(fd.get("city")).trim() };
        o.orders = (o.orders || []).concat([{ id: Date.now(), size: readChoice(form, "size"), date: first.toISOString(), price: CONFIG.oneoffPrices[readChoice(form, "size")], status: "betaald" }]);
        saveAccount(o);
        login(email);
        showSuccess(o, true);
        return;
      }
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
        newsletter: false,
        sub: {
          size: readChoice(form, "size"),
          freq: readChoice(form, "freq"),
          grind: "bonen",
          roast: "verras",
          pay: "ideal-wero",
          status: "actief",
          pausedUntil: null,
          anchor: first.toISOString(),
          nextDelivery: first.toISOString(),
          note: ""
        },
        deliveries: existing ? existing.deliveries : [],
        orders: existing ? existing.orders || [] : [],
        referral: "KH-" + String(fd.get("firstname")).trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) + Math.floor(100 + Math.random() * 900)
      };
      saveAccount(acc);
      login(email);
      showSuccess(acc, false);
    });

    function showSuccess(acc, once) {
      $("#sub-flow").hidden = true;
      var ok = $("#sub-success");
      toggleFor(ok, once);
      $("#success-name").textContent = acc.name.split(" ")[0];
      $$(".success-date", ok).forEach(function (el) { el.textContent = dateFmt.format(first); });
      ok.classList.add("is-visible");
      ok.scrollIntoView({ behavior: "smooth", block: "start" });
      $$("[data-account-label]").forEach(function (el) { el.textContent = "Hoi " + acc.name.split(" ")[0]; });
    }

    // Ingelogd (live)? Dan je gegevens alvast invullen en is geen nieuw wachtwoord nodig.
    // Heb je al een abonnement, dan bestel je hier een extra losse zak.
    livePromise.then(function (live) {
      if (!live) return;
      api("account.php").then(function (acc) {
        loggedIn = acc;
        var el = form.elements;
        var parts = acc.name.split(" ");
        el.firstname.value = parts[0] || "";
        el.lastname.value = parts.slice(1).join(" ");
        el.email.value = acc.email;
        el.email.readOnly = true;
        el.phone.value = acc.phone || "";
        el.street.value = acc.address.street;
        el.nr.value = acc.address.nr;
        el.postcode.value = acc.address.postcode;
        el.city.value = acc.address.city;
        el.password.disabled = true;
        el.password.closest(".field").hidden = true;
        var hasSub = acc.sub && acc.sub.status !== "nieuw";
        if (hasSub) {
          $$('input[name="freq"]', form).forEach(function (r) {
            if (r.value !== ONCE) { r.disabled = true; r.closest(".option").style.opacity = ".5"; }
          });
          $('input[name="freq"][value="' + ONCE + '"]', form).checked = true;
        }
        var note = document.createElement("p");
        note.className = "freq-note";
        note.innerHTML = icon("user") + "<span>Je bent ingelogd als " + esc(acc.email) + "." +
          (hasSub ? " Je hebt al een abonnement, dus hier bestel je een extra losse zak. Die sturen we naar het adres hieronder." : " We gebruiken je account, dus je hoeft geen wachtwoord te kiezen.") + "</span>";
        el.email.closest("fieldset").appendChild(note);
        update();
      }).catch(function () { /* niet ingelogd */ });
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
      status: "actief", pausedUntil: null, note: "",
      anchor: addMonths(next, -4).toISOString(), nextDelivery: next.toISOString()
    };
    var ratings = [5, 4, 0, 0];
    var deliveries = schedule(sub, new Date(sub.anchor), 8).map(function (s, i) {
      var o = ORIGINS[s.period % ORIGINS.length];
      var m = s.flavourMonth;
      return {
        batch: "KH-" + (m.getFullYear() % 100) + String(m.getMonth() + 1).padStart(2, "0") + "-" + (12 + s.period * 3),
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
      referral: "KH-SAM482"
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
    acc.orders = acc.orders || [];
    acc.deliveries = acc.deliveries || [];
    if (!sub) return acc; // alleen losse zakken, geen abonnement
    if (!CONFIG.freqs[sub.freq]) sub.freq = sub.freq === "2w" ? "2m" : "1m";
    if (!CONFIG.sizes[sub.size]) sub.size = "500";
    sub.grind = "bonen";
    if (!sub.anchor) sub.anchor = sub.nextDelivery;
    sub.pay = "ideal-wero";
    acc.deliveries.forEach(function (d) { if (!CONFIG.sizes[d.size]) d.size = "500"; });
    return acc;
  }

  function initAccount() {
    var authView = $("#auth-view");
    var dashView = $("#dash-view");
    var params = new URLSearchParams(location.search);

    function showDash(acc) {
      authView.hidden = true;
      dashView.hidden = false;
      renderDashboard(acc);
    }
    function showAuth() {
      authView.hidden = false;
      dashView.hidden = true;
    }
    function showLocal() {
      var acc = currentAccount();
      if (acc) showDash(acc); else showAuth();
    }

    // Inloggen
    $("#login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var msg = $("#login-msg");
      msg.classList.remove("ok");
      if (!validateForm(f)) return;
      var email = f.elements.email.value.trim().toLowerCase();
      if (LIVE) {
        api("auth.php", { action: "login", email: email, password: f.elements.password.value })
          .then(function (acc) { msg.textContent = ""; showDash(acc); window.scrollTo(0, 0); })
          .catch(function (err) { msg.textContent = err.message; });
        return;
      }
      var acc = getAccounts()[email];
      if (email === "demo@zwartwerk.nl" && !acc) { acc = makeDemoAccount(); saveAccount(acc); }
      if (!acc || acc.password !== f.elements.password.value) {
        msg.textContent = "Dat e-mailadres en wachtwoord kennen we niet samen. Probeer het nog eens.";
        return;
      }
      msg.textContent = "";
      login(email);
      showLocal();
      window.scrollTo(0, 0);
    });
    // Voorbeeld-account: altijd alleen in de browser, raakt de echte gegevens niet
    $("#demo-login").addEventListener("click", function () {
      var demo = makeDemoAccount();
      demo.demo = true;
      saveAccount(demo);
      login(demo.email);
      showDash(demo);
      window.scrollTo(0, 0);
      toast("Je bekijkt nu een voorbeeld-account.");
    });
    $("#forgot-link").addEventListener("click", function (e) {
      e.preventDefault();
      var email = $("#login-form").elements.email.value.trim();
      var msg = $("#login-msg");
      msg.classList.add("ok");
      if (!email) { msg.textContent = "Vul eerst je e-mailadres in, dan sturen we je een resetlink."; return; }
      if (LIVE) api("auth.php", { action: "forgot", email: email }).catch(function () {});
      msg.textContent = "Als " + email + " bij ons bekend is, ontvang je binnen een paar minuten een resetlink.";
    });

    livePromise.then(function (live) {
      if (!live) { showLocal(); return; }
      // Wachtwoord opnieuw instellen via de link uit de mail
      if (params.get("reset")) {
        showReset(params.get("reset"));
        return;
      }
      api("account.php").then(function (acc) {
        showDash(acc);
        if (params.get("betaling") === "terug") {
          toast(acc.sub && acc.sub.status === "nieuw" ? "We wachten nog op de bevestiging van je betaling…" : "Bedankt! Je betaling is gelukt.");
          if (acc.sub && acc.sub.status === "nieuw") setTimeout(function () { api("account.php").then(renderDashboard).catch(function () {}); }, 4000);
        } else if (params.get("betaling") === "bestelling") {
          var waiting = (acc.orders || []).some(function (o) { return o.status === "open"; });
          toast(waiting ? "We wachten nog op de bevestiging van je betaling…" : "Bedankt voor je bestelling! We gaan voor je branden.");
          if (waiting) setTimeout(function () { api("account.php").then(renderDashboard).catch(function () {}); }, 4000);
        } else if (params.get("betaling") === "rekening") {
          toast("Bedankt! Zodra de betaling binnen is, schrijven we voortaan van je nieuwe rekening af.");
        }
        if (params.get("betaling") && history.replaceState) history.replaceState(null, "", "account.html" + location.hash);
      }).catch(function (err) {
        if (err.status === 401) showAuth(); else { showAuth(); toast(err.message); }
      });
    });

    function showReset(token) {
      showAuth();
      var panel = $("#login-form");
      panel.innerHTML = '<h2>Nieuw wachtwoord</h2><div class="field"><label class="lbl" for="r-pass">Kies een nieuw wachtwoord</label><input id="r-pass" name="password" type="password" autocomplete="new-password" data-validate="password"><span class="err">Minimaal 6 tekens.</span></div><p class="form-msg" id="reset-msg" role="status"></p><button class="btn btn--block" type="submit">Opslaan en inloggen</button>';
      var f = panel.cloneNode(true);
      panel.parentNode.replaceChild(f, panel);
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!validateForm(f)) return;
        api("auth.php", { action: "reset", token: token, password: f.elements.password.value }).then(function (acc) {
          if (history.replaceState) history.replaceState(null, "", "account.html");
          showDash(acc);
          toast("Je nieuwe wachtwoord is opgeslagen.");
        }).catch(function (err) { $("#reset-msg").textContent = err.message; });
      });
    }
  }

  /* ------------------------------------------------------------------------
     Koffiegordel-kaart in het bonenpaspoort
     Landen die je geproefd hebt kleuren oranje. Klik op een land (of op het land
     in een smaakkaart) om alleen de smaken van daar te zien.
     ------------------------------------------------------------------------ */
  var KAART_ALIAS = {
    "dr-congo": "congo", "democratische-republiek-congo": "congo", "congo-kinshasa": "congo",
    brazil: "brazilie", ethiopia: "ethiopie", kenya: "kenia", uganda: "oeganda", yemen: "jemen",
    indonesia: "indonesie", "papua-new-guinea": "papoea-nieuw-guinea", "papoea-nieuw-guinea": "papoea-nieuw-guinea"
  };
  var kaartSelectie = null;
  function countryKey(name) {
    var k = String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-+|-+$/g, "");
    return KAART_ALIAS[k] || k;
  }
  function kaartData() { return window.KHOFFIE_KAART || null; }
  function kaartTotal() { var K = kaartData(); return K ? K.countries.length : 12; }
  function kaartCountry(key) {
    var K = kaartData();
    if (!K) return null;
    for (var i = 0; i < K.countries.length; i++) if (K.countries[i].key === key) return K.countries[i];
    return null;
  }
  // Samenvatting per land: aantal smaken en gemiddelde score
  function kaartStats(batches) {
    var st = {};
    batches.forEach(function (d) {
      var k = countryKey(d.country);
      st[k] = st[k] || { name: d.country, n: 0, sum: 0, rated: 0 };
      st[k].n++;
      if (d.rating) { st[k].sum += d.rating; st[k].rated++; }
    });
    return st;
  }
  function kaartPanel(batches) {
    var K = kaartData();
    if (!K) return "";
    var st = kaartStats(batches);
    var C = 10; // pixels per rastercel
    // Inzoomen op de koffiegordel: van 38° noord tot 38° zuid
    var r0 = Math.floor((K.lat0 - 38) / K.step), r1 = Math.ceil((K.lat0 + 38) / K.step);
    var rows = K.rows.slice(r0, r1);
    var W = K.cols * C, H = rows.length * C;
    var byChar = {};
    K.countries.forEach(function (c) { byChar[c.char] = c; });
    var land = [], coffee = [];
    rows.forEach(function (row, r) {
      for (var i = 0; i < row.length; i++) {
        var ch = row.charAt(i);
        if (ch === ".") continue;
        var cx = i * C + C / 2, cy = r * C + C / 2;
        if (ch === "#") { land.push('<circle cx="' + cx + '" cy="' + cy + '" r="3.2"/>'); continue; }
        var c = byChar[ch];
        coffee.push('<circle class="' + (st[c.key] ? "k-visited" : "k-coffee") + '" data-c="' + c.key + '" cx="' + cx + '" cy="' + cy + '" r="3.8"/>');
      }
    });
    function y(lat) { return (K.lat0 - lat) / K.step * C - r0 * C; }
    function x(lon) { return (lon - K.lon0) / K.step * C; }
    var beltTop = y(K.belt[0]), beltBottom = y(K.belt[1]);
    var pins = K.countries.slice().sort(function (a, b) { return (st[a.key] ? 1 : 0) - (st[b.key] ? 1 : 0); }).map(function (c) {
      var px = x(c.pin[0]).toFixed(1), py = y(c.pin[1]).toFixed(1), s = st[c.key];
      var label = c.name + (s ? ": " + s.n + (s.n === 1 ? " smaak" : " smaken") + " geproefd" : ": nog niet ontdekt");
      return '<g class="k-pin' + (s ? " is-visited" : "") + '" data-c="' + c.key + '" tabindex="0" role="button" aria-label="' + esc(label) + '" transform="translate(' + px + " " + py + ')">' +
        '<circle class="k-hit" r="14"/><circle class="k-ring" r="' + (s ? 10 : 6) + '"/><circle class="k-core" r="' + (s ? 5 : 3) + '"/>' +
        (s && s.n > 1 ? '<text class="k-count" y="4">' + s.n + "</text>" : "") + "</g>";
    }).join("");
    var visitedKeys = Object.keys(st);
    var onMap = visitedKeys.filter(function (k) { return kaartCountry(k); });
    var chips = visitedKeys.map(function (k) {
      var s = st[k];
      return '<button type="button" class="kaart-chip' + (kaartCountry(k) ? "" : " is-offmap") + '" data-kaart="' + esc(k) + '">' + esc(s.name) + ' <span>' + s.n + "</span></button>";
    }).join("");
    return '<section class="kaart" aria-labelledby="kaart-title">' +
      '<div class="kaart-head"><div><h3 id="kaart-title">Jouw koffiegordel</h3><p class="kaart-count"><b>' + onMap.length + '</b> van ' + K.countries.length + ' koffielanden ontdekt</p></div>' +
      '<div class="kaart-legend"><span><i class="lg-visited"></i>Geproefd</span><span><i class="lg-coffee"></i>Nog te ontdekken</span></div></div>' +
      '<div class="kaart-map"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Kaart van de koffiegordel met de landen waarvan je koffie hebt geproefd">' +
      '<rect class="k-belt" x="0" y="' + beltTop.toFixed(1) + '" width="' + W + '" height="' + (beltBottom - beltTop).toFixed(1) + '"/>' +
      '<line class="k-tropic" x1="0" x2="' + W + '" y1="' + beltTop.toFixed(1) + '" y2="' + beltTop.toFixed(1) + '"/><line class="k-tropic" x1="0" x2="' + W + '" y1="' + beltBottom.toFixed(1) + '" y2="' + beltBottom.toFixed(1) + '"/>' +
      '<text class="k-beltlabel" x="' + (W - 10) + '" y="' + (beltTop - 8).toFixed(1) + '">KOFFIEGORDEL</text>' +
      '<g class="k-land">' + land.join("") + '</g><g class="k-coffee-dots">' + coffee.join("") + "</g>" + pins + "</svg></div>" +
      '<p class="kaart-info" aria-live="polite">' + (visitedKeys.length ? "Klik op een land om te zien welke smaken je daarvandaan kreeg." : "Na je eerste levering kleurt hier je eerste land oranje.") + "</p>" +
      (chips ? '<div class="kaart-chips">' + chips + "</div>" : "") +
      "</section>";
  }
  function bindKaart(panel, batches) {
    var kaart = panel.querySelector(".kaart");
    if (!kaart) return;
    var st = kaartStats(batches);
    var info = kaart.querySelector(".kaart-info");
    var svg = kaart.querySelector("svg");
    var bar = panel.querySelector(".passport-bar");
    var defaultInfo = info.innerHTML;
    function stars(avg) { var r = Math.round(avg); return "★★★★★".slice(0, r) + "☆☆☆☆☆".slice(0, 5 - r); }
    function describe(key) {
      var c = kaartCountry(key), s = st[key];
      var name = c ? c.name : (s ? s.name : key);
      if (!s) return "<strong>" + esc(name) + "</strong> · nog niet ontdekt. Wie weet komt het binnenkort in je brievenbus.";
      return "<strong>" + esc(name) + "</strong> · " + s.n + (s.n === 1 ? " smaak" : " smaken") + " geproefd" +
        (s.rated ? " · jouw score " + stars(s.sum / s.rated) : " · nog niet beoordeeld") + (c ? "" : " · niet op deze kaart");
    }
    function highlight(key) {
      svg.classList.toggle("has-hover", !!key);
      $$("[data-c]", svg).forEach(function (el) { el.classList.toggle("is-hover", !!key && el.getAttribute("data-c") === key); });
      if (!kaartSelectie) info.innerHTML = key ? describe(key) : defaultInfo;
    }
    function select(key) {
      kaartSelectie = key && st[key] ? key : null;
      svg.classList.toggle("has-selection", !!kaartSelectie);
      $$("[data-c]", svg).forEach(function (el) { el.classList.toggle("is-selected", el.getAttribute("data-c") === kaartSelectie); });
      $$(".kaart-chip", kaart).forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-kaart") === kaartSelectie); b.setAttribute("aria-pressed", b.getAttribute("data-kaart") === kaartSelectie ? "true" : "false"); });
      $$(".bean-card", panel).forEach(function (card) { card.hidden = !!kaartSelectie && card.getAttribute("data-c") !== kaartSelectie; });
      if (bar) {
        bar.hidden = !kaartSelectie;
        if (kaartSelectie) $(".passport-filter", bar).innerHTML = "Smaken uit <strong>" + esc(st[kaartSelectie].name) + "</strong>";
      }
      info.innerHTML = kaartSelectie ? describe(kaartSelectie) : defaultInfo;
    }
    kaart.addEventListener("mouseover", function (e) {
      var el = e.target.closest("[data-c]");
      highlight(el ? el.getAttribute("data-c") : null);
    });
    kaart.addEventListener("mouseleave", function () { highlight(null); });
    kaart.addEventListener("focusin", function (e) {
      var el = e.target.closest(".k-pin");
      if (el) highlight(el.getAttribute("data-c"));
    });
    svg.addEventListener("click", function (e) {
      var el = e.target.closest("[data-c]");
      if (!el) { select(null); return; }
      var key = el.getAttribute("data-c");
      if (!st[key]) { info.innerHTML = describe(key); return; }
      select(kaartSelectie === key ? null : key);
    });
    svg.addEventListener("keydown", function (e) {
      var el = e.target.closest(".k-pin");
      if (el && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        var key = el.getAttribute("data-c");
        if (st[key]) select(kaartSelectie === key ? null : key); else info.innerHTML = describe(key);
      }
    });
    panel.addEventListener("click", function (e) {
      var t = e.target.closest("[data-kaart]");
      if (t) {
        var key = t.getAttribute("data-kaart");
        select(kaartSelectie === key && t.classList.contains("kaart-chip") ? null : key);
        if (t.classList.contains("bean-country")) kaart.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (e.target.closest("[data-kaart-reset]")) select(null);
    });
    // Een smaakkaart aanwijzen laat zijn land oplichten op de kaart
    panel.addEventListener("mouseover", function (e) {
      var card = e.target.closest(".bean-card");
      if (card) highlight(card.getAttribute("data-c"));
    });
    panel.addEventListener("mouseout", function (e) {
      var card = e.target.closest(".bean-card");
      if (card && !card.contains(e.relatedTarget)) highlight(null);
    });
    if (kaartSelectie) select(kaartSelectie);
  }

  function renderDashboard(acc) {
    var root = $("#dash-view");
    var hasSub = !!acc.sub;
    // Wie alleen losse zakken koopt heeft geen abonnement: dan rekenen we met een neutrale invulling
    var sub = acc.sub || { status: "geen", size: "250", freq: "1m", nextDelivery: new Date().toISOString(), anchor: new Date().toISOString(), skipped: [] };
    var orders = acc.orders || [];
    var size = CONFIG.sizes[sub.size];
    var freq = CONFIG.freqs[sub.freq];
    var next = new Date(sub.nextDelivery);
    var firstName = acc.name.split(" ")[0];

    var live = LIVE && acc.live && !acc.demo;
    function persist() { saveAccount(acc); }
    /* Voert een actie uit: op de server (live) of lokaal in het voorbeeld-account. */
    function commit(action, payload, localFn, okMsg, after) {
      function done(fresh) {
        renderDashboard(fresh);
        if (after) after(fresh);
        if (okMsg) toast(typeof okMsg === "function" ? okMsg(fresh) : okMsg);
      }
      if (live) {
        return api("account.php", Object.assign({ action: action }, payload || {})).then(done).catch(function (err) { toast(err.message); });
      }
      localFn();
      persist();
      done(acc);
    }
    function goCheckout(action, extra) {
      api("account.php", Object.assign({ action: action }, extra || {})).then(function (d) { location.href = d.checkoutUrl; }).catch(function (err) { toast(err.message); });
    }

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
      if (live) api("auth.php", { action: "logout" }).then(function () { location.href = "account.html"; }).catch(function () { location.href = "account.html"; });
      else location.href = "account.html";
    };

    // ---- OVERZICHT
    var statusChip = sub.status === "actief"
      ? '<span class="chip chip--ok">Actief</span>'
      : sub.status === "gepauzeerd"
        ? '<span class="chip chip--warn">Gepauzeerd</span>'
        : sub.status === "nieuw"
          ? '<span class="chip chip--warn">Wacht op betaling</span>'
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
    var nextOrder = orders[0];
    function orderChip(o) {
      return o.status === "betaald" ? '<span class="chip chip--ok">Betaald</span>'
        : o.status === "open" ? '<span class="chip chip--warn">Wacht op betaling</span>'
          : '<span class="chip chip--warn">Niet betaald</span>';
    }
    if (!hasSub) {
      nextBlock = nextOrder
        ? '<h3>Je losse zak ' + orderChip(nextOrder) + '</h3><div class="big">' + esc(capitalize(dateFmt.format(new Date(nextOrder.date)))) + '</div><p class="muted" style="margin-top:10px">' +
          (nextOrder.status === "betaald"
            ? (CONFIG.sizes[nextOrder.size] ? esc(CONFIG.sizes[nextOrder.size].bags) : "Je zak") + " hele bonen, de smaak van de maand. We branden vers voor je en hij valt deze dag door de brievenbus."
            : nextOrder.status === "open"
              ? "We hebben je betaling nog niet ontvangen. Heb je net betaald? Ververs de pagina over een minuutje."
              : "Je betaling is niet afgerond. Rond hem alsnog af, dan gaan we direct voor je branden.") + "</p>" +
          (nextOrder.status === "onbetaald" ? '<div class="actions"><button class="btn" data-action="retry-order" data-id="' + nextOrder.id + '">Betalen met iDEAL | Wero</button></div>' : "")
        : '<h3>Geen abonnement</h3><div class="big">Zin in meer?</div><p class="muted" style="margin-top:10px">Met een abonnement krijg je elke maand een nieuwe smaak door de brievenbus, en ' + Math.round(CONFIG.welcomeDiscount * 100) + '% korting op je eerste levering.</p><div class="actions"><a class="btn" href="index.html#abonnement">Start een abonnement</a><a class="btn btn--ghost" href="index.html?ritme=eenmalig#abonnement">Nog een losse zak</a></div>';
    } else if (sub.status === "nieuw") {
      nextBlock = '<h3>Je abonnement ' + statusChip + '</h3><div class="big">Bijna klaar</div><p class="muted" style="margin-top:10px">' +
        (acc.pendingPayment && acc.pendingPayment.status === "open"
          ? "We hebben je betaling nog niet ontvangen. Heb je net betaald? Dan duurt het soms even. Ververs de pagina over een minuutje."
          : "Je eerste betaling is niet afgerond. Rond hem alsnog af, dan gaan we direct voor je branden.") +
        '</p><div class="actions"><button class="btn" data-action="retry-payment">Betalen met iDEAL | Wero</button></div>';
    } else if (sub.status === "opgezegd") {
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
        (sub.pausedUntil ? '<p class="muted" style="margin:6px 0 0;font-size:.9rem"><strong>Daarna gepauzeerd</strong> tot ' + esc(dateFmt.format(new Date(sub.pausedUntil))) + '. <button class="link-arrow" style="background:none;border:0;padding:0;cursor:pointer;color:var(--copper-deep)" data-action="resume">Pauze opheffen</button></p>' : "") +
        '<div class="actions"><button class="btn btn--small" data-action="skip">' + icon("skip") + ' Overslaan</button><button class="btn btn--ghost btn--small" data-action="pause">' + icon("pause") + ' Pauzeren</button><button class="btn btn--ghost btn--small" data-goto="abonnement">' + icon("edit") + " Wijzigen</button></div>";
    }

    $("#tab-overzicht").innerHTML =
      '<span class="kicker">Mijn Khoffie</span>' +
      "<h2>Goedemorgen, " + esc(firstName) + ".</h2>" +
      '<p class="lead">' + (hasSub ? "Alles over je abonnement, leveringen en bonen op één plek." : "Je bestellingen en bonen op één plek.") + '</p>' +
      '<div class="tiles">' +
      '<div class="tile tile--highlight two3">' + nextBlock + '<img class="mystery-bean" src="assets/img/khoffie-boon.svg" alt=""></div>' +
      (hasSub
        ? '<div class="tile third"><h3>Jouw abonnement</h3><dl class="kv">' +
          "<dt>Zak</dt><dd>" + esc(size.label) + "</dd><dt>Ritme</dt><dd>" + esc(freq.label) + "</dd><dt>Bonen</dt><dd>Hele bonen</dd><dt>Prijs</dt><dd>" + eur.format(size.price) + " / levering</dd></dl><p class=\"muted\" style=\"font-size:.85rem;margin:10px 0 0\">Inclusief verzending</p>" +
          '<div class="actions"><button class="link-arrow" style="background:none;border:0;padding:0;cursor:pointer;color:var(--copper)" data-goto="abonnement">Aanpassen</button><a class="link-arrow" style="color:var(--copper)" href="index.html?ritme=eenmalig#abonnement">Losse zak bestellen</a></div></div>'
        : '<div class="tile third"><h3>Losse zakken</h3><div class="big">' + (acc.deliveries.filter(function (d) { return d.oneoff; }).length + orders.filter(function (o) { return o.status === "betaald"; }).length) + ' <small>besteld</small></div><p class="muted" style="margin:8px 0 0">Je hebt geen abonnement. Een losse zak bestel je wanneer je wilt.</p>' +
          '<div class="actions"><a class="link-arrow" style="color:var(--copper)" href="index.html?ritme=eenmalig#abonnement">Losse zak bestellen</a></div></div>') +
      '<div class="tile third"><h3>Bonenpaspoort</h3><div class="big">' + allBatches.length + " <small>" + (allBatches.length === 1 ? "smaak" : "smaken") + "</small></div>" +
      '<p class="muted" style="margin:8px 0 0">' + countries.length + " " + (countries.length === 1 ? "land" : "landen") + " geproefd · " + rated + " beoordeeld</p>" +
      '<div class="progress" aria-hidden="true"><i style="width:' + Math.min(100, (countries.length / kaartTotal()) * 100) + '%"></i></div><p class="muted" style="font-size:.85rem;margin:0">' + countries.length + " van " + kaartTotal() + " koffielanden ontdekt</p>" +
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
    if (!hasSub) {
      $("#tab-abonnement").innerHTML =
        '<span class="kicker">Abonnement</span><h2>Nog geen abonnement</h2>' +
        '<p class="lead">Je bestelt nu losse zakken. Met een abonnement krijg je elke maand vanzelf een nieuwe smaak, en zie je hier je planning.</p>' +
        '<div class="tiles"><div class="tile"><h3>Abonnement starten</h3><p class="muted">250 of 500 gram, 1× of 2× per maand. Geen vaste looptijd: pauzeren, overslaan of stoppen doe je zelf. Je krijgt ' + Math.round(CONFIG.welcomeDiscount * 100) + '% korting op je eerste levering.</p><div class="actions"><a class="btn" href="index.html#abonnement">Start een abonnement</a></div></div>' +
        '<div class="tile"><h3>Nog een losse zak</h3><p class="muted">Gewoon één keer de smaak van de maand, zonder abonnement en zonder machtiging.</p><div class="actions"><a class="btn btn--ghost" href="index.html?ritme=eenmalig#abonnement">Losse zak bestellen</a></div></div></div>';
    } else {
    $("#tab-abonnement").innerHTML =
      '<span class="kicker">Abonnement</span><h2>Jouw abonnement</h2>' +
      '<p class="lead">Pas je zak, ritme of smaakvoorkeur aan wanneer je wilt. Wijzigingen die je tot 7 dagen voor een levering doorgeeft, gelden al voor die levering.</p>' +
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
      '</div><p class="muted" style="font-size:.9rem;margin:12px 0 0">De bonen wisselen per maand. Bij 2× per maand krijg je twee leveringen van dezelfde smaak.</p></div><div class="tile"><h3>Hele bonen</h3><p class="muted" style="margin:0 0 4px">We versturen altijd hele bonen: zo blijft je koffie het langst vers. Maal vlak voor het zetten voor de beste smaak.</p><p class="muted" style="margin:14px 0 0">Welke bonen je krijgt, blijft elke maand een verrassing.</p></div>' +
      '<div class="tile wide" style="padding:18px 24px"><div class="actions" style="margin:0"><button type="submit" class="btn">Wijzigingen opslaan</button></div></div>' +
      "</form>" +
      '<div class="tiles" style="margin-top:16px">' +
      '<div class="tile"><h3>Even geen koffie nodig?</h3><p class="muted">Op vakantie of nog genoeg in huis? Sla een levering over of pauzeer tot 3 maanden. Kost niks.</p><div class="actions">' +
      (sub.status === "nieuw" ? '<span class="muted">Kan zodra je eerste betaling binnen is.</span>' : sub.status === "opgezegd" ? '<button class="btn btn--small" data-action="restart">Hervatten</button>' : paused ? '<button class="btn btn--small" data-action="resume">Hervatten</button>' : '<button class="btn btn--small" data-action="skip">' + icon("skip") + ' Volgende overslaan</button><button class="btn btn--ghost btn--small" data-action="pause">' + icon("pause") + " Pauzeren</button>") +
      "</div></div>" +
      '<div class="tile"><h3>Opzeggen</h3><p class="muted">Geen vaste looptijd, geen kleine lettertjes. Opzeggen kan tot 7 dagen voor je volgende levering.</p><div class="actions">' +
      (sub.status === "opgezegd" ? '<span class="chip">Opgezegd</span>' : sub.status === "nieuw" ? "" : '<button class="btn btn--danger btn--small" data-action="cancel">Abonnement opzeggen</button>') +
      "</div></div></div>";

    $("#plan-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var plan = { size: readChoice(f, "size"), freq: readChoice(f, "freq") };
      commit("update-plan", plan, function () {
        sub.size = plan.size; sub.freq = plan.freq;
      }, locked
        ? "Opgeslagen! Je levering van " + dateFmt.format(next) + " wordt al gebrand, dus dit geldt vanaf " + dateFmt.format(nextAfter(sub, next)) + "."
        : "Opgeslagen! Geldt vanaf je volgende levering.", function () { openTab("abonnement"); });
    });
    }

    // ---- LEVERINGEN
    var upcoming = !hasSub || sub.status === "nieuw" ? []
      : sub.status === "opgezegd"
        ? (sub.lastDelivery && new Date(sub.lastDelivery) >= today ? schedule(sub, new Date(sub.lastDelivery), 1) : [])
        : schedule(sub, next, 4);
    var orderRows = orders.map(function (o) {
      var bags = CONFIG.sizes[o.size] ? CONFIG.sizes[o.size].bags : "";
      var st = o.status === "betaald"
        ? (today > deadlineFor(new Date(o.date)) ? '<span class="chip chip--copper">Wordt gebrand</span>' : '<span class="chip chip--ok">Betaald</span>')
        : orderChip(o) + (o.status === "onbetaald" ? ' <button class="link-arrow" style="background:none;border:0;padding:0;cursor:pointer;color:var(--copper-deep)" data-action="retry-order" data-id="' + o.id + '">Alsnog betalen</button>' : "");
      return "<tr><td>" + esc(capitalize(dateFmt.format(new Date(o.date)))) + "</td><td>Losse zak</td><td>" + esc(bags) + " hele bonen</td><td>" + eur.format(o.price) + "</td><td>" + st + "</td></tr>";
    });
    $("#tab-leveringen").innerHTML =
      '<span class="kicker">Leveringen</span><h2>Leveringen</h2>' +
      '<p class="lead">Wat eraan komt en wat je al hebt gehad. Elke maand een nieuwe batch, met een eigen batchnummer.</p>' +
      '<h3 style="margin:0 0 12px">Gepland</h3>' +
      (upcoming.length || orderRows.length
        ? '<div class="table-wrap" style="margin-bottom:32px"><table class="table"><thead><tr><th>Datum</th><th>Smaak</th><th>Inhoud</th><th>Bedrag</th><th>Status</th></tr></thead><tbody>' +
        upcoming.map(function (u, i) {
          var d = u.date;
          var status = i === 0 && paused ? '<span class="chip chip--warn">Na pauze</span>'
            : today > deadlineFor(d) ? '<span class="chip chip--copper">Wordt gebrand</span>'
              : '<span class="chip">Gepland</span>';
          return "<tr><td>" + esc(capitalize(dateFmt.format(d))) + "</td><td>" + (u.newFlavour ? "Nieuwe smaak" : "Zelfde als vorige") + "</td><td>" + esc(size.bags) + " hele bonen</td><td>" + eur.format(size.price) + "</td><td>" + status + "</td></tr>";
        }).join("") + orderRows.join("") + "</tbody></table></div>"
        : '<p class="muted" style="margin-bottom:32px">Geen geplande leveringen.</p>') +
      '<h3 style="margin:0 0 12px">Geschiedenis</h3>' +
      (acc.deliveries.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Datum</th><th>Batch</th><th>Herkomst</th><th>Inhoud</th><th>Status</th></tr></thead><tbody>' +
        acc.deliveries.slice().reverse().map(function (d) {
          return "<tr><td>" + dateShort.format(new Date(d.date)) + "</td><td>" + esc(d.batch) + (d.oneoff ? '<div class="muted" style="font-size:.85rem">losse zak</div>' : "") + "</td><td>" + esc(d.country) + " · " + esc(d.region) + "</td><td>" + esc(CONFIG.sizes[d.size].bags) + " hele bonen" + '</td><td><span class="chip chip--ok">Bezorgd</span>' +
            (d.tracking && d.tracking.length ? d.tracking.map(function (t, i) { return ' <a href="' + esc(t) + '" target="_blank" rel="noopener">Volg' + (d.tracking.length > 1 ? " " + (i + 1) : "") + "</a>"; }).join("") : "") + '</td></tr>';
        }).join("") + "</tbody></table></div>"
        : '<p class="muted">Nog geen leveringen.' + (hasSub || orders.length ? " Je eerste zak is in de maak!" : "") + '</p>') +
      '<p class="muted" style="margin-top:20px;font-size:.93rem">Iets mis met een levering? <a href="klantenservice.html#contact">Laat het ons weten</a>, dan lossen we het op.</p>';

    // ---- PASPOORT
    $("#tab-paspoort").innerHTML =
      '<span class="kicker">Bonenpaspoort</span><h2>Jouw bonenpaspoort</h2>' +
      '<p class="lead">Elke smaak die je van ons kreeg, met herkomst en smaaknotities. Klik op een land op de kaart om de smaken van daar te zien, en geef ze een score.</p>' +
      '<div class="paspoort-wrap">' + kaartPanel(allBatches) +
      (allBatches.length
        ? '<div class="passport-bar" hidden><span class="passport-filter"></span><button type="button" class="btn btn--ghost btn--small" data-kaart-reset>Toon alle smaken</button></div>' +
        '<div class="passport">' +
        allBatches.slice().reverse().map(function (d) {
          var key = countryKey(d.country);
          return '<article class="bean-card" data-c="' + esc(key) + '"><header><div><div class="batch">Batch ' + esc(d.batch) + '</div>' +
            '<button type="button" class="country bean-country" data-kaart="' + esc(key) + '" title="Toon op de kaart">' + esc(d.country) + "</button>" +
            '<div class="farm">' + esc(d.region) + " · " + esc(d.farm) + "</div></div>" +
            '<span class="chip">' + esc(d.process) + "</span></header>" +
            '<div class="notes">' + d.notes.map(function (n) { return '<span class="chip">' + esc(n) + "</span>"; }).join("") + "</div>" +
            '<div class="roast-scale" aria-label="Brandprofiel ' + d.roast + ' van 5">' + ["Light", "Med. light", "Medium", "Med. dark", "Dark"].map(function (l, i) { return '<span class="' + (i + 1 === d.roast ? "on" : "") + '">' + l + "</span>"; }).join("") + "</div>" +
            '<div class="stars" role="group" aria-label="Beoordeling"><span class="lbl">' + (d.rating ? "Jouw score" : "Beoordeel") + "</span>" +
            [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="' + (n <= d.rating ? "on" : "") + '" data-rate="' + esc(d.batch) + ":" + n + '" aria-label="' + n + ' sterren">' + icon("star") + "</button>"; }).join("") +
            "</div></article>";
        }).join("") + "</div>"
        : '<div class="panel center"><img src="assets/img/khoffie-boon.svg" alt="" style="width:90px;margin:0 auto 18px"><h3>Je paspoort is nog leeg</h3><p class="muted" style="margin:0">Na je eerste levering kleurt je eerste land oranje op de kaart.</p></div>') + "</div>";
    bindKaart($("#tab-paspoort .paspoort-wrap"), allBatches);

    // ---- BETALINGEN
    var invoices = acc.deliveries.slice().reverse();
    $("#tab-betalingen").innerHTML =
      '<span class="kicker">Betalingen</span><h2>Betalingen & facturen</h2>' +
      '<p class="lead">We rekenen pas af als je zak onderweg is. Alle bedragen zijn inclusief btw en verzending.</p>' +
      '<div class="tiles" style="margin-bottom:24px"><div class="tile"><h3>Betaalmethode</h3><div class="big" style="font-size:2rem">' + esc(CONFIG.pay) + '</div>' + (hasSub
        ? '<p class="muted" style="margin:8px 0 0">Via Mollie. Je eerste betaling deed je met iDEAL | Wero; volgende leveringen schrijven we automatisch af van dezelfde rekening' + (sub.account ? " (" + esc(sub.account) + ")" : live ? "" : " (NL•• •••• •••• •••• 42)") + '.</p>' + (acc.credit ? '<p class=\"muted\" style=\"margin:8px 0 0\">Tegoed: <strong>' + eur.format(acc.credit) + '</strong>, verrekenen we met je volgende levering.</p>' : '') + '<div class="actions"><button class="btn btn--ghost btn--small" data-action="change-pay">Andere rekening koppelen</button></div></div>'
        : '<p class="muted" style="margin:8px 0 0">Via Mollie. Een losse zak betaal je per bestelling met iDEAL | Wero. Er is geen machtiging: we schrijven nooit automatisch af.</p></div>') +
      '<div class="tile"><h3>Totaal besteed</h3><div class="big">' + eur.format(acc.deliveries.reduce(function (s, d) { return s + d.price; }, 0)) + '</div><p class="muted" style="margin:8px 0 0">Aan ' + acc.deliveries.length + " leveringen vers gebrande koffie, verzending inbegrepen.</p></div></div>" +
      (invoices.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Factuur</th><th>Datum</th><th>Omschrijving</th><th>Bedrag</th><th>Status</th><th></th></tr></thead><tbody>' +
        invoices.map(function (d, i) {
          return "<tr><td>F" + (2400 + invoices.length - i) + "</td><td>" + dateShort.format(new Date(d.date)) + "</td><td>" + (d.oneoff ? "Losse zak " + esc(CONFIG.sizes[d.size].label) : esc(CONFIG.sizes[d.size].label) + " koffie") + " · batch " + esc(d.batch) + "</td><td>" + eur.format(d.price) + '</td><td><span class="chip chip--ok">Betaald</span></td><td>' + (live && d.invoice ? '<a href="api/factuur.php?id=' + d.invoice + '" target="_blank" rel="noopener">Factuur</a>' : '<a href="#" data-action="invoice">PDF</a>') + '</td></tr>';
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
      var el = f.elements;
      var d = { name: el.name.value.trim(), phone: el.phone.value.trim(), street: el.street.value.trim(), nr: el.nr.value.trim(),
        postcode: el.postcode.value.trim().toUpperCase(), city: el.city.value.trim(), newsletter: el.newsletter.checked };
      commit("update-details", d, function () {
        acc.name = d.name; acc.phone = d.phone; acc.newsletter = d.newsletter;
        acc.address = { street: d.street, nr: d.nr, postcode: d.postcode, city: d.city };
      }, "Je gegevens zijn bijgewerkt.", function () { openTab("gegevens"); });
    });
    $("#pw-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var msg = $("#pw-msg");
      if (!validateForm(f)) return;
      if (live) {
        api("account.php", { action: "change-password", old: f.elements.old.value, "new": f.elements["new"].value }).then(function () {
          f.reset(); msg.classList.add("ok"); msg.textContent = "Wachtwoord gewijzigd.";
        }).catch(function (err) { msg.classList.remove("ok"); msg.textContent = err.message; });
        return;
      }
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
        var raw = rate.getAttribute("data-rate");
        var p = [raw.slice(0, raw.lastIndexOf(":")), raw.slice(raw.lastIndexOf(":") + 1)];
        if (live) {
          commit("rate", { batch: p[0], rating: +p[1] }, null, "Dank voor je score!", function () { openTab("paspoort"); });
          return;
        }
        acc.deliveries.forEach(function (d) { if (d.batch === p[0]) d.rating = +p[1]; });
        persist();
        renderDashboard(acc);
        openTab("paspoort");
        toast("Dank voor je score!");
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
      if (action === "invoice") {
        if (!live) { e.preventDefault(); toast("In het voorbeeld-account zijn geen echte facturen."); }
        return;
      }
      if (action === "retry-payment") { goCheckout("retry-payment"); return; }
      if (action === "retry-order") {
        if (live) goCheckout("retry-order", { id: +btn.getAttribute("data-id") });
        else toast("In het voorbeeld wordt niets afgerekend.");
        return;
      }
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
            commit("skip", {}, function () {
              if (!locked) sub.nextDelivery = after.toISOString();
              else (sub.skipped = sub.skipped || []).push(target.toISOString());
            }, "Levering overgeslagen.");
          });
        return;
      }
      if (action === "pause") { pauseModal(); return; }
      if (action === "resume" && sub.status === "actief" && sub.pausedUntil) {
        commit("resume", {}, function () {
          sub.skipped = (sub.skipped || []).filter(function (x) { return new Date(x) <= next; });
          sub.pausedUntil = null;
        }, "Pauze opgeheven. We leveren weer volgens je gewone ritme.");
        return;
      }
      if (action === "resume" || action === "restart") {
        commit(action, {}, function () {
          sub.status = "actief";
          sub.pausedUntil = null;
          sub.lastDelivery = null;
          var earliest = firstDeliveryDate();
          if (action === "restart" || new Date(sub.nextDelivery) < earliest) {
            if (action === "restart") sub.anchor = earliest.toISOString();
            sub.nextDelivery = schedule(sub, earliest, 1)[0].date.toISOString();
          }
        }, action === "restart" ? "Welkom terug! Je volgende verrassing is onderweg." : "Hervat! We branden weer voor je.");
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
      // Pauze van m maanden = de leveringen van m maanden overslaan
      function resumeAfterPause(m) {
        var n = m * freq.perMonth;
        return schedule(sub, from, n + 1)[n].date;
      }
      var d = modal('<h2>Abonnement pauzeren</h2><p class="muted">Hoe lang wil je pauzeren? Je kunt altijd eerder hervatten.' + (locked ? " Je levering van " + esc(dateFmt.format(next)) + " wordt al gebrand en komt nog." : "") + '</p><div class="options" style="margin-bottom:8px">' +
        [1, 2, 3].map(function (m, i) {
          var resume = resumeAfterPause(m);
          return '<label class="option"><input type="radio" name="months" value="' + m + '"' + (i === 0 ? " checked" : "") + '><span class="card"><span class="title small">' + m + " " + (m === 1 ? "maand" : "maanden") + '</span><span class="sub">Eerstvolgende levering: ' + esc(dateFmt.format(resume)) + "</span></span></label>";
        }).join("") +
        '</div><div class="actions"><button class="btn btn--ghost" value="cancel">Terug</button><button class="btn" value="ok">Pauzeren</button></div>');
      d.addEventListener("close", function () {
        if (d.returnValue !== "ok") return;
        var m = +readChoice(d, "months");
        var resume = resumeAfterPause(m);
        commit("pause", { months: m }, function () {
          if (locked) {
            // de levering die al gebrand wordt gaat nog door; daarna pauze
            var extra = schedule(sub, addDays(next, 1), 12).filter(function (u) { return u.date < resume; });
            sub.pausedUntil = resume.toISOString();
            sub.skipped = (sub.skipped || []).concat(extra.map(function (u) { return u.date.toISOString(); }));
            return;
          }
          sub.status = "gepauzeerd";
          sub.pausedUntil = resume.toISOString();
          sub.nextDelivery = resume.toISOString();
        }, locked
          ? "Na je levering van " + dateFmt.format(next) + " pauzeren we tot " + dateFmt.format(resume) + "."
          : "Gepauzeerd. Je volgende levering is op " + dateFmt.format(resume) + ".");
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
        var reason = d.querySelector("#cancel-reason").value;
        commit("cancel", { reason: reason }, function () {
          sub.status = "opgezegd";
          sub.lastDelivery = locked ? next.toISOString() : null;
        }, "Je abonnement is opgezegd. Je bent altijd welkom terug.", function () { openTab("abonnement"); });
      });
    }
    function payModal() {
      var d = modal('<h2>Andere rekening koppelen</h2><p class="muted">Je gaat naar de beveiligde betaalomgeving van Mollie. Daar doe je een verificatiebetaling van € 0,01 met iDEAL | Wero vanaf je nieuwe rekening. Volgende leveringen schrijven we daarna van die rekening af.</p>' +
        (live ? "" : '<p class="demo-note">Dit is een voorbeeld-account: hier wordt niets gekoppeld.</p>') +
        '<div class="actions"><button class="btn btn--ghost" value="cancel">Terug</button><button class="btn" value="ok">Naar Mollie</button></div>');
      d.addEventListener("close", function () {
        if (d.returnValue !== "ok") return;
        if (live) goCheckout("change-bank");
        else toast("In het voorbeeld-account wordt niets gekoppeld.");
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
