# Zwartwerk — website

Website voor **Zwartwerk**, een kleinschalige koffiebranderij uit Baarn met een abonnement waarbij je elke maand een nieuwe verrassingssmaak krijgt (nooit twee keer dezelfde).

## Pagina's

| Pagina | Wat staat erop |
| --- | --- |
| `index.html` | Home met alles om een abonnement af te sluiten: hero, uitleg in 4 stappen, "bewuste keuze", uitleg van het etiket, **abonnement-configurator** (hoeveelheid, ritme, smaak, adres, betalen met iDEAL \| Wero) met live prijsoverzicht, herkomstkaart, korte FAQ |
| `hoe-het-werkt.html` | Stap-voor-stap uitleg, flexibiliteit, brievenbus-uitleg, **herkomstlanden** (kaart + 12 landen), waarom Zwartwerk anders is, bewaartips |
| `over-ons.html` | Het verhaal van Zwartwerk, de naam, waarden, proces en bedrijfsgegevens |
| `klantenservice.html` | Snelkoppelingen, FAQ met zoekfunctie en categorieën, contactgegevens en contactformulier (opent het mailprogramma) |
| `account.html` | Inloggen + accountomgeving: overzicht, abonnement wijzigen, leveringen, bonenpaspoort (met beoordelingen), betalingen/facturen en gegevens |
| `algemene-voorwaarden.html`, `privacy.html`, `cookies.html` | Juridische pagina's |

## Hoe het abonnement werkt (bedrijfsregels)

- **250 gram € 16** of **500 gram € 29** per levering, inclusief btw en verzending. 25% korting op de eerste levering.
- Alles gaat als brievenbuspakje in zakken van 250 gram (500 gram = 2 zakken).
- Uitsluitend **hele bonen** (geen maaloptie): die blijven het langst vers.
- **1× of 2× per maand.** De bonen wisselen per maand: bij 2× per maand zijn beide leveringen in die maand dezelfde smaak, de maand erna komt er een nieuwe.
- Leveringen vallen op dinsdag. De tweede levering bij 2× per maand komt 14 dagen na de eerste.
- **Wijzigen, overslaan, pauzeren en opzeggen kan tot 7 dagen voor een levering.** Daarna wordt de zak al gebrand en geldt de wijziging vanaf de levering daarna.
- Betalen via **Mollie met iDEAL | Wero**. De eerste betaling geeft een machtiging voor automatische afschrijving van volgende leveringen.

Prijzen, korting en opzegtermijn staan in `app/config.php` (de website haalt ze daar op) en in de teksten van de pagina's. Zonder server gebruikt de website het `CONFIG`-blok in `assets/js/main.js`.

Voorbeeld-account: klik op **"Bekijk voorbeeld-account"** op de accountpagina (werkt alleen in je eigen browser en raakt geen echte gegevens).

**Online zetten op Vimexx/DirectAdmin: zie [INSTALLATIE.md](INSTALLATIE.md).**

## Lokaal bekijken

Geen build-stap nodig. Open `index.html` in de browser, of start een lokale server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Structuur

```
index.html, hoe-het-werkt.html, …   de website (statische pagina's)
assets/
  css/style.css       styling website (kleuren als variabelen bovenaan)
  css/fonts.css       zelf gehoste lettertypes (geen Google-verbinding, AVG-vriendelijk)
  js/main.js          configurator, klantaccount, FAQ, formulieren
  img/, fonts/        logo, zakfoto's, illustraties, herkomstkaart, lettertypes
api/                  server-kant voor de website (PHP, JSON)
  subscribe.php       aanmelden + eerste betaling via Mollie
  account.php         klantaccount ophalen en acties (overslaan, pauzeren, …)
  auth.php            inloggen, uitloggen, wachtwoord vergeten/resetten
  mollie-webhook.php  betaalstatussen van Mollie
  sendcloud-webhook.php  track & trace van Sendcloud
  factuur.php         factuur (printbaar / als PDF op te slaan)
beheer/               beheeromgeving (inloggen via /beheer/)
app/                  gedeelde PHP-code en config.php (afgeschermd)
  lib/Schedule.php    leverschema (zelfde regels als main.js)
  lib/Subscriptions.php  abonnementen en klantacties
  lib/Deliveries.php  cron, betalingen, batches, weekoverzicht, Sendcloud
cron/run.php          cronjob (elk uur)
database/schema.sql   databasetabellen (install.php maakt ze aan)
install.php           eenmalige installatie
```

## Hoe de server-kant werkt

- **Aanmelden:** account + abonnement worden aangemaakt en de klant betaalt de eerste levering met iDEAL | Wero bij Mollie. Die betaling geeft ook een machtiging. Na betaling (webhook) wordt het abonnement actief.
- **Cronjob (elk uur):** zodra een levering binnen de 7 dagen valt, wordt hij vastgezet, krijgt hij de batch (smaak) van zijn maand en wordt er automatisch afgeschreven via de machtiging. Pauzes lopen automatisch af.
- **Beheer:** verzendlijst per week, met vaste én voorlopige leveringen, zakken per batch, naar Sendcloud, markeren als verzonden en CSV-export. Verder klanten, smaken, betalingen en instellingen.
- **Zonder server** (bijv. lokaal met `python3 -m http.server`) werkt de website als demo: aanmelden en het account draaien dan in de browser.

## Lokaal ontwikkelen met de server-kant

```bash
cp app/config.example.php app/config.php   # vul een lokale MySQL-database in, zet debug op true
php -S localhost:8000                      # open http://localhost:8000/install.php
php cron/run.php                           # cronjob handmatig draaien
ZW_TODAY=2026-11-01 php cron/run.php       # (alleen met debug) doen alsof het een andere datum is
```

Header en footer staan in elke pagina. Pas je die aan, doe dat dan in alle `.html`-bestanden.

## Nog te doen voor livegang

1. Installeren volgens [INSTALLATIE.md](INSTALLATIE.md): database, config, cronjob, Mollie (iDEAL + SEPA-incasso aan) en Sendcloud.
2. **Nog aan te vullen:** telefoonnummer/WhatsApp en social media. Er staan invulplekken als commentaar in de footer en op `klantenservice.html`.
3. **Juridische teksten laten nalezen.** De algemene voorwaarden, privacy- en cookieverklaring zijn zorgvuldig opgesteld, maar geen juridisch advies.
4. De nieuwsbrief verzamelt adressen (export in het beheer), maar verstuurt zelf niets. Gebruik daarvoor bijvoorbeeld Mailchimp of Brevo.
