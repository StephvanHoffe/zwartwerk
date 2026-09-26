<?php
/* Nieuw abonnement: maakt het account aan en geeft de Mollie-betaalpagina terug. */
declare(strict_types=1);
require __DIR__ . '/_init.php';

$in = Http::input();
if (too_many_attempts('signup')) {
    Http::error('Te veel pogingen. Probeer het over een kwartier opnieuw.', 429);
}
record_attempt('signup');
// Ingelogde klant (bijv. een abonnee die een losse zak bestelt): dat account gebruiken
$current = customer_id();
if ($current && !row('SELECT id FROM users WHERE id = ?', [$current])) {
    $current = null;
}
$checkout = Subscriptions::register($in, $current);
$user = $current ? ['id' => $current] : row('SELECT id FROM users WHERE email = ?', [strtolower(trim((string) $in['email']))]);
login_customer((int) $user['id']);
Http::json(['ok' => true, 'checkoutUrl' => $checkout]);
