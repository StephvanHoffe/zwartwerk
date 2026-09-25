<?php
/* Inloggen, uitloggen, wachtwoord vergeten en wachtwoord opnieuw instellen. */
declare(strict_types=1);
require __DIR__ . '/_init.php';

$in = Http::input();
$action = (string) ($in['action'] ?? '');

switch ($action) {
    case 'login':
        if (too_many_attempts('login')) {
            Http::error('Te veel pogingen. Probeer het over een kwartier opnieuw.', 429);
        }
        $user = row('SELECT id, password_hash FROM users WHERE email = ?', [strtolower(trim((string) ($in['email'] ?? '')))]);
        if (!$user || !password_verify((string) ($in['password'] ?? ''), $user['password_hash'])) {
            record_attempt('login');
            Http::error('Dat e-mailadres en wachtwoord kennen we niet samen. Probeer het nog eens.', 401);
        }
        clear_attempts('login');
        login_customer((int) $user['id']);
        Http::json(Subscriptions::account((int) $user['id']));

    case 'logout':
        start_session('zw_sess');
        $_SESSION = [];
        session_destroy();
        Http::json(['ok' => true]);

    case 'forgot':
        // Altijd hetzelfde antwoord, zodat niet te achterhalen is welke e-mailadressen klant zijn
        if (!too_many_attempts('forgot')) {
            record_attempt('forgot');
            $user = row('SELECT * FROM users WHERE email = ?', [strtolower(trim((string) ($in['email'] ?? '')))]);
            if ($user) {
                $token = bin2hex(random_bytes(24));
                q('UPDATE users SET reset_token_hash = ?, reset_expires = (NOW() + INTERVAL 1 HOUR) WHERE id = ?', [hash('sha256', $token), $user['id']]);
                Mailer::passwordReset($user, $token);
            }
        }
        Http::json(['ok' => true]);

    case 'reset':
        $token = (string) ($in['token'] ?? '');
        $password = (string) ($in['password'] ?? '');
        if (strlen($password) < 6) {
            Http::error('Kies een wachtwoord van minimaal 6 tekens.', 422);
        }
        $user = row('SELECT id FROM users WHERE reset_token_hash = ? AND reset_expires > NOW()', [hash('sha256', $token)]);
        if (!$user) {
            Http::error('Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.', 422);
        }
        q('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires = NULL WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        login_customer((int) $user['id']);
        Http::json(Subscriptions::account((int) $user['id']));
}
Http::error('Onbekende actie');
