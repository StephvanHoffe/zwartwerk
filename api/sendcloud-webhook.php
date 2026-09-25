<?php
/*
 * Sendcloud meldt hier statuswijzigingen van zendingen (track & trace).
 * Instellen in Sendcloud: Instellingen → Integraties → jouw API-integratie → Webhook URL.
 */
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$body = file_get_contents('php://input') ?: '';
if (!Sendcloud::validSignature($body, (string) ($_SERVER['HTTP_SENDCLOUD_SIGNATURE'] ?? ''))) {
    http_response_code(403);
    exit;
}
$payload = json_decode($body, true);
if (is_array($payload) && ($payload['action'] ?? '') === 'parcel_status_changed') {
    try {
        Deliveries::handleSendcloud($payload);
    } catch (Throwable $e) {
        log_msg('error', 'Sendcloud-webhook: ' . $e->getMessage());
        http_response_code(500);
        exit;
    }
}
http_response_code(200);
