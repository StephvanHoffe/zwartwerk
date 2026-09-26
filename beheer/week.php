<?php
/*
 * Verzendlijst per week: wie krijgt deze week koffie, welke smaak, betaald of niet,
 * en in één klik naar Sendcloud.
 */
declare(strict_types=1);
require __DIR__ . '/_init.php';
require_admin();

$today = today();
$param = (string) ($_GET['week'] ?? $_POST['week'] ?? '');
$base = preg_match('/^\d{4}-\d{2}-\d{2}$/', $param) ? new DateTimeImmutable($param) : $today;
$monday = $base->modify(((int) $base->format('N') === 1) ? 'today' : 'last monday');
$sunday = $monday->modify('+6 days');
$self = 'week.php?week=' . $monday->format('Y-m-d');

if (is_post()) {
    $ids = array_map('intval', (array) ($_POST['ids'] ?? []));
    $action = (string) ($_POST['action'] ?? '');
    try {
        if ($action === 'assign') {
            $n = Deliveries::assignMissingBatches();
            flash($n ? "$n levering(en) hebben een batch gekregen." : 'Er waren geen leveringen zonder batch (of er is nog geen batch voor die maand).', $n ? 'ok' : 'warn');
        } elseif (!$ids) {
            flash('Selecteer eerst een of meer leveringen.', 'warn');
        } elseif ($action === 'sendcloud') {
            $r = Deliveries::toSendcloud($ids);
            flash($r['done'] . ' levering(en) aangemaakt in Sendcloud. Print de labels in je Sendcloud-account.', $r['done'] ? 'ok' : 'warn');
            if ($r['skipped']) {
                flash('Overgeslagen: ' . implode(', ', $r['skipped']), 'warn');
            }
        } elseif ($action === 'shipped') {
            $n = Deliveries::markShipped($ids, !empty($_POST['mail']));
            flash("$n levering(en) gemarkeerd als verzonden" . (!empty($_POST['mail']) ? ' en de klanten zijn gemaild.' : '.'));
        }
    } catch (Throwable $e) {
        flash('Fout: ' . $e->getMessage(), 'bad');
        log_msg('error', 'Weekoverzicht: ' . $e->getMessage());
    }
    redirect($self);
}

$list = Deliveries::week($monday);

if (($_GET['export'] ?? '') === 'csv') {
    $onlyFixed = ($_GET['alleen'] ?? '') === 'vast';
    $exp = array_filter($list, fn($r) => $r['status'] !== 'geannuleerd' && (!$onlyFixed || !$r['projected']));
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="khoffie-week-' . $monday->format('o-\WW') . '.csv"');
    echo Deliveries::csv($exp);
    exit;
}

$active = array_filter($list, fn($r) => $r['status'] !== 'geannuleerd');
$bags = array_sum(array_column($active, 'bags'));
$perBatch = [];
foreach ($active as $r) {
    $key = $r['batch_code'] ? $r['batch_code'] . ' · ' . $r['batch_country'] : 'Smaak ' . Format::monthName($r['flavour_month']) . ' (nog geen batch)';
    $perBatch[$key] = ($perBatch[$key] ?? 0) + (int) $r['bags'];
}
$perStatus = [];
foreach ($list as $r) {
    $perStatus[$r['status']] = ($perStatus[$r['status']] ?? 0) + 1;
}
$weekLabel = 'Week ' . (int) $monday->format('W') . ' · ' . Format::date($monday, false) . ' – ' . Format::date($sunday, false);

layout_start('Verzendlijst', 'week');
?>
<h1>Verzendlijst</h1>
<div class="weeknav">
  <a class="btn btn--ghost btn--small" href="week.php?week=<?= e($monday->modify('-7 days')->format('Y-m-d')) ?>">← Vorige</a>
  <span class="current"><?= e($weekLabel) ?></span>
  <a class="btn btn--ghost btn--small" href="week.php?week=<?= e($monday->modify('+7 days')->format('Y-m-d')) ?>">Volgende →</a>
  <?php if ($monday->format('Y-m-d') !== $today->modify(((int) $today->format('N') === 1) ? 'today' : 'last monday')->format('Y-m-d')): ?>
    <a class="btn btn--ghost btn--small" href="week.php">Deze week</a>
  <?php endif; ?>
</div>

<div class="totals">
  <span class="chip chip--warn"><?= count($active) ?> leveringen</span>
  <span class="chip chip--warn"><?= $bags ?> zakken van 250 g</span>
  <?php foreach ($perBatch as $label => $n): ?><span class="chip chip--muted"><?= e($label) ?>: <?= $n ?> zakken</span><?php endforeach; ?>
  <?php foreach ($perStatus as $s => $n): ?><span class="chip chip--muted"><?= e(Deliveries::statusLabel($s)) ?>: <?= $n ?></span><?php endforeach; ?>
</div>

