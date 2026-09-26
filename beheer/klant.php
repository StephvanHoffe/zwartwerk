<?php
declare(strict_types=1);
require __DIR__ . '/_init.php';
require_admin();

$id = (int) ($_GET['id'] ?? $_POST['id'] ?? 0);
$user = row('SELECT * FROM users WHERE id = ?', [$id]);
if (!$user) {
    http_response_code(404);
    layout_start('Niet gevonden', 'klanten');
    echo '<p>Klant niet gevonden. <a href="klanten.php">Terug</a></p>';
    layout_end();
    exit;
}
$self = 'klant.php?id=' . $id;

if (is_post()) {
    $action = (string) ($_POST['action'] ?? '');
    try {
        switch ($action) {
            case 'save_user':
                $email = strtolower(trim((string) $_POST['email']));
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    throw new InvalidArgumentException('Ongeldig e-mailadres.');
                }
                if (row('SELECT id FROM users WHERE email = ? AND id <> ?', [$email, $id])) {
                    throw new InvalidArgumentException('Dit e-mailadres is al in gebruik bij een andere klant.');
                }
                if (!valid_postcode((string) $_POST['postcode'])) {
                    throw new InvalidArgumentException('Ongeldige postcode.');
                }
                q('UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, street = ?, house_number = ?, postcode = ?, city = ?, admin_note = ? WHERE id = ?', [
                    trim((string) $_POST['first_name']), trim((string) $_POST['last_name']), $email, trim((string) $_POST['phone']),
                    trim((string) $_POST['street']), trim((string) $_POST['house_number']), normalize_postcode((string) $_POST['postcode']),
                    trim((string) $_POST['city']), trim((string) $_POST['admin_note']), $id,
                ]);
                flash('Klantgegevens opgeslagen.');
                break;
            case 'plan':
                Subscriptions::action($id, 'update-plan', [
                    'size' => $_POST['size'] ?? '', 'freq' => $_POST['freq'] ?? '', 'roast' => $_POST['roast'] ?? '', 'note' => $_POST['note'] ?? '',
                ]);
                flash('Abonnement bijgewerkt.');
                break;
            case 'next':
                $sub = Subscriptions::forUser($id);
                $from = new DateTimeImmutable((string) $_POST['date']);
                $sub['next_delivery'] = Schedule::upcoming($sub, $from, 1)[0]['date']->format('Y-m-d');
                Subscriptions::save($sub);
                flash('Volgende levering: ' . nl_date($sub['next_delivery'], true) . '.');
                break;
            case 'pause':
                $r = Subscriptions::action($id, 'pause', ['months' => (int) $_POST['months']]);
                flash('Gepauzeerd tot ' . nl_date($r['result']['resume'] ?? null) . '.');
                break;
            case 'skip':
            case 'resume':
                Subscriptions::action($id, $action, []);
                flash($action === 'skip' ? 'Levering overgeslagen.' : 'Abonnement hervat.');
                break;
            case 'cancel':
                Subscriptions::action($id, 'cancel', ['reason' => 'Via beheer: ' . trim((string) ($_POST['reason'] ?? ''))]);
                flash('Abonnement opgezegd. De klant heeft een bevestiging gekregen.');
                break;
            case 'credit':
                $cents = (int) round((float) str_replace(',', '.', (string) $_POST['amount']) * 100);
                q('UPDATE users SET credit_cents = GREATEST(0, credit_cents + ?) WHERE id = ?', [$cents, $id]);
                flash('Tegoed aangepast met ' . money($cents) . '.');
                break;
            case 'batch':
                $did = (int) $_POST['delivery_id'];
                $bid = (int) $_POST['batch_id'];
                q('UPDATE deliveries SET batch_id = ? WHERE id = ? AND user_id = ?', [$bid ?: null, $did, $id]);
                flash('Batch aangepast.');
                break;
            case 'retry':
                Deliveries::retryCharge((int) $_POST['delivery_id']);
                flash('Nieuwe afschrijving gestart.');
                break;
            case 'reset':
                $token = bin2hex(random_bytes(24));
                q('UPDATE users SET reset_token_hash = ?, reset_expires = (NOW() + INTERVAL 1 HOUR) WHERE id = ?', [hash('sha256', $token), $id]);
                Mailer::passwordReset($user, $token);
                flash('De klant heeft een mail gekregen om een nieuw wachtwoord in te stellen.');
                break;
            case 'anonymize':
                $sub = Subscriptions::forUser($id);
                if ($sub && in_array($sub['status'], ['actief', 'gepauzeerd'], true)) {
                    throw new InvalidArgumentException('Zeg eerst het abonnement op.');
                }
                q('UPDATE users SET first_name = "Verwijderde", last_name = "klant", email = ?, phone = "", street = "", house_number = "", postcode = "", city = "",
                   newsletter = 0, admin_note = NULL, password_hash = ?, reset_token_hash = NULL WHERE id = ?',
                    ['verwijderd-' . $id . '@example.invalid', password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), $id]);
                flash('Persoonsgegevens verwijderd. Betalingen blijven bewaard voor de administratie (7 jaar).');
                break;
        }
    } catch (Throwable $e) {
        flash($e->getMessage(), 'bad');
    }
    redirect($self);
}

