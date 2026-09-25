<?php
/* Aanmelden voor de nieuwsbrief. */
declare(strict_types=1);
require __DIR__ . '/_init.php';

$in = Http::input();
$email = strtolower(trim((string) ($in['email'] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    Http::error('Vul een geldig e-mailadres in.', 422);
}
q('INSERT IGNORE INTO newsletter (email) VALUES (?)', [$email]);
Http::json(['ok' => true]);
