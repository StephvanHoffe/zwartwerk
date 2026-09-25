<?php
/* Factuur als printbare pagina (via de browser op te slaan als PDF). Voor de klant zelf of een beheerder. */
declare(strict_types=1);
require __DIR__ . '/_init.php';

$id = (int) ($_GET['id'] ?? 0);
$pay = row('SELECT p.*, u.first_name, u.last_name, u.street, u.house_number, u.postcode, u.city, u.email
            FROM payments p JOIN users u ON u.id = p.user_id WHERE p.id = ? AND p.status = "paid"', [$id]);

$allowed = false;
if ($pay) {
    $allowed = customer_id() === (int) $pay['user_id'];
    if (!$allowed) {
        session_write_close();
        start_admin_session_readonly();
        $allowed = !empty($_SESSION['admin_id']);
    }
}
if (!$allowed) {
    http_response_code(404);
    exit('Factuur niet gevonden.');
}

function start_admin_session_readonly(): void
{
    session_name('zw_admin');
    session_start(['read_and_close' => true]);
}

$delivery = row('SELECT d.*, b.code FROM deliveries d LEFT JOIN batches b ON b.id = d.batch_id WHERE d.payment_id = ?', [$id]);
$number = 'ZW' . substr((string) $pay['created_at'], 0, 4) . '-' . str_pad((string) $pay['id'], 5, '0', STR_PAD_LEFT);
$total = (int) $pay['amount_cents'];
$vat = (int) cfg('vat_pct');
$excl = (int) round($total / (1 + $vat / 100));
$lines = [];
if ($delivery) {
    $lines[] = [
        'Koffieabonnement: ' . ($delivery['size'] === '500' ? '500 gram (2 zakken)' : '250 gram') . ' hele bonen, levering ' . Format::date(new DateTimeImmutable($delivery['delivery_date']), false)
            . ($delivery['code'] ? ' · batch ' . $delivery['code'] : ''),
        (int) $delivery['price_cents'],
    ];
    if ((int) $delivery['discount_cents'] > 0) {
        $lines[] = ['Korting', -(int) $delivery['discount_cents']];
    }
    $lines[] = ['Verzending', 0];
} else {
    $lines[] = [$pay['description'], $total];
}
?><!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>Factuur <?= e($number) ?> — Zwartwerk</title>
<meta name="robots" content="noindex">
<style>
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #121110; max-width: 760px; margin: 40px auto; padding: 0 24px; font-size: 15px; line-height: 1.5; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #e28a56; padding-bottom: 18px; margin-bottom: 28px; }
  h1 { font-size: 28px; letter-spacing: .04em; margin: 0; }
  .muted { color: #6b5f52; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  th, td { text-align: left; padding: 10px 6px; border-bottom: 1px solid #ddd; }
  td.r, th.r { text-align: right; }
  .tot td { border: 0; padding: 4px 6px; }
  .tot .big td { font-weight: 700; font-size: 17px; border-top: 2px solid #121110; padding-top: 10px; }
  .print { background: #e28a56; border: 0; padding: 10px 18px; border-radius: 999px; font-weight: 700; cursor: pointer; }
  @media print { .print { display: none; } body { margin: 0; } }
</style>
</head>
<body>
<p><button class="print" onclick="window.print()">Opslaan als PDF / printen</button></p>
<header>
  <div>
    <h1>ZWARTWERK</h1>
    <div class="muted">Koffie uit kleine oplage</div>
  </div>
  <div class="muted" style="text-align:right">
    Zwartwerk<br>De Savornin Lohmanlaan 7<br>3741 TW Baarn<br><?= e(cfg('mail.from')) ?><br>KvK 89513908<br>Btw NL004738412B27
  </div>
</header>

<div style="display:flex;justify-content:space-between;gap:24px">
  <div>
    <strong>Factuur aan</strong><br>
    <?= e($pay['first_name'] . ' ' . $pay['last_name']) ?><br>
    <?= e($pay['street'] . ' ' . $pay['house_number']) ?><br>
    <?= e($pay['postcode'] . ' ' . $pay['city']) ?><br>
    <?= e($pay['email']) ?>
  </div>
  <div style="text-align:right">
    <strong>Factuur <?= e($number) ?></strong><br>
    Factuurdatum: <?= e(Format::date(new DateTimeImmutable($pay['paid_at'] ?: $pay['created_at']), false) . ' ' . substr((string) ($pay['paid_at'] ?: $pay['created_at']), 0, 4)) ?><br>
    Status: betaald
  </div>
</div>

<table>
  <thead><tr><th>Omschrijving</th><th class="r">Bedrag incl. btw</th></tr></thead>
  <tbody>
  <?php foreach ($lines as [$label, $cents]): ?>
    <tr><td><?= e($label) ?></td><td class="r"><?= $cents === 0 ? 'inbegrepen' : e(money($cents)) ?></td></tr>
  <?php endforeach; ?>
  </tbody>
</table>
<table class="tot">
  <tr><td class="r">Totaal excl. btw</td><td class="r" style="width:140px"><?= e(money($excl)) ?></td></tr>
  <tr><td class="r">Btw <?= $vat ?>%</td><td class="r"><?= e(money($total - $excl)) ?></td></tr>
  <tr class="big"><td class="r">Totaal</td><td class="r"><?= e(money($total)) ?></td></tr>
</table>
<p class="muted">Betaald via Mollie (iDEAL | Wero / automatische incasso). Bedankt dat je Zwartwerk drinkt!</p>
</body>
</html>
