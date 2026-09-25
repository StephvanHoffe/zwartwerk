<?php
/*
 * Alternatief voor hosts waar een cronjob alleen een URL kan aanroepen:
 *   https://www.zwartwerkkoffie.nl/api/cron.php?token=JOUW_CRON_TOKEN
 */
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$token = (string) cfg('cron_token');
if (strlen($token) < 20 || str_starts_with($token, 'vervang') || !hash_equals($token, (string) ($_GET['token'] ?? ''))) {
    http_response_code(403);
    exit('Geen toegang');
}
header('Content-Type: text/plain; charset=utf-8');
$r = Deliveries::runCron();
echo 'ok ' . json_encode($r);