<p class="muted small no-print">
  <strong>Vast</strong> = de 7 dagen zijn verstreken, er is afgeschreven en de klant kan niets meer wijzigen.
  <strong>Voorlopig</strong> = de klant kan nog wijzigen of overslaan tot de genoemde datum; zo zie je alvast hoeveel je moet branden.
</p>

<form method="post">
  <?= csrf_field() ?>
  <input type="hidden" name="week" value="<?= e($monday->format('Y-m-d')) ?>">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th><input type="checkbox" data-check-all=".pick" aria-label="Alles selecteren"></th>
        <th>Klant</th><th>Adres</th><th>Zakken</th><th>Smaak</th><th>Betaling</th><th>Status</th><th>Sendcloud</th>
      </tr></thead>
      <tbody>
      <?php
      $day = null;
      foreach ($list as $r):
          if ($r['delivery_date'] !== $day):
              $day = $r['delivery_date'];
              $dayRows = array_filter($active, fn($x) => $x['delivery_date'] === $day);
      ?>
        <tr class="day"><td colspan="8"><?= e(ucfirst(Format::date(new DateTimeImmutable($day)))) ?> · <?= count($dayRows) ?> leveringen · <?= array_sum(array_column($dayRows, 'bags')) ?> zakken</td></tr>
      <?php endif; ?>
        <tr class="<?= $r['projected'] ? 'projected' : '' ?>">
          <td><?php if (!$r['projected']): ?><input type="checkbox" class="pick" name="ids[]" value="<?= (int) $r['id'] ?>"<?= $r['status'] === 'geannuleerd' ? ' disabled' : '' ?>><?php endif; ?></td>
          <td><a href="klant.php?id=<?= (int) $r['user_id'] ?>"><?= e($r['first_name'] . ' ' . $r['last_name']) ?></a><?php if ($r['id']): ?><div class="muted small">KH-<?= (int) $r['id'] ?><?= ($r['sub_freq'] ?? '') === '1x' ? ' · losse zak' : '' ?></div><?php endif; ?></td>
          <td class="small"><?= e($r['street'] . ' ' . $r['house_number']) ?><br><?= e($r['postcode'] . ' ' . $r['city']) ?></td>
          <td><?= (int) $r['bags'] ?>×</td>
          <td class="small"><?= $r['batch_code'] ? e($r['batch_code']) . '<br><span class="muted">' . e($r['batch_country']) . '</span>' : '<span class="muted">Smaak ' . e(Format::monthName($r['flavour_month'])) . '</span>' ?>
            <?= !$r['new_flavour'] ? '<div class="muted small">2e levering van de maand</div>' : '' ?></td>
          <td><?= $r['payment_status'] ? status_chip($r['payment_status']) : ($r['projected'] ? '<span class="muted small">bij vastzetten</span>' : '') ?></td>
          <td><?= status_chip($r['status']) ?><?php if ($r['projected']): ?><div class="muted small">wijzigbaar t/m <?= e(Format::date(new DateTimeImmutable($r['deadline']), false)) ?></div><?php endif; ?></td>
          <td class="small">
            <?php foreach ($r['parcels'] as $p): ?>
              <?= $p['tracking_url'] ? '<a href="' . e($p['tracking_url']) . '" target="_blank" rel="noopener">' . e($p['tracking_number'] ?: 'track') . '</a>' : 'Aangemaakt' ?>
              <?= $p['status'] ? '<span class="muted">· ' . e($p['status']) . '</span>' : '' ?><br>
            <?php endforeach; ?>
          </td>
        </tr>
      <?php endforeach; ?>
      <?php if (!$list): ?><tr><td colspan="8" class="muted">Geen leveringen deze week.</td></tr><?php endif; ?>
      </tbody>
    </table>
  </div>

  <div class="sticky-actions">
    <span class="muted small">Met selectie:</span>
    <button class="btn btn--small" name="action" value="sendcloud" data-confirm="Zendingen aanmaken in Sendcloud voor de geselecteerde (betaalde) leveringen?">Naar Sendcloud</button>
    <button class="btn btn--ghost btn--small" name="action" value="shipped">Markeer als verzonden</button>
    <label style="display:inline-flex;gap:6px;align-items:center;margin:0;text-transform:none;letter-spacing:0;font-family:var(--f-body)"><input type="checkbox" name="mail" value="1" checked> klant mailen</label>
    <span style="flex:1"></span>
    <button class="btn btn--ghost btn--small" name="action" value="assign">Batches toewijzen</button>
    <a class="btn btn--ghost btn--small" href="<?= e($self) ?>&amp;export=csv&amp;alleen=vast">CSV (vast)</a>
    <a class="btn btn--ghost btn--small" href="<?= e($self) ?>&amp;export=csv">CSV (alles)</a>
    <button type="button" class="btn btn--ghost btn--small" onclick="window.print()">Print paklijst</button>
  </div>
</form>
<?php layout_end();
