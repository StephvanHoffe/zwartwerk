<?php
/*
 * Cronjob: zet leveringen vast (7 dagen van tevoren), schrijft af en hervat pauzes.
 * Instellen in DirectAdmin → Geavanceerd → Cronjobs, bijvoorbeeld elk uur:
 *   php /home/GEBRUIKER/domains/zwartwerkkoffie.nl/public_html/cron/run.php
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}
require __DIR__ . '/../app/bootstrap.php';

$r = Deliveries::runCron();
echo date('Y-m-d H:i') . ' vastgezet: ' . $r['created'] . ', afgeschreven: ' . $r['charged'] . ', hervat: ' . $r['resumed'] . ', fouten: ' . $r['errors'] . PHP_EOL;
