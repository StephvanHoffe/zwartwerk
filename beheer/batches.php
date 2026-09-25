<?php
/*
 * Smaken van de maand (batches). Elke maand minimaal één actieve batch.
 * Heb je meer batches in een maand, dan krijgt elke klant er een die hij nog niet had.
 */
declare(strict_types=1);
require __DIR__ . '/_init.php';
require_admin();

if (is_post()) {
    $action = (string) ($_POST['action'] ?? '');
    try {
        if ($action === 'save') {
            $bid = (int) ($_POST['batch_id'] ?? 0);
            $data = [
                'code' => strtoupper(trim((string) $_POST['code'])),
                'month' => (string) $_POST['month'],
                'country' => trim((string) $_POST['country']),
                'region' => trim((string) $_POST['region']),
                'farm' => trim((string) $_POST['farm']),
                'process' => trim((string) $_POST['process']),
                'notes' => trim((string) $_POST['notes']),
                'roast' => max(1, min(5, (int) $_POST['roast'])),
                'roast_date' => ($_POST['roast_date'] ?? '') ?: null,
                'story' => trim((string) $_POST['story']),
                'active' => !empty($_POST['active']) ? 1 : 0,
            ];
            if ($data['code'] === '' || $data['country'] === '' || !preg_match('/^\d{4}-\d{2}$/', $data['month'])) {
                throw new InvalidArgumentException('Batchnummer, maand en land zijn verplicht.');
            }
            if (row('SELECT id FROM batches WHERE code = ? AND id <> ?', [$data['code'], $bid])) {
                throw new InvalidArgumentException('Dit batchnummer bestaat al.');
            }
            if ($bid) {
                q('UPDATE batches SET code=?, month=?, country=?, region=?, farm=?, process=?, notes=?, roast=?, roast_date=?, story=?, active=? WHERE id=?', [...array_values($data), $bid]);
                flash('Batch ' . $data['code'] . ' opgeslagen.');
            } else {
                q('INSERT INTO batches (code, month, country, region, farm, process, notes, roast, roast_date, story, active) VALUES (?,?,?,?,?,?,?,?,?,?,?)', array_values($data));
                flash('Batch ' . $data['code'] . ' toegevoegd.');
            }
            $n = Deliveries::assignMissingBatches();
            if ($n) {
                flash("$n levering(en) zonder batch hebben deze nu gekregen.");
            }
            redirect('batches.php');
        }
        if ($action === 'assign') {
            $n = Deliveries::assignMissingBatches();
            flash($n ? "$n levering(en) hebben een batch gekregen." : 'Geen leveringen zonder batch gevonden (of geen passende batch voor die maand).', $n ? 'ok' : 'warn');
            redirect('batches.php');
        }
        if ($action === 'delete') {
            $bid = (int) $_POST['batch_id'];
            if (row('SELECT id FROM deliveries WHERE batch_id = ? LIMIT 1', [$bid])) {
                throw new InvalidArgumentException('Deze batch is al aan leveringen gekoppeld. Zet hem op inactief in plaats van verwijderen.');
            }
            q('DELETE FROM batches WHERE id = ?', [$bid]);
            flash('Batch verwijderd.');
            redirect('batches.php');
        }
    } catch (Throwable $e) {
        flash($e->getMessage(), 'bad');
        redirect('batches.php' . (!empty($_POST['batch_id']) ? '?edit=' . (int) $_POST['batch_id'] : ''));
    }
}

$edit = isset($_GET['edit']) ? row('SELECT * FROM batches WHERE id = ?', [(int) $_GET['edit']]) : null;
$newMonth = preg_match('/^\d{4}-\d{2}$/', (string) ($_GET['new'] ?? '')) ? $_GET['new'] : today()->modify('first day of next month')->format('Y-m');
$suggest = 'ZW-' . substr(str_replace('-', '', $newMonth), 2) . '-01';
$b = $edit ?: ['id' => 0, 'code' => $suggest, 'month' => $newMonth, 'country' => '', 'region' => '', 'farm' => '', 'process' => 'Washed', 'notes' => '', 'roast' => 3, 'roast_date' => '', 'story' => '', 'active' => 1];

