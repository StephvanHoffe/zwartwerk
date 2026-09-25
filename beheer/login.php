<?php
declare(strict_types=1);
require __DIR__ . '/_init.php';

$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!hash_equals(csrf_token(), (string) ($_POST['csrf'] ?? ''))) {
        $error = 'Sessie verlopen, probeer het opnieuw.';
    } elseif (too_many_attempts('admin')) {
        $error = 'Te veel pogingen. Probeer het over een kwartier opnieuw.';
    } else {
        $a = row('SELECT * FROM admins WHERE email = ?', [strtolower(trim((string) ($_POST['email'] ?? '')))]);
        if ($a && password_verify((string) ($_POST['password'] ?? ''), $a['password_hash'])) {
            clear_attempts('admin');
            session_regenerate_id(true);
            $_SESSION['admin_id'] = (int) $a['id'];
            q('UPDATE admins SET last_login = NOW() WHERE id = ?', [$a['id']]);
            redirect('index.php');
        }
        record_attempt('admin');
        $error = 'E-mailadres of wachtwoord klopt niet.';
    }
}
if (admin()) {
    redirect('index.php');
}
layout_start('Inloggen');
?>
<div class="login panel">
  <img src="../assets/img/zwartwerk-logo.png" alt="Zwartwerk">
  <h1 style="text-align:center">Beheer</h1>
  <?php if ($error): ?><div class="flash flash--bad"><?= e($error) ?></div><?php endif; ?>
  <form method="post">
    <?= csrf_field() ?>
    <p><label for="email">E-mailadres</label><input id="email" type="email" name="email" required autofocus autocomplete="username"></p>
    <p><label for="password">Wachtwoord</label><input id="password" type="password" name="password" required autocomplete="current-password"></p>
    <button class="btn" type="submit" style="width:100%;justify-content:center">Inloggen</button>
  </form>
</div>
<?php layout_end();
