<?php
declare(strict_types=1);
require __DIR__ . '/_init.php';
$me = require_admin();

if (is_post()) {
    $action = (string) ($_POST['action'] ?? '');
    try {
        if ($action === 'cron') {
            $r = Deliveries::runCron();
            flash('Cronjob uitgevoerd: ' . $r['created'] . ' leveringen vastgezet, ' . $r['charged'] . ' afschrijvingen gestart, ' . $r['errors'] . ' fouten.', $r['errors'] ? 'warn' : 'ok');
        } elseif ($action === 'add_admin') {
            $email = strtolower(trim((string) $_POST['email']));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen((string) $_POST['password']) < 10) {
                throw new InvalidArgumentException('Geldig e-mailadres en een wachtwoord van minimaal 10 tekens zijn nodig.');
            }
            q('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)', [$email, trim((string) $_POST['name']) ?: $email, password_hash((string) $_POST['password'], PASSWORD_DEFAULT)]);
            flash('Beheerder toegevoegd.');
        } elseif ($action === 'password') {
            $a = row('SELECT password_hash FROM admins WHERE id = ?', [$me['id']]);
            if (!password_verify((string) $_POST['old'], $a['password_hash'])) {
                throw new InvalidArgumentException('Huidig wachtwoord klopt niet.');
            }
            if (strlen((string) $_POST['new']) < 10) {
                throw new InvalidArgumentException('Kies een wachtwoord van minimaal 10 tekens.');
            }
            q('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash((string) $_POST['new'], PASSWORD_DEFAULT), $me['id']]);
            flash('Wachtwoord gewijzigd.');
        } elseif ($action === 'delete_admin') {
            $aid = (int) $_POST['admin_id'];
            if ($aid === (int) $me['id']) {
                throw new InvalidArgumentException('Je kunt jezelf niet verwijderen.');
            }
            q('DELETE FROM admins WHERE id = ?', [$aid]);
            flash('Beheerder verwijderd.');
        }
    } catch (Throwable $e) {
        flash($e->getMessage(), 'bad');
    }
    redirect('instellingen.php');
}

if (($_GET['export'] ?? '') === 'nieuwsbrief') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="zwartwerk-nieuwsbrief.csv"');
    echo "\xEF\xBB\xBFe-mail;naam;bron;datum\n";
    foreach (rows('SELECT email, "" AS name, "website" AS src, created_at FROM newsletter
                   UNION SELECT email, CONCAT(first_name, " ", last_name), "klant", created_at FROM users WHERE newsletter = 1') as $r) {
        echo implode(';', array_map(fn($v) => '"' . str_replace('"', '""', (string) $v) . '"', $r)) . "\n";
    }
    exit;
}

$checks = [];
try {
    Mollie::ping();
    $checks['Mollie'] = ['ok', Mollie::isTestMode() ? 'Verbonden (testmodus)' : 'Verbonden (live)'];
} catch (Throwable $e) {
    $checks['Mollie'] = ['bad', $e->getMessage()];
}
if (Sendcloud::isConfigured()) {
    try {
        Sendcloud::ping();
        $checks['Sendcloud'] = ['ok', 'Verbonden' . (cfg('sendcloud.shipping_method_id') ? ' · labels worden direct aangemaakt' : ' · zendingen komen klaar te staan in Sendcloud')];
    } catch (Throwable $e) {
        $checks['Sendcloud'] = ['bad', $e->getMessage()];
    }
} else {
    $checks['Sendcloud'] = ['warn', 'Nog niet ingesteld in app/config.php (CSV-export werkt wel)'];
}
$cronLast = setting('cron_last_run');
$checks['Cronjob'] = $cronLast && strtotime($cronLast) > time() - 36 * 3600 ? ['ok', 'Laatst gedraaid: ' . $cronLast] : ['bad', $cronLast ? 'Te lang niet gedraaid (laatst: ' . $cronLast . ')' : 'Nog nooit gedraaid'];
$checks['E-mail'] = cfg('mail.enabled', true) ? ['ok', 'Afzender ' . cfg('mail.from')] : ['warn', 'Uitgeschakeld: mails worden alleen gelogd'];
$checks['HTTPS'] = is_https() ? ['ok', 'Beveiligde verbinding'] : ['warn', 'Zet SSL aan in DirectAdmin (Let’s Encrypt) en gebruik https'];

$admins = rows('SELECT id, email, name, last_login FROM admins ORDER BY id');
$logs = rows('SELECT * FROM app_log ORDER BY id DESC LIMIT 30');
$mails = rows('SELECT recipient, subject, sent, created_at FROM mail_log ORDER BY id DESC LIMIT 20');
$base = rtrim((string) cfg('base_url'), '/');

