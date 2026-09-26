<?php
/* De website controleert hiermee of de server-kant actief is, en haalt de actuele prijzen op. */
declare(strict_types=1);
require __DIR__ . '/_init.php';

$prices = [];
foreach (cfg('prices') as $size => $cents) {
    $prices[$size] = $cents / 100;
}
$oneoff = [];
foreach (cfg('oneoff_prices') ?: cfg('prices') as $size => $cents) {
    $oneoff[$size] = $cents / 100;
}
Http::json([
    'ok' => true,
    'live' => true,
    'prices' => $prices,
    'oneoffPrices' => $oneoff,
    'welcomeDiscount' => cfg('welcome_discount_pct') / 100,
    'referralDiscount' => cfg('referral_discount_pct') / 100,
    'cancelDays' => (int) cfg('cancel_days'),
]);
