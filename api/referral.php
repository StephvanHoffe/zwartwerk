<?php
/* Controleert een uitnodigingscode. */
declare(strict_types=1);
require __DIR__ . '/_init.php';

Http::json(['ok' => true, 'valid' => Subscriptions::referralValid((string) ($_GET['code'] ?? ''))]);