$list = rows('SELECT b.*, (SELECT COUNT(*) FROM deliveries d WHERE d.batch_id = b.id) AS deliveries,
                     (SELECT SUM(d.bags) FROM deliveries d WHERE d.batch_id = b.id) AS bags,
                     (SELECT ROUND(AVG(r.rating), 1) FROM ratings r WHERE r.batch_id = b.id) AS avg_rating,
                     (SELECT COUNT(*) FROM ratings r WHERE r.batch_id = b.id) AS n_ratings
              FROM batches b ORDER BY b.month DESC, b.code');
$roastLabels = [1 => 'Light', 2 => 'Medium light', 3 => 'Medium', 4 => 'Medium dark', 5 => 'Dark'];

layout_start('Smaken', 'batches');
?>
<h1>Smaken van de maand</h1>
<p class="muted">Leg per maand de batch vast die je brandt. Leveringen krijgen automatisch de batch van hun maand; klanten zien herkomst, smaaknotities en brandprofiel in hun bonenpaspoort.</p>

<div class="grid2">
  <form method="post" class="panel">
    <?= csrf_field() ?><input type="hidden" name="action" value="save"><input type="hidden" name="batch_id" value="<?= (int) $b['id'] ?>">
    <h3><?= $edit ? 'Batch bewerken' : 'Nieuwe batch' ?></h3>
    <div class="form-grid">
      <div><label>Batchnummer</label><input type="text" name="code" value="<?= e($b['code']) ?>" required></div>
      <div><label>Smaak van de maand</label><input type="text" name="month" value="<?= e($b['month']) ?>" placeholder="2026-10" pattern="\d{4}-\d{2}" required></div>
      <div><label>Land</label><input type="text" name="country" value="<?= e($b['country']) ?>" placeholder="Ethiopië" required></div>
      <div><label>Regio</label><input type="text" name="region" value="<?= e($b['region']) ?>" placeholder="Guji"></div>
      <div><label>Boer / coöperatie</label><input type="text" name="farm" value="<?= e($b['farm']) ?>"></div>
      <div><label>Verwerking</label><input type="text" name="process" value="<?= e($b['process']) ?>" placeholder="Washed, Natural, Honey"></div>
      <div class="full"><label>Smaaknotities (komma’s ertussen)</label><input type="text" name="notes" value="<?= e($b['notes']) ?>" placeholder="bosbes, jasmijn, melkchocolade"></div>
      <div><label>Brandprofiel</label><select name="roast"><?php foreach ($roastLabels as $k => $v): ?><option value="<?= $k ?>"<?= (int) $b['roast'] === $k ? ' selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select></div>
      <div><label>Branddatum (optioneel)</label><input type="date" name="roast_date" value="<?= e($b['roast_date']) ?>"></div>
      <div class="full"><label>Verhaal (optioneel, voor jezelf of de nieuwsbrief)</label><textarea name="story"><?= e($b['story']) ?></textarea></div>
      <div class="full"><label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-family:var(--f-body);font-size:.95rem"><input type="checkbox" name="active" value="1"<?= $b['active'] ? ' checked' : '' ?>> Actief (wordt toegewezen aan leveringen)</label></div>
    </div>
    <div class="actions"><button class="btn"><?= $edit ? 'Opslaan' : 'Toevoegen' ?></button><?php if ($edit): ?><a class="btn btn--ghost" href="batches.php">Annuleren</a><?php endif; ?></div>
  </form>

  <div class="panel">
    <h3>Zo werkt het</h3>
    <ul class="small" style="padding-left:18px;margin:0">
      <li>Leveringen worden 7 dagen van tevoren vastgezet en krijgen dan de actieve batch van hun maand.</li>
      <li>Bij 2× per maand krijgt de tweede levering automatisch dezelfde batch als de eerste.</li>
      <li>Meerdere batches in één maand? Iedere klant krijgt er een die hij nog niet eerder had.</li>
      <li>Batch te laat toegevoegd? Klik op ‘Batches toewijzen’. Per levering aanpassen kan op de klantpagina.</li>
    </ul>
    <form method="post" class="actions"><?= csrf_field() ?><input type="hidden" name="action" value="assign"><button class="btn btn--ghost btn--small">Batches toewijzen</button></form>
  </div>
</div>

<h2>Alle batches</h2>
<div class="table-wrap">
  <table>
    <thead><tr><th>Maand</th><th>Batch</th><th>Herkomst</th><th>Smaak</th><th>Profiel</th><th>Geleverd</th><th>Score</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($list as $r): ?>
      <tr>
        <td class="nowrap"><?= e(Format::monthName($r['month'])) ?></td>
        <td><?= e($r['code']) ?> <?= $r['active'] ? '' : '<span class="chip chip--muted">inactief</span>' ?></td>
        <td><?= e($r['country']) ?><div class="muted small"><?= e(trim($r['region'] . ' · ' . $r['farm'], ' ·')) ?></div></td>
        <td class="small"><?= e($r['notes']) ?><div class="muted"><?= e($r['process']) ?></div></td>
        <td class="small"><?= e($roastLabels[(int) $r['roast']] ?? '') ?></td>
        <td class="small"><?= (int) $r['deliveries'] ?> lev. · <?= (int) $r['bags'] ?> zakken</td>
        <td class="small"><?= $r['avg_rating'] ? e($r['avg_rating']) . ' ★ (' . (int) $r['n_ratings'] . ')' : '–' ?></td>
        <td class="nowrap">
          <a class="btn btn--ghost btn--small" href="batches.php?edit=<?= (int) $r['id'] ?>">Bewerken</a>
          <?php if (!(int) $r['deliveries']): ?>
            <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="batch_id" value="<?= (int) $r['id'] ?>">
              <button class="btn btn--danger btn--small" data-confirm="Batch verwijderen?">×</button></form>
          <?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$list): ?><tr><td colspan="8" class="muted">Nog geen batches. Voeg hierboven de smaak van de maand toe.</td></tr><?php endif; ?>
    </tbody>
  </table>
</div>
<?php layout_end();