layout_start('Instellingen', 'instellingen');
?>
<h1>Instellingen</h1>
<div class="grid2">
  <div class="panel">
    <h3>Koppelingen</h3>
    <?php foreach ($checks as $name => [$state, $msg]): ?>
      <p style="margin:0 0 8px"><span class="chip chip--<?= $state ?>"><?= e($name) ?></span> <span class="small"><?= e($msg) ?></span></p>
    <?php endforeach; ?>
    <form method="post" class="actions"><?= csrf_field() ?><input type="hidden" name="action" value="cron"><button class="btn btn--ghost btn--small">Cronjob nu uitvoeren</button></form>
    <p class="small muted">Sleutels en prijzen staan in <code>app/config.php</code> op de server (via DirectAdmin → Bestandsbeheer).</p>
  </div>
  <div class="panel">
    <h3>Adressen om in te stellen</h3>
    <p class="small">Sendcloud-webhook (Instellingen → Integraties → jouw API-integratie → Webhook):<br><code><?= e($base) ?>/api/sendcloud-webhook.php</code></p>
    <p class="small">Mollie-webhook: wordt automatisch meegestuurd, niets instellen.<br><code><?= e($base) ?>/api/mollie-webhook.php</code></p>
    <p class="small">Cronjob (DirectAdmin → Cronjobs, elk uur):<br><code>php <?= e(ZW_ROOT) ?>/cron/run.php</code></p>
    <p class="small"><a href="instellingen.php?export=nieuwsbrief">Nieuwsbrief-adressen exporteren (CSV)</a></p>
  </div>
</div>

<div class="grid2">
  <div class="panel">
    <h3>Beheerders</h3>
    <?php foreach ($admins as $a): ?>
      <p style="margin:0 0 6px"><?= e($a['name']) ?> <span class="muted small">· <?= e($a['email']) ?> · laatst ingelogd <?= e($a['last_login'] ?: 'nooit') ?></span>
        <?php if ((int) $a['id'] !== (int) $me['id']): ?>
          <form method="post" class="inline-form"><?= csrf_field() ?><input type="hidden" name="action" value="delete_admin"><input type="hidden" name="admin_id" value="<?= (int) $a['id'] ?>"><button class="btn btn--danger btn--small" data-confirm="Beheerder verwijderen?">×</button></form>
        <?php endif; ?></p>
    <?php endforeach; ?>
    <form method="post" class="form-grid" style="margin-top:12px"><?= csrf_field() ?><input type="hidden" name="action" value="add_admin">
      <div><label>Naam</label><input type="text" name="name"></div>
      <div><label>E-mail</label><input type="email" name="email" required></div>
      <div><label>Wachtwoord (min. 10 tekens)</label><input type="password" name="password" required autocomplete="new-password"></div>
      <div style="align-self:end"><button class="btn btn--ghost btn--small">Beheerder toevoegen</button></div>
    </form>
  </div>
  <div class="panel">
    <h3>Mijn wachtwoord</h3>
    <form method="post" class="form-grid"><?= csrf_field() ?><input type="hidden" name="action" value="password">
      <div><label>Huidig</label><input type="password" name="old" required autocomplete="current-password"></div>
      <div><label>Nieuw (min. 10 tekens)</label><input type="password" name="new" required autocomplete="new-password"></div>
      <div class="full"><button class="btn btn--small">Wijzigen</button></div>
    </form>
  </div>
</div>

<div class="grid2">
  <div class="panel">
    <h3>Laatst verstuurde e-mails</h3>
    <?php foreach ($mails as $m): ?>
      <p class="small" style="margin:0 0 4px"><?= $m['sent'] ? '✓' : '<span style="color:var(--bad)">✗</span>' ?> <?= e(substr($m['created_at'], 0, 16)) ?> · <?= e($m['recipient']) ?> · <?= e($m['subject']) ?></p>
    <?php endforeach; ?>
    <?php if (!$mails): ?><p class="muted small">Nog geen e-mails.</p><?php endif; ?>
  </div>
  <div class="panel">
    <h3>Logboek</h3>
    <pre class="log"><?php foreach ($logs as $l) {
        echo e(substr($l['created_at'], 0, 16) . ' [' . $l['level'] . '] ' . $l['message']) . "\n";
    } ?><?= $logs ? '' : 'Leeg.' ?></pre>
  </div>
</div>
<?php layout_end();
