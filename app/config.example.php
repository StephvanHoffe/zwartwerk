<?php
/*
 * Khoffie — configuratie
 *
 * Kopieer dit bestand naar app/config.php en vul je eigen gegevens in.
 * config.php staat NIET in git: zet je sleutels nooit in de code of in een chat.
 */
return [
    // Volledige adres van de website, zonder / aan het eind
    'base_url' => 'https://www.zwartwerkkoffie.nl',

    // Database (DirectAdmin → MySQL-beheer)
    'db' => [
        'host' => 'localhost',
        'name' => 'gebruiker_zwartwerk',
        'user' => 'gebruiker_zwartwerk',
        'pass' => 'wachtwoord',
    ],

    // Mollie (Mollie Dashboard → Ontwikkelaars → API-sleutels)
    // Begin met de test_-sleutel. Werkt alles? Vervang door de live_-sleutel.
    'mollie' => [
        'api_key' => 'test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        'api_url' => 'https://api.mollie.com/v2',
    ],

    // Sendcloud (Sendcloud → Instellingen → Integraties → Sendcloud API)
    'sendcloud' => [
        'public_key' => '',
        'secret_key' => '',
        'api_url' => 'https://panel.sendcloud.sc/api/v2',
        // Optioneel: ID van je verzendmethode (brievenbuspakje). Leeg = zendingen
        // komen in Sendcloud klaar te staan en je kiest daar zelf de methode en print het label.
        'shipping_method_id' => null,
        'weight_per_bag_kg' => 0.30,
        // true = elke zak van 250 g een eigen brievenbuspakje (500 g = 2 pakjes)
        'parcel_per_bag' => true,
    ],

    // E-mail
    'mail' => [
        'from' => 'info@zwartwerkkoffie.nl',
        'from_name' => 'Khoffie',
        'admin_to' => 'info@zwartwerkkoffie.nl', // melding bij nieuwe abonnees en mislukte betalingen
        'enabled' => true,                        // false = mails alleen loggen (om te testen)
    ],

    // Abonnement — houd deze gelijk aan de teksten op de website
    'prices' => ['250' => 1600, '500' => 2900],   // in centen, incl. btw en verzending
    // Losse zak (eenmalig, geen abonnement, geen welkomstkorting). Weglaten = zelfde prijs als het abonnement.
    // 'oneoff_prices' => ['250' => 1800, '500' => 3300],
    'bags' => ['250' => 1, '500' => 2],
    'welcome_discount_pct' => 25,
    'referral_discount_pct' => 50,               // korting eerste levering met uitnodigingscode
    'referral_credit_cents' => 500,              // tegoed voor wie uitnodigt
    'cancel_days' => 7,
    'first_delivery_min_days' => 3,
    'vat_pct' => 9,                              // btw op koffie (levensmiddel)

    // Beveiliging: willekeurige lange tekst, alleen nodig voor de cron-URL (zie INSTALLATIE.md)
    'cron_token' => 'vervang-dit-door-een-lange-willekeurige-tekst',

    // Alleen voor ontwikkeling
    'debug' => false,
];
