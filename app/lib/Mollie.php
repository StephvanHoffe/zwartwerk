<?php
/*
 * Minimale Mollie-client (API v2) voor het abonnement:
 * klanten, eerste betaling (iDEAL | Wero, geeft machtiging), terugkerende betalingen en mandaten.
 * Documentatie: https://docs.mollie.com/reference/v2/payments-api/create-payment
 */
declare(strict_types=1);

final class Mollie
{
    private static function call(string $method, string $path, ?array $body = null): array
    {
        $key = (string) cfg('mollie.api_key');
        if ($key === '' || str_contains($key, 'xxxx')) {
            throw new RuntimeException('Mollie API-sleutel is nog niet ingesteld in app/config.php');
        }
        [$status, $data] = Http::request($method, rtrim((string) cfg('mollie.api_url'), '/') . $path, $body, [
            'Authorization' => 'Bearer ' . $key,
        ]);
        if ($status >= 400) {
            $detail = $data['detail'] ?? ($data['title'] ?? 'onbekende fout');
            throw new RuntimeException('Mollie: ' . $detail . ' (' . $status . ')');
        }
        return $data;
    }

    public static function isTestMode(): bool
    {
        return str_starts_with((string) cfg('mollie.api_key'), 'test_');
    }

    public static function createCustomer(string $name, string $email): array
    {
        return self::call('POST', '/customers', ['name' => $name, 'email' => $email, 'locale' => 'nl_NL']);
    }

    /** Eerste betaling: klant betaalt met iDEAL | Wero en geeft daarmee een machtiging voor volgende afschrijvingen. */
    public static function createFirstPayment(string $customerId, int $cents, string $description, string $redirectUrl, array $metadata): array
    {
        return self::call('POST', '/payments', [
            'amount' => ['currency' => 'EUR', 'value' => self::amount($cents)],
            'customerId' => $customerId,
            'sequenceType' => 'first',
            'method' => 'ideal',
            'description' => $description,
            'redirectUrl' => $redirectUrl,
            'webhookUrl' => self::webhookUrl(),
            'locale' => 'nl_NL',
            'metadata' => $metadata,
        ]);
    }

    /** Automatische afschrijving op basis van de machtiging. */
    public static function createRecurringPayment(string $customerId, ?string $mandateId, int $cents, string $description, array $metadata): array
    {
        $body = [
            'amount' => ['currency' => 'EUR', 'value' => self::amount($cents)],
            'customerId' => $customerId,
            'sequenceType' => 'recurring',
            'description' => $description,
            'webhookUrl' => self::webhookUrl(),
            'metadata' => $metadata,
        ];
        if ($mandateId) {
            $body['mandateId'] = $mandateId;
        }
        return self::call('POST', '/payments', $body);
    }

    public static function getPayment(string $id): array
    {
        return self::call('GET', '/payments/' . rawurlencode($id));
    }

    public static function listMandates(string $customerId): array
    {
        $data = self::call('GET', '/customers/' . rawurlencode($customerId) . '/mandates');
        return $data['_embedded']['mandates'] ?? [];
    }

    public static function revokeMandate(string $customerId, string $mandateId): void
    {
        self::call('DELETE', '/customers/' . rawurlencode($customerId) . '/mandates/' . rawurlencode($mandateId));
    }

    /** Controleert of de sleutel werkt (voor de instellingenpagina). */
    public static function ping(): array
    {
        return self::call('GET', '/methods?sequenceType=first');
    }

    public static function webhookUrl(): string
    {
        return rtrim((string) cfg('base_url'), '/') . '/api/mollie-webhook.php';
    }

    private static function amount(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }
}
