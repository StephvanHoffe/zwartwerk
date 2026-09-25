<?php
declare(strict_types=1);
require __DIR__ . '/_init.php';
require_admin();

if (is_post() && ($_POST['action'] ?? '') === 'retry') {
    try {
        Deliveries::retryCharge((int) $_POST['delivery_id']);
        flash('Nieuwe afschrijving gestart.');
    } catch (Throwable $e) {
        flash($e->getMessage(), 'bad');
    }
    redirect('betalingen.php' . (isset($_GET['status']) ? '?status=' . urlencode((string) $_GET['status']) : ''));
}

$status = (string) ($_GET['status'] ?? '');
$params = [];
$where = '';
if ($status === 'mislukt') {
    $where = 'WHERE p.status IN ("failed", "expired", "canceled", "charged_back")';
} elseif ($status === 'open') {
    $where = 'WHERE p.status IN ("open", "pending")';
} elseif ($status === 'betaald') {
    $where = 'WHERE p.status = "paid"';
}
$list = rows("SELECT p.*, u.first_name, u.last_name, d.id AS delivery_id, d.status AS dstatus, d.delivery_date
              FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN deliveries d ON d.payment_id = p.id
              $where ORDER BY p.id DESC LIMIT 300", $params);
$months = rows('SELECT DATE_FORMAT(paid_at, "%Y-%m") AS m, SUM(amount_cents) AS total, COUNT(*) AS n FROM payments WHERE status = "paid" GROUP BY m ORDER BY m DESC LIMIT 6');

layout_start('Betalingen', 'betalingen');
?>
<h1>Betalingen</h1>
<div class="cards">
  <?php foreach ($months as $m): ?>
    <div class="card"><h3><?= e(Format::monthName($m['m'])) ?></h3><div class="big"><?= e(money((int) $m['total'])) ?></div><div class="muted"><?= (int) $m['n'] ?> betalingen</div></div>
  <?php endforeach; ?>
  <?php if (!$months): ?><div class="card"><h3>Ontvangen</h3><div class="big">€ 0,00</div></div><?php endif; ?>
</div>
<div class="actions">
  <?php foreach (['' => 'Alles', 'betaald' => 'Betaald', 'open' => 'Open / in behandeling', 'mislukt' => 'Mislukt'] as $k => $v): ?>
    <a class="btn btn--small <?= $status === $k ? '' : 'btn--ghost' ?>" href="betalingen.php<?= $k ? '?status=' . $k : '' ?>"><?= e($v) ?></a>
  <?php endforeach; ?>
</div>
<p class="muted small">Automatische incasso’s staan een paar dagen op ‘in behandeling’ voordat ze betaald zijn. Een klant kan een incasso binnen 8 weken terugboeken; dat zie je als ‘Teruggeboekt’.</p>
<div class="table-wrap">
  <table>
    <thead><tr><th>Datum</th><th>Klant</th><th>Omschrijving</th><th>Bedrag</th><th>Status</th><th>Levering</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($list as $p): ?>
      <tr>
        <td class="nowrap small"><?= e(substr($p['created_at'], 0, 16)) ?></td>
        <td><a href="klant.php?id=<?= (int) $p['user_id'] ?>"><?= e($p['first_name'] . ' ' . $p['last_name']) ?></a></td>
        <td class="small"><?= e($p['description']) ?></td>
        <td class="nowrap"><?= e(money((int) $p['amount_cents'])) ?></td>
        <td><?= status_chip($p['status']) ?></td>
        <td class="small"><?= $p['delivery_id'] ? e(nl_date($p['delivery_date'])) . '<br>' . status_chip($p['dstatus']) : '–' ?></td>
        <td class="nowrap small">
          <?php if ($p['status'] === 'paid'): ?><a href="../api/factuur.php?id=<?= (int) $p['id'] ?>" target="_blank">Factuur</a> · <?php endif; ?>
          <?php if ($p['mollie_id']): ?><a href="https://my.mollie.com/dashboard/payments/<?= e($p['mollie_id']) ?>" target="_blank" rel="noopener">Mollie</a><?php endif; ?>
          <?php if ($p['kind'] === 'recurring' && $p['dstatus'] === 'betaling_mislukt'): ?>
            <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="action" value="retry"><input type="hidden" name="delivery_id" value="<?= (int) $p['delivery_id'] ?>">
              <button class="btn btn--small" data-confirm="Opnieuw proberen af te schrijven?">Opnieuw</button></form>
          <?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$list): ?><tr><td colspan="7" class="muted">Geen betalingen.</td></tr><?php endif; ?>
    </tbody>
  </table>
</div>
<?php layout_end();
