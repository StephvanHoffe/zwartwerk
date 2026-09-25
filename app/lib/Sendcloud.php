<?php
/*
 * Minimale Sendcloud-client (API v2): zendingen (parcels) aanmaken en ophalen.
 * Documentatie: https://api.sendcloud.dev/docs/sendcloud-public-api/parcels
 */
declare(strict_types=1);

final class Sendcloud
{
    public static function isConfigured(): bool
    {
        return cfg('sendcloud.public_key') !== '' && cfg('sendcloud.secret_key') !== '';
    }

    private static function call(string $method, string $path, ?array $body = null): array
    {
        if (!self::isConfigured()) {
            throw new RuntimeException('Sendcloud-sleutels zijn nog niet ingesteld in app/config.php');
        }
        [$status, $data] = Http::request($method, rtrim((string) cfg('sendcloud.api_url'), '/') . $path, $body, [
            'Authorization' => 'Basic ' . base64_encode(cfg('sendcloud.public_key') . ':' . cfg('sendcloud.secret_key')),
        ]);
        if ($status >= 400) {
            $detail = $data['error']['message'] ?? ($data['raw'] ?? 'onbekende fout');
            throw new RuntimeException('Sendcloud: ' . (is_string($detail) ? $detail : json_encode($detail)) . ' (' . $status . ')');
        }
        return $data;
    }

    /**
     * Maakt één zending aan. Zonder verzendmethode komt de zending in Sendcloud
     * klaar te staan en kies je daar zelf de methode en print je het label.
     */
    public static function createParcel(array $address, string $orderNumber, float $weightKg): array
    {
        $methodId = cfg('sendcloud.shipping_method_id');
        $parcel = [
            'name' => $address['name'],
            'address' => $address['street'],
            'house_number' => $address['house_number'],
            'city' => $address['city'],
            'postal_code' => $address['postcode'],
            'country' => 'NL',
            'email' => $address['email'],
            'telephone' => $address['phone'] ?? '',
            'order_number' => $orderNumber,
            'weight' => number_format($weightKg, 3, '.', ''),
            'request_label' => $methodId ? true : false,
        ];
        if ($methodId) {
            $parcel['shipment'] = ['id' => (int) $methodId];
        }
        $data = self::call('POST', '/parcels', ['parcel' => $parcel]);
        return $data['parcel'] ?? [];
    }

    public static function getParcel(int $id): array
    {
        $data = self::call('GET', '/parcels/' . $id);
        return $data['parcel'] ?? [];
    }

    /** Controleert of de sleutels werken. */
    public static function ping(): array
    {
        return self::call('GET', '/user');
    }

    /** Controleert de handtekening van een Sendcloud-webhook. */
    public static function validSignature(string $body, string $signature): bool
    {
        $secret = (string) cfg('sendcloud.secret_key');
        return $secret !== '' && hash_equals(hash_hmac('sha256', $body, $secret), $signature);
    }
}
