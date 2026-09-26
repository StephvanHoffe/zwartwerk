<?php
declare(strict_types=1);
require __DIR__ . '/_init.php';
require_admin();

$search = trim((string) ($_GET['q'] ?? ''));
$status = (string) ($_GET['status'] ?? '');
$where = [];
$params = [];
if ($search !== '') {
    $where[] = '(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.postcode LIKE ? OR u.city LIKE ? OR CONCAT(u.first_name, " ", u.last_name) LIKE ?)';
    $like = '%' . $search . '%';
    array_push($params, $like, $like, $like, $like, $like, $like);
}
if (in_array($status, ['nieuw', 'actief', 'gepauzeerd', 'opgezegd'], true)) {
    $where[] = 's.status = ?';
    $params[] = $status;
}
$sql = 'SELECT u.*, s.status, s.size, s.freq, s.next_delivery FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id'
    . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY u.created_at DESC LIMIT 500';
$list = rows($sql, $params);

if (($_GET['export'] ?? '') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="khoffie-klanten.csv"');
    $fh = fopen('php://output', 'w');
    fwrite($fh, "\xEF\xBB\xBF");
    fputcsv($fh, ['Voornaam', 'Achternaam', 'E-mail', 'Telefoon', 'Straat', 'Huisnummer', 'Postcode', 'Plaats', 'Abonnement', 'Ritme', 'Status', 'Volgende levering', 'Nieuwsbrief', 'Klant sinds'], ';', '"', '');
    foreach ($list as $u) {
        fputcsv($fh, [$u['first_name'], $u['last_name'], $u['email'], $u['phone'], $u['street'], $u['house_number'], $u['postcode'], $u['city'],
            $u['size'] ? $u['size'] . ' g' : '', $u['freq'] === '2m' ? '2x per maand' : '1x per maand', $u['status'], $u['next_delivery'], $u['newsletter'] ? 'ja' : 'nee', substr($u['created_at'], 0, 10)], ';', '"', '');
    }
    exit;
}

layout_start('Klanten', 'klanten');
?>
<h1>Klanten</h1>
<form class="actions" method="get">
  <input type="search" name="q" value="<?= e($search) ?>" placeholder="Zoek op naam, e-mail, postcode of plaats" style="max-width:340px">
  <select name="status" style="max-width:200px">
    <option value="">Alle statussen</option>
    <?php foreach (['actief' => 'Actief', 'gepauzeerd' => 'Gepauzeerd', 'opgezegd' => 'Opgezegd', 'nieuw' => 'Nog niet betaald'] as $k => $v): ?>
      <option value="<?= $k ?>"<?= $status === $k ? ' selected' : '' ?>><?= $v ?></option>
    <?php endforeach; ?>
  </select>
  <button class="btn btn--small">Zoeken</button>
  <a class="btn btn--ghost btn--small" href="?<?= e(http_build_query(['q' => $search, 'status' => $status, 'export' => 'csv'])) ?>">Exporteer CSV</a>
</form>
<p class="muted small"><?= count($list) ?> klant(en)</p>
<div class="table-wrap">
  <table>
    <thead><tr><th>Naam</th><th>E-mail</th><th>Plaats</th><th>Abonnement</th><th>Status</th><th>Volgende levering</th><th>Klant sinds</th></tr></thead>
    <tbody>
    <?php foreach ($list as $u): ?>
      <tr>
        <td><a href="klant.php?id=<?= (int) $u['id'] ?>"><?= e($u['first_name'] . ' ' . $u['last_name']) ?></a></td>
        <td class="small"><?= e($u['email']) ?></td>
        <td><?= e($u['city']) ?></td>
        <td><?= $u['size'] ? ($u['size'] === '500' ? '500 g' : '250 g') . ', ' . ($u['freq'] === '2m' ? '2×' : '1×') . ' p/m' : '–' ?></td>
        <td><?= $u['status'] ? status_chip($u['status']) : '' ?></td>
        <td class="nowrap"><?= $u['status'] === 'opgezegd' ? '–' : e(nl_date($u['next_delivery'])) ?></td>
        <td class="nowrap small"><?= e(nl_date(substr($u['created_at'], 0, 10))) ?></td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$list): ?><tr><td colspan="7" class="muted">Geen klanten gevonden.</td></tr><?php endif; ?>
    </tbody>
  </table>
</div>
<?php layout_end();
