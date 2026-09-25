<?php
/*
 * Eenmalige installatie: maakt de databasetabellen aan en je eerste beheerdersaccount.
 * Werkt alleen zolang er nog geen beheerder is. Verwijder dit bestand daarna gerust.
 */
declare(strict_types=1);

$checks = [
    'PHP 8.1 of nieuwer' => version_compare(PHP_VERSION, '8.1.0', '>='),
    'PDO MySQL' => extension_loaded('pdo_mysql'),
    'cURL' => extension_loaded('curl'),
    'app/config.php aanwezig' => is_file(__DIR__ . '/app/config.php'),
];
$error = '';
$done = false;
$locked = false;

if (!in_array(false, $checks, true)) {
    try {
        require __DIR__ . '/app/bootstrap.php';
        $sql = preg_replace('/--[^\n]*/', '', (string) file_get_contents(__DIR__ . '/database/schema.sql'));
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
            db()->exec($stmt);
        }
        $checks['Database-verbinding'] = true;
        $locked = (int) row('SELECT COUNT(*) AS n FROM admins')['n'] > 0;
        if (!$locked && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
            $email = strtolower(trim((string) ($_POST['email'] ?? '')));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $error = 'Vul een geldig e-mailadres in.';
            } elseif (strlen((string) ($_POST['password'] ?? '')) < 10) {
                $error = 'Kies een wachtwoord van minimaal 10 tekens.';
            } else {
                q('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)', [$email, trim((string) ($_POST['name'] ?? '')) ?: 'Beheerder', password_hash((string) $_POST['password'], PASSWORD_DEFAULT)]);
                $done = true;
                $locked = true;
            }
        }
    } catch (Throwable $e) {
        $checks['Database-verbinding'] = false;
        $error = 'Database: ' . $e->getMessage();
    }
}
function h($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
?><!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Installatie — Zwartwerk</title>
<link rel="stylesheet" href="assets/css/fonts.css"><link rel="stylesheet" href="beheer/beheer.css"></head>
<body><main class="wrap" style="max-width:640px">
<img src="assets/img/zwartwerk-logo.png" alt="Zwartwerk" style="width:260px;margin:30px auto;display:block">
<h1>Installatie</h1>
<div class="panel">
  <h3>Controle</h3>
  <?php foreach ($checks as $name => $ok): ?>
    <p style="margin:0 0 6px"><span class="chip chip--<?= $ok ? 'ok' : 'bad' ?>"><?= $ok ? 'OK' : 'Ontbreekt' ?></span> <?= h($name) ?></p>
  <?php endforeach; ?>
  <?php if (!$checks['app/config.php aanwezig']): ?><p class="small">Kopieer <code>app/config.example.php</code> naar <code>app/config.php</code> en vul je gegevens in. Zie INSTALLATIE.md.</p><?php endif; ?>
</div>
<?php if ($error): ?><div class="flash flash--bad"><?= h($error) ?></div><?php endif; ?>
<?php if ($done): ?>
  <div class="flash flash--ok">Klaar! Je beheerdersaccount is aangemaakt. <a href="beheer/">Ga naar het beheer</a>. Je kunt install.php nu verwijderen.</div>
<?php elseif ($locked): ?>
  <div class="flash flash--warn">De installatie is al afgerond. <a href="beheer/">Naar het beheer</a>. Je kunt install.php verwijderen.</div>
<?php elseif (!in_array(false, $checks, true)): ?>
  <form method="post" class="panel">
    <h3>Je beheerdersaccount</h3>
    <div class="form-grid">
      <div><label>Naam</label><input type="text" name="name" required></div>
      <div><label>E-mailadres</label><input type="email" name="email" required></div>
      <div class="full"><label>Wachtwoord (min. 10 tekens)</label><input type="password" name="password" required minlength="10" autocomplete="new-password"></div>
    </div>
    <div class="actions"><button class="btn">Installeren</button></div>
  </form>
<?php endif; ?>
</main></body></html>
