<?php
/* Nieuw abonnement: maakt het account aan en geeft de Mollie-betaalpagina terug. */
declare(strict_types=1);
require __DIR__ . '/_init.php';

$in = Http::input();
if (too_many_attempts('signup')) {
    Http::error('Te veel pogingen. Probeer het over een kwartier opnieuw.', 429);
}
record_attempt('signup');
$checkout = Subscriptions::register($in);
$user = row('SELECT id FROM users WHERE email = ?', [strtolower(trim((string) $in['email']))]);
login_customer((int) $user['id']);
Http::json(['ok' => true, 'checkoutUrl' => $checkout]);
