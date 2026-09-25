# Zwartwerk — website

Website voor **Zwartwerk**, een kleinschalige koffiebranderij met een abonnement waarbij je elke levering andere verrassingsbonen krijgt (nooit twee keer dezelfde).

## Pagina's

| Pagina | Wat staat erop |
| --- | --- |
| `index.html` | Home met alles om een abonnement af te sluiten: hero, uitleg in 4 stappen, "bewuste keuze", uitleg van het etiket, **abonnement-configurator** (hoeveelheid, ritme, maling, smaak, adres, betaling) met live prijsoverzicht, voorbeeldjaar, korte FAQ |
| `hoe-het-werkt.html` | Stap-voor-stap uitleg, flexibiliteit (pauzeren/overslaan/opzeggen), waarom Zwartwerk anders is, bewaartips |
| `klantenservice.html` | Snelkoppelingen, FAQ met zoekfunctie en categorieën, contactgegevens, openingstijden en contactformulier |
| `account.html` | Inloggen + accountomgeving: overzicht, abonnement wijzigen, leveringen, bonenpaspoort (met beoordelingen), betalingen/facturen en gegevens |

Demo-account: klik op **"Bekijk demo-account"** op de accountpagina, of log in met `demo@zwartwerk.nl` / `koffie`.

## Lokaal bekijken

Geen build-stap nodig. Open `index.html` in de browser, of start een lokale server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Structuur

```
assets/
  css/style.css     alle styling (kleuren als variabelen bovenaan)
  css/fonts.css     zelf gehoste lettertypes (geen Google-verbinding, AVG-vriendelijk)
  js/main.js        configurator, account, FAQ, formulieren
  img/              logo (uit de aangeleverde PDF), zakfoto's, penseeltextuur, favicon
  fonts/            Anton, Barlow, Barlow Condensed, Yellowtail (SIL Open Font License)
```

Prijzen, maten, malingen en de welkomstkorting pas je aan in het `CONFIG`-blok bovenaan `assets/js/main.js`. De prijzen die in de HTML staan worden daar automatisch mee overschreven.

## Let op: dit is een front-end prototype

Het ontwerp en alle schermen zijn af, maar er is nog **geen backend**:

- Abonnementen en accounts worden alleen in de browser van de bezoeker bewaard (localStorage). Wachtwoorden worden daar niet versleuteld opgeslagen.
- Er wordt nog niet echt betaald. Het contactformulier en de nieuwsbrief versturen nog niets.

Voor livegang nodig:

1. Een platform of backend voor abonnementen, accounts en terugkerende betalingen. Opties: Shopify of WooCommerce met een abonnementsplugin, of een eigen backend met Mollie (iDEAL + SEPA-incasso via Mollie Subscriptions).
2. Het contactformulier en de nieuwsbrief koppelen, bijvoorbeeld aan e-mail of Mailchimp/Brevo.
3. Algemene voorwaarden, privacy- en cookiebeleid, en KvK/btw-gegevens in de footer.
4. Alle placeholders vervangen: telefoon, WhatsApp, adres, socials en de teksten over bezorging.
