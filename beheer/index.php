<?php
declare(strict_types=1);
require __DIR__ . '/_init.php';
require_admin();

$today = today();
$monday = $today->modify('monday this week');
$week = Deliveries::week($monday);
$nextWeek = Deliveries::week($monday->modify('+7 days'));
$count = fn(array $list) => ['parcels' => count($list), 'bags' => array_sum(array_column($list, 'bags'))];
$tw = $count(array_filter($week, fn($r) => $r['status'] !== 'geannuleerd'));
$nw = $count(array_filter($nextWeek, fn($r) => $r['status'] !== 'geannuleerd'));

$stats = row('SELECT
    SUM(status = "actief") AS actief, SUM(status = "gepauzeerd") AS gepauzeerd,
    SUM(status = "opgezegd") AS opgezegd, SUM(status = "nieuw") AS nieuw,
    SUM(status IN ("actief","gepauzeerd") AND size = "250") AS s250, SUM(status IN ("actief","gepauzeerd") AND size = "500") AS s500
  FROM subscriptions');
$month = row('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE status = "paid" AND paid_at >= ?', [$today->format('Y-m-01')]);
$failed = rows('SELECT d.id, d.delivery_date, u.id AS uid, u.first_name, u.last_name FROM deliveries d JOIN users u ON u.id = d.user_id WHERE d.status = "betaling_mislukt" ORDER BY d.delivery_date');
$noBatch = row('SELECT COUNT(*) AS n FROM deliveries WHERE batch_id IS NULL AND status IN ("betaald", "wacht_op_betaling")');
$months = [$today->format('Y-m'), $today->modify('first day of next month')->format('Y-m')];
$batchMissing = array_filter($months, fn($m) => !row('SELECT id FROM batches WHERE month = ? AND active = 1', [$m]));
$cronLast = setting('cron_last_run');
$recent = rows('SELECT u.id, u.first_name, u.last_name, u.city, u.created_at, s.status, s.size, s.freq FROM users u JOIN subscriptions s ON s.user_id = u.id ORDER BY u.id DESC LIMIT 6');

layout_start('Overzicht', 'index');
?>
<h1>Goedemorgen</h1>
<p class="muted">Vandaag is het <?= e(Format::date($today)) ?>.</p>

<?php if (!$cronLast || strtotime($cronLast) < time() - 36 * 3600): ?>
  <div class="flash flash--bad">De cronjob heeft <?= $cronLast ? 'sinds ' . e($cronLast) : 'nog nooit' ?> gedraaid. Zonder cronjob worden leveringen niet vastgezet en niet afgeschreven. Zie INSTALLATIE.md, stap 6.</div>
<?php endif; ?>
<?php foreach ($batchMissing as $m): ?>
  <div class="flash flash--warn">Er is nog geen smaak (batch) ingesteld voor <?= e(Format::monthName($m)) ?>. <a href="batches.php?new=<?= e($m) ?>">Nu toevoegen</a></div>
<?php endforeach; ?>
<?php if ((int) $noBatch['n'] > 0): ?>
  <div class="flash flash--warn"><?= (int) $noBatch['n'] ?> levering(en) hebben nog geen batch. <a href="batches.php">Voeg de smaak van de maand toe</a> en klik daar op ‘Batches toewijzen’.</div>
<?php endif; ?>

<div class="cards">
  <a class="card card--copper" href="week.php" style="text-decoration:none"><h3>Deze week verzenden</h3><div class="big"><?= $tw['parcels'] ?></div><div><?= $tw['bags'] ?> zakken van 250 g →</div></a>
  <a class="card" href="week.php?week=<?= e($monday->modify('+7 days')->format('Y-m-d')) ?>" style="text-decoration:none;color:inherit"><h3>Volgende week</h3><div class="big"><?= $nw['parcels'] ?></div><div class="muted"><?= $nw['bags'] ?> zakken (deels voorlopig)</div></a>
  <div class="card"><h3>Actieve abonnees</h3><div class="big"><?= (int) $stats['actief'] ?></div><div class="muted"><?= (int) $stats['gepauzeerd'] ?> gepauzeerd · <?= (int) $stats['s250'] ?>× 250 g · <?= (int) $stats['s500'] ?>× 500 g</div></div>
  <div class="card"><h3>Ontvangen deze maand</h3><div class="big"><?= e(money((int) $month['total'])) ?></div><div class="muted">incl. btw</div></div>
</div>

<div class="grid2">
  <div class="panel">
    <h3>Aandacht nodig</h3>
    <?php if (!$failed && !(int) $stats['nieuw']): ?>
      <p class="muted">Niets bijzonders. ☕</p>
    <?php endif; ?>
    <?php foreach ($failed as $f): ?>
      <p><?= status_chip('betaling_mislukt') ?> <a href="klant.php?id=<?= (int) $f['uid'] ?>"><?= e($f['first_name'] . ' ' . $f['last_name']) ?></a> — levering <?= e(nl_date($f['delivery_date'])) ?></p>
    <?php endforeach; ?>
    <?php if ((int) $stats['nieuw']): ?>
      <p class="muted small"><?= (int) $stats['nieuw'] ?> aanmelding(en) hebben de eerste betaling (nog) niet afgerond. <a href="klanten.php?status=nieuw">Bekijken</a></p>
    <?php endif; ?>
  </div>
  <div class="panel">
    <h3>Nieuwste klanten</h3>
    <?php foreach ($recent as $r): ?>
      <p style="margin:0 0 6px"><a href="klant.php?id=<?= (int) $r['id'] ?>"><?= e($r['first_name'] . ' ' . $r['last_name']) ?></a>
        <span class="muted small">· <?= e($r['city']) ?> · <?= $r['size'] === '500' ? '500 g' : '250 g' ?>, <?= $r['freq'] === '2m' ? '2×' : '1×' ?> p/m</span> <?= status_chip($r['status']) ?></p>
    <?php endforeach; ?>
    <?php if (!$recent): ?><p class="muted">Nog geen klanten.</p><?php endif; ?>
  </div>
</div>
<p class="muted small">Cronjob laatst gedraaid: <?= e($cronLast ?: 'nog nooit') ?></p>
<?php layout_end();
