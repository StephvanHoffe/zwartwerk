<?php
/*
 * Mollie roept deze URL aan bij elke statuswijziging van een betaling.
 * We vertrouwen de inhoud niet, maar halen de betaling zelf op bij Mollie.
 */
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$id = (string) ($_POST['id'] ?? '');
if (!preg_match('/^tr_[A-Za-z0-9]+$/', $id)) {
    http_response_code(200);
    exit;
}
try {
    Deliveries::handleMollie($id);
    http_response_code(200);
} catch (Throwable $e) {
    log_msg('error', 'Mollie-webhook: ' . $e->getMessage(), ['id' => $id]);
    http_response_code(500); // Mollie probeert het later opnieuw
}