$sub = Subscriptions::forUser($id);
$deliveries = rows('SELECT d.*, b.code, b.country, p.status AS pstatus FROM deliveries d LEFT JOIN batches b ON b.id = d.batch_id LEFT JOIN payments p ON p.id = d.payment_id
                    WHERE d.user_id = ? ORDER BY d.delivery_date DESC', [$id]);
$payments = rows('SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC', [$id]);
$batchList = rows('SELECT id, code, country, month FROM batches ORDER BY month DESC, code');
$ratings = rows('SELECT r.rating, b.code, b.country FROM ratings r JOIN batches b ON b.id = r.batch_id WHERE r.user_id = ? ORDER BY r.updated_at DESC', [$id]);
$referrer = $user['referred_by'] ? row('SELECT id, first_name, last_name FROM users WHERE id = ?', [$user['referred_by']]) : null;
$upcoming = $sub && in_array($sub['status'], ['actief', 'gepauzeerd'], true) ? Schedule::upcoming($sub, new DateTimeImmutable($sub['next_delivery']), 4) : [];

layout_start($user['first_name'] . ' ' . $user['last_name'], 'klanten');
?>
<p><a href="klanten.php">← Alle klanten</a></p>
<h1><?= e($user['first_name'] . ' ' . $user['last_name']) ?> <?= $sub ? status_chip($sub['status']) : '' ?></h1>
<p class="muted"><?= e($user['email']) ?><?= $user['phone'] ? ' · ' . e($user['phone']) : '' ?> · klant sinds <?= e(nl_date(substr($user['created_at'], 0, 10))) ?>
  · code <?= e($user['referral_code']) ?><?= $referrer ? ' · uitgenodigd door <a href="klant.php?id=' . (int) $referrer['id'] . '">' . e($referrer['first_name'] . ' ' . $referrer['last_name']) . '</a>' : '' ?></p>

<div class="grid2">
  <div class="panel">
    <h3>Abonnement</h3>
    <?php if ($sub): ?>
      <p><strong><?= $sub['size'] === '500' ? '500 gram (2 zakken)' : '250 gram (1 zak)' ?></strong>, <?= $sub['freq'] === '2m' ? '2× per maand' : '1× per maand' ?>, smaak: <?= e($sub['roast']) ?><br>
        <?php if ($sub['status'] === 'opgezegd'): ?>
          Opgezegd op <?= e(nl_date(substr((string) $sub['cancelled_at'], 0, 10))) ?><?= $sub['last_delivery'] ? ', laatste levering ' . e(nl_date($sub['last_delivery'])) : '' ?>.
          <?= $sub['cancel_reason'] ? '<br><span class="muted">Reden: ' . e($sub['cancel_reason']) . '</span>' : '' ?>
        <?php else: ?>
          Volgende levering: <strong><?= e(nl_date($sub['next_delivery'], true)) ?></strong><?= $sub['paused_until'] ? ' (gepauzeerd tot ' . e(nl_date($sub['paused_until'])) . ')' : '' ?>
        <?php endif; ?>
        <br><span class="muted small">Rekening: <?= e($sub['mandate_account'] ?: ($sub['mandate_id'] ? 'machtiging actief' : 'nog geen machtiging')) ?> · tegoed <?= e(money((int) $user['credit_cents'])) ?></span></p>
      <?php if ($sub['note']): ?><p class="small">Notitie klant: “<?= e($sub['note']) ?>”</p><?php endif; ?>
      <?php if ($upcoming): ?>
        <p class="small muted">Komende data: <?= e(implode(', ', array_map(fn($u) => Format::date($u['date'], false) . ($u['new_flavour'] ? '' : ' (zelfde smaak)'), $upcoming))) ?></p>
      <?php endif; ?>

      <form method="post" class="form-grid" style="margin-top:12px">
        <?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="plan">
        <div><label>Hoeveelheid</label><select name="size"><option value="250"<?= $sub['size'] === '250' ? ' selected' : '' ?>>250 gram</option><option value="500"<?= $sub['size'] === '500' ? ' selected' : '' ?>>500 gram</option></select></div>
        <div><label>Ritme</label><select name="freq"><option value="1m"<?= $sub['freq'] === '1m' ? ' selected' : '' ?>>1× per maand</option><option value="2m"<?= $sub['freq'] === '2m' ? ' selected' : '' ?>>2× per maand</option></select></div>
        <div><label>Smaakvoorkeur</label><select name="roast"><?php foreach (Subscriptions::ROASTS as $r): ?><option<?= $sub['roast'] === $r ? ' selected' : '' ?>><?= e($r) ?></option><?php endforeach; ?></select></div>
        <div class="full"><label>Notitie van de klant</label><textarea name="note" style="min-height:60px"><?= e($sub['note']) ?></textarea></div>
        <div class="full"><button class="btn btn--small">Abonnement opslaan</button></div>
      </form>

      <div class="actions">
        <?php if (in_array($sub['status'], ['actief', 'gepauzeerd'], true)): ?>
          <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="skip"><button class="btn btn--ghost btn--small">Levering overslaan</button></form>
          <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="pause">
            <select name="months" style="width:auto;padding:5px"><option value="1">1 maand</option><option value="2">2 maanden</option><option value="3">3 maanden</option></select>
            <button class="btn btn--ghost btn--small">Pauzeren</button></form>
        <?php endif; ?>
        <?php if (in_array($sub['status'], ['gepauzeerd', 'opgezegd'], true)): ?>
          <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="resume"><button class="btn btn--small">Hervatten</button></form>
        <?php endif; ?>
      </div>
      <?php if (in_array($sub['status'], ['actief', 'gepauzeerd'], true)): ?>
        <form method="post" class="actions"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="next">
          <label style="margin:0">Volgende levering vanaf</label><input type="date" name="date" value="<?= e($sub['next_delivery']) ?>" style="width:auto">
          <button class="btn btn--ghost btn--small">Verzetten</button>
        </form>
        <form method="post" class="actions"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="cancel">
          <input type="text" name="reason" placeholder="Reden (optioneel)" style="max-width:240px">
          <button class="btn btn--danger btn--small" data-confirm="Abonnement van deze klant opzeggen? De klant krijgt een bevestiging per mail.">Opzeggen</button>
        </form>
      <?php endif; ?>
    <?php else: ?>
      <p class="muted">Geen abonnement.</p>
    <?php endif; ?>
  </div>

  <div class="panel">
    <h3>Gegevens</h3>
    <form method="post" class="form-grid">
      <?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="save_user">
      <div><label>Voornaam</label><input type="text" name="first_name" value="<?= e($user['first_name']) ?>" required></div>
      <div><label>Achternaam</label><input type="text" name="last_name" value="<?= e($user['last_name']) ?>" required></div>
      <div><label>E-mail</label><input type="email" name="email" value="<?= e($user['email']) ?>" required></div>
      <div><label>Telefoon</label><input type="text" name="phone" value="<?= e($user['phone']) ?>"></div>
      <div><label>Straat</label><input type="text" name="street" value="<?= e($user['street']) ?>" required></div>
      <div><label>Huisnummer</label><input type="text" name="house_number" value="<?= e($user['house_number']) ?>" required></div>
      <div><label>Postcode</label><input type="text" name="postcode" value="<?= e($user['postcode']) ?>" required></div>
      <div><label>Plaats</label><input type="text" name="city" value="<?= e($user['city']) ?>" required></div>
      <div class="full"><label>Interne notitie (ziet de klant niet)</label><textarea name="admin_note"><?= e($user['admin_note']) ?></textarea></div>
      <div class="full"><button class="btn btn--small">Opslaan</button></div>
    </form>
    <div class="actions">
      <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="reset"><button class="btn btn--ghost btn--small">Wachtwoord-resetlink sturen</button></form>
      <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="credit">
        <input type="text" name="amount" placeholder="Tegoed, bijv. 5 of -5" style="width:150px"><button class="btn btn--ghost btn--small">Tegoed aanpassen</button></form>
    </div>
    <form method="post" class="actions"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="anonymize">
      <button class="btn btn--danger btn--small" data-confirm="Alle persoonsgegevens van deze klant verwijderen (AVG-verzoek)? Dit kan niet ongedaan worden gemaakt.">Persoonsgegevens verwijderen</button>
    </form>
  </div>
</div>

<h2>Leveringen</h2>
<div class="table-wrap">
  <table>
    <thead><tr><th>Datum</th><th>Inhoud</th><th>Batch</th><th>Bedrag</th><th>Status</th><th>Betaling</th><th>Sendcloud</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($deliveries as $d): $parcels = $d['sendcloud_parcels'] ? (json_decode($d['sendcloud_parcels'], true) ?: []) : []; ?>
      <tr>
        <td class="nowrap"><?= e(nl_date($d['delivery_date'], true)) ?><div class="muted small">KH-<?= (int) $d['id'] ?></div></td>
        <td><?= (int) $d['bags'] ?> zak(ken)<?= $d['new_flavour'] ? '' : '<div class="muted small">2e van de maand</div>' ?></td>
        <td>
          <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="batch"><input type="hidden" name="delivery_id" value="<?= (int) $d['id'] ?>">
            <select name="batch_id" onchange="this.form.submit()" style="min-width:150px;padding:5px">
              <option value="0">– geen –</option>
              <?php foreach ($batchList as $b): ?><option value="<?= (int) $b['id'] ?>"<?= (int) $d['batch_id'] === (int) $b['id'] ? ' selected' : '' ?>><?= e($b['code'] . ' · ' . $b['country']) ?></option><?php endforeach; ?>
            </select></form>
        </td>
        <td class="nowrap"><?= e(money((int) $d['price_cents'] - (int) $d['discount_cents'])) ?><?= (int) $d['discount_cents'] ? '<div class="muted small">korting ' . e(money((int) $d['discount_cents'])) . '</div>' : '' ?></td>
        <td><?= status_chip($d['status']) ?></td>
        <td><?= $d['pstatus'] ? status_chip($d['pstatus']) : '–' ?></td>
        <td class="small"><?php foreach ($parcels as $p): ?><?= $p['tracking_url'] ? '<a href="' . e($p['tracking_url']) . '" target="_blank" rel="noopener">' . e($p['tracking_number'] ?: 'track') . '</a>' : 'Aangemaakt' ?><br><?php endforeach; ?></td>
        <td><?php if ($d['status'] === 'betaling_mislukt'): ?>
          <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="retry"><input type="hidden" name="delivery_id" value="<?= (int) $d['id'] ?>">
            <button class="btn btn--small" data-confirm="Opnieuw proberen af te schrijven?">Opnieuw afschrijven</button></form>
        <?php endif; ?></td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$deliveries): ?><tr><td colspan="8" class="muted">Nog geen vastgezette leveringen.</td></tr><?php endif; ?>
    </tbody>
  </table>
