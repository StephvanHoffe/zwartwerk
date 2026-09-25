# Zwartwerk — website

Website voor **Zwartwerk**, een kleinschalige koffiebranderij uit Baarn met een abonnement waarbij je elke maand een nieuwe verrassingssmaak krijgt (nooit twee keer dezelfde).

## Pagina's

| Pagina | Wat staat erop |
| --- | --- |
| `index.html` | Home met alles om een abonnement af te sluiten: hero, uitleg in 4 stappen, "bewuste keuze", uitleg van het etiket, **abonnement-configurator** (hoeveelheid, ritme, maling, smaak, adres, betalen met iDEAL \| Wero) met live prijsoverzicht, herkomstkaart, korte FAQ |
| `hoe-het-werkt.html` | Stap-voor-stap uitleg, flexibiliteit, brievenbus-uitleg, **herkomstlanden** (kaart + 12 landen), waarom Zwartwerk anders is, bewaartips |
| `over-ons.html` | Het verhaal van Zwartwerk, de naam, waarden, proces en bedrijfsgegevens |
| `klantenservice.html` | Snelkoppelingen, FAQ met zoekfunctie en categorieën, contactgegevens en contactformulier (opent het mailprogramma) |
| `account.html` | Inloggen + accountomgeving: overzicht, abonnement wijzigen, leveringen, bonenpaspoort (met beoordelingen), betalingen/facturen en gegevens |
| `algemene-voorwaarden.html`, `privacy.html`, `cookies.html` | Juridische pagina's |

## Hoe het abonnement werkt (bedrijfsregels)

- **250 gram € 16** of **500 gram € 29** per levering, inclusief btw en verzending. 25% korting op de eerste levering.
- Alles gaat als brievenbuspakje in zakken van 250 gram (500 gram = 2 zakken).
- **1× of 2× per maand.** De bonen wisselen per maand: bij 2× per maand zijn beide leveringen in die maand dezelfde smaak, de maand erna komt er een nieuwe.
- Leveringen vallen op dinsdag. De tweede levering bij 2× per maand komt 14 dagen na de eerste.
- **Wijzigen, overslaan, pauzeren en opzeggen kan tot 7 dagen voor een levering.** Daarna wordt de zak al gebrand en geldt de wijziging vanaf de levering daarna.
- Betalen via **Mollie met iDEAL | Wero**. De eerste betaling geeft een machtiging voor automatische afschrijving van volgende leveringen.

Deze regels staan in het `CONFIG`-blok bovenaan `assets/js/main.js` (prijzen, korting, opzegtermijn) en in de teksten van de pagina's.

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
  img/              logo (uit de aangeleverde PDF), zakfoto's, penseeltextuur, favicon,
                    herkomstkaart.svg (gegenereerd uit Natural Earth-data via world-atlas),
                    brander.svg en brievenbus.svg (eigen illustraties)
  fonts/            Anton, Barlow, Barlow Condensed, Yellowtail (SIL Open Font License)
```

Header en footer staan in elke pagina. Pas je die aan, doe dat dan in alle `.html`-bestanden.

## Let op: dit is een front-end prototype

Het ontwerp, alle schermen en de teksten zijn af, maar er is nog **geen backend**:

- Abonnementen en accounts worden alleen in de browser van de bezoeker bewaard (localStorage), en wachtwoorden daar onversleuteld. Niet geschikt voor echte klantgegevens.
- Er wordt nog niet echt afgerekend bij Mollie. De nieuwsbrief verstuurt nog niets. Het contactformulier werkt wel: het opent een e-mail aan info@zwartwerkkoffie.nl.

Voor livegang nodig:

1. **Backend + Mollie-koppeling**: accounts (met versleutelde wachtwoorden), klanten en abonnementen opslaan, de eerste betaling via Mollie (iDEAL | Wero, `sequenceType: first`) laten lopen, en daarna Mollie Subscriptions of eigen terugkerende betalingen op basis van de machtiging. Plus webhooks voor betaalstatussen, en een overzicht voor de branderij: wie krijgt wanneer welke batch.
2. **Hosting** waarop die backend kan draaien, met het domein zwartwerkkoffie.nl.
3. **E-mail**: orderbevestigingen, verzendmails met track & trace, en de nieuwsbrief.
4. **Nog aan te vullen**: telefoonnummer/WhatsApp en social media. Er staan invulplekken als commentaar in de footer en op `klantenservice.html`.
5. **Juridische teksten laten nalezen**: de algemene voorwaarden, privacy- en cookieverklaring zijn zorgvuldig opgesteld, maar geen juridisch advies. De cookieverklaring gaat uit van alleen functionele cookies; voeg je analytics toe, pas hem dan aan.
