# Zwartwerk online zetten (Vimexx / DirectAdmin)

Deze handleiding zet de website, het klantaccount, de betalingen (Mollie) en het beheer live op je Vimexx-hosting. Reken op ongeveer een uur. Doe alles eerst in **testmodus** (Mollie test-sleutel), dan wordt er niets echt afgeschreven.

---

## 1. PHP-versie en SSL

1. Log in op DirectAdmin.
2. **PHP-versie selecteren** (of "Select PHP version"): kies **8.1 of hoger** (8.3 is prima).
3. **SSL-certificaten** → vink **Let's Encrypt** aan voor `zwartwerkkoffie.nl` en `www.zwartwerkkoffie.nl` en sla op.
   Zet daarna "Forceer SSL" / "Force SSL with https redirect" aan, als je die optie ziet.

## 2. Database aanmaken

1. DirectAdmin → **MySQL-beheer** → **Nieuwe database**.
2. Kies een naam (bijv. `zwartwerk`) en laat een sterk wachtwoord genereren.
3. Noteer: **databasenaam**, **gebruikersnaam** en **wachtwoord**. DirectAdmin zet vaak je gebruikersnaam ervoor, bijvoorbeeld `jouwnaam_zwartwerk`.

## 3. Bestanden uploaden

1. Download de code van GitHub als ZIP: groene knop **Code** → **Download ZIP**, van de branch met deze website.
2. DirectAdmin → **Bestandsbeheer** → `domains/zwartwerkkoffie.nl/public_html`.
3. Verwijder de standaardbestanden die Vimexx daar neerzet, zoals `index.html` of `default.html`.
4. Upload de ZIP en pak hem uit (rechtermuisknop → **Uitpakken**). Zorg dat `index.html`, `install.php` en de mappen `api`, `app`, `assets`, `beheer`, `cron` en `database` **direct** in `public_html` staan, niet in een submap.

## 4. Instellingen invullen

1. Ga in Bestandsbeheer naar `public_html/app`.
2. Kopieer `config.example.php` en noem de kopie `config.php`.
3. Open `config.php` (bewerken) en vul in:
   - `base_url` → `https://www.zwartwerkkoffie.nl` (zonder `/` aan het eind)
   - `db` → de gegevens uit stap 2
   - `mollie.api_key` → je **test**-sleutel (begint met `test_`), zie stap 7
   - `sendcloud.public_key` en `secret_key` → zie stap 8 (mag later)
   - `cron_token` → een lange willekeurige tekst (bijv. 40 letters en cijfers door elkaar)

> `config.php` bevat je geheime sleutels. Deel dit bestand nooit en zet het niet in GitHub. De map `app` is afgeschermd voor bezoekers.

## 5. Installeren en je beheeraccount aanmaken

1. Ga naar **https://www.zwartwerkkoffie.nl/install.php**.
2. Alle controles moeten op **OK** staan. Staat de database op "Ontbreekt"? Controleer dan de gegevens in `config.php`.
3. Vul je naam, e-mailadres en een wachtwoord (minimaal 10 tekens) in en klik **Installeren**.
4. **Verwijder daarna `install.php`** via Bestandsbeheer. Hij werkt sowieso niet meer als er al een beheerder is, maar opruimen is netter.
5. Inloggen op het beheer: **https://www.zwartwerkkoffie.nl/beheer/**

## 6. Cronjob instellen (belangrijk!)

De cronjob zet elke levering 7 dagen van tevoren vast, schrijft dan af en laat pauzes automatisch aflopen. Zonder cronjob gebeurt dat niet.

1. DirectAdmin → **Geavanceerde functies** → **Cronjobs**.
2. Nieuwe cronjob: minuut `15`, uur `*`, dag `*`, maand `*`, weekdag `*` (= elk uur).
3. Commando (vervang `GEBRUIKER` door je DirectAdmin-gebruikersnaam):
   ```
   /usr/local/bin/php /home/GEBRUIKER/domains/zwartwerkkoffie.nl/public_html/cron/run.php > /dev/null 2>&1
   ```
   Het precieze pad staat ook in het beheer onder **Instellingen**.
4. Na een uur zie je in het beheer bij **Instellingen → Koppelingen** "Cronjob: laatst gedraaid …".

*Werkt het commando niet? Dan kan de cronjob ook een URL aanroepen:*
`wget -q -O /dev/null "https://www.zwartwerkkoffie.nl/api/cron.php?token=JOUW_CRON_TOKEN"`

## 7. Mollie