</div>

<div class="grid2">
  <div>
    <h2>Betalingen</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Datum</th><th>Soort</th><th>Bedrag</th><th>Status</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($payments as $p): ?>
          <tr>
            <td class="nowrap small"><?= e(substr($p['created_at'], 0, 16)) ?></td>
            <td><?= e(['first' => 'Eerste betaling', 'recurring' => 'Incasso', 'verify' => 'Rekening koppelen'][$p['kind']] ?? $p['kind']) ?></td>
            <td><?= e(money((int) $p['amount_cents'])) ?></td>
            <td><?= status_chip($p['status']) ?></td>
            <td class="small nowrap"><?php if ($p['status'] === 'paid'): ?><a href="../api/factuur.php?id=<?= (int) $p['id'] ?>" target="_blank">Factuur</a><?php endif; ?>
              <?php if ($p['mollie_id']): ?> · <a href="https://my.mollie.com/dashboard/payments/<?= e($p['mollie_id']) ?>" target="_blank" rel="noopener">Mollie</a><?php endif; ?></td>
          </tr>
        <?php endforeach; ?>
        <?php if (!$payments): ?><tr><td colspan="5" class="muted">Geen betalingen.</td></tr><?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>
  <div>
    <h2>Beoordelingen</h2>
    <div class="panel">
      <?php foreach ($ratings as $r): ?><p style="margin:0 0 6px"><?= str_repeat('★', (int) $r['rating']) . str_repeat('☆', 5 - (int) $r['rating']) ?> <?= e($r['code'] . ' · ' . $r['country']) ?></p><?php endforeach; ?>
      <?php if (!$ratings): ?><p class="muted">Nog geen beoordelingen.</p><?php endif; ?>
    </div>
  </div>
</div>
<?php layout_end();
