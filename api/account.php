<?php
/* Accountgegevens ophalen (GET) en acties uitvoeren (POST). */
declare(strict_types=1);
require __DIR__ . '/_init.php';

$uid = require_customer();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    Http::json(Subscriptions::account($uid));
}

$in = Http::input();
$action = (string) ($in['action'] ?? '');
if ($action === 'retry-payment') {
    Http::json(['ok' => true, 'checkoutUrl' => Subscriptions::startFirstPayment($uid)]);
}
if ($action === 'change-bank') {
    Http::json(['ok' => true, 'checkoutUrl' => Subscriptions::startBankChange($uid)]);
}
Http::json(Subscriptions::action($uid, $action, $in));