1. Log in op **my.mollie.com**.
2. **Betaalmethoden**: zet **iDEAL** (iDEAL | Wero) én **SEPA-incasso** aan. SEPA-incasso is nodig voor de automatische maandelijkse afschrijvingen. Mollie moet dit soms eerst goedkeuren.
3. **Ontwikkelaars → API-sleutels**: kopieer de **Test API key** naar `config.php`.
4. Een webhook hoef je niet in te stellen; de website geeft die zelf mee.
5. Testen: sluit op de website een abonnement af. Op de testbetaalpagina van Mollie kies je "Paid". Daarna:
   - staat de klant in het beheer op **Actief**;
   - staat de eerste levering in de **Verzendlijst**;
   - krijgt de klant een welkomstmail.
6. Werkt alles? Vervang de test-sleutel door de **Live API key** (begint met `live_`). De oranje "Testmodus"-balk in het beheer verdwijnt dan.

## 8. Sendcloud

1. Sendcloud → **Instellingen → Integraties** → zoek **Sendcloud API** → **Verbinden**. Geef het een naam, bijv. "Zwartwerk website".
2. Vink **Webhook** aan en vul in: `https://www.zwartwerkkoffie.nl/api/sendcloud-webhook.php`
3. Kopieer de **Public key** en **Secret key** naar `config.php`.
4. Controleer bij **Instellingen → Afzenderadressen** dat je afzenderadres (Baarn) klopt.
5. Optioneel: wil je dat labels meteen worden gemaakt met je brievenbuspakje-methode? Zet dan het ID van die verzendmethode bij `shipping_method_id`. Laat je het leeg, dan komen de zendingen in Sendcloud klaar te staan en kies je daar zelf de methode en print je de labels.
6. In het beheer → **Instellingen** moet Sendcloud nu op "Verbonden" staan.

Standaard wordt elke zak van 250 gram een eigen brievenbuspakje (500 gram = 2 pakjes). Wil je dat anders? Zet `parcel_per_bag` in `config.php` op `false`.

## 9. E-mail

1. DirectAdmin → **E-mailbeheer**: maak het account `info@zwartwerkkoffie.nl` aan, als dat er nog niet is.
2. Controleer bij **DNS-beheer** dat er SPF- en DKIM-records zijn. DirectAdmin zet die meestal automatisch; zonder deze records komen mails vaker in de spam terecht.
3. Test: vraag op de website via "Wachtwoord vergeten?" een resetlink aan voor je testaccount. In het beheer → **Instellingen** zie je alle verstuurde mails.

## 10. Klaar voor de eerste klanten

1. Beheer → **Smaken (batches)**: voeg de smaak van **deze** en **volgende** maand toe (land, regio, smaaknotities, brandprofiel).
2. Doe een testbestelling in testmodus, verstuur hem via de Verzendlijst en bekijk het klantaccount.
3. Zet Mollie op live (stap 7.6).

---

## Je wekelijkse routine

1. **Maandag: Verzendlijst openen.** Bovenaan zie je per batch hoeveel zakken je moet branden. Leveringen van meer dan 7 dagen vooruit staan als *voorlopig* in de lijst, zodat je vooruit kunt plannen.
2. **Branden en inpakken.** Tip: druk op **Print paklijst**.
3. **Dinsdag: versturen.**
   1. Vink de betaalde leveringen aan (vinkje bovenin = alles).
   2. Klik **Naar Sendcloud** en print in Sendcloud de labels.
   3. Klik daarna **Markeer als verzonden**. De klant krijgt een mail met de track & trace-link.
4. **Aandacht nodig?** Het overzicht toont mislukte betalingen. Bij een klant of onder **Betalingen** kun je opnieuw afschrijven.

## Veelgestelde vragen over het beheer

- **Een klant belt om iets te wijzigen.** Beheer → Klanten → zoek de klant. Je kunt het abonnement aanpassen, een levering overslaan, pauzeren, de leverdatum verzetten, opzeggen, tegoed geven en een wachtwoord-resetlink sturen.
- **Andere prijzen?** Pas `prices` aan in `app/config.php` én de teksten op de website (index.html, hoe-het-werkt.html, klantenservice.html en algemene-voorwaarden.html).
- **Een extra beheerder?** Beheer → Instellingen → Beheerders.
- **Klant wil zijn gegevens verwijderd hebben (AVG)?** Zeg het abonnement op en klik op de klantpagina op "Persoonsgegevens verwijderen". Betalingen blijven bewaard voor de belastingdienst.
- **Back-up.** DirectAdmin → **Back-up maken**. Vink de database aan en maak minstens wekelijks een back-up.
