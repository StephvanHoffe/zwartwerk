<?php
/*
 * HTTP-hulpjes: JSON-API-antwoorden en een kleine cURL-client voor Mollie en Sendcloud.
 */
declare(strict_types=1);

final class Http
{
    /** Stuurt een JSON-antwoord en stopt. */
    public static function json($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error(string $message, int $status = 400, array $extra = []): void
    {
        self::json(['ok' => false, 'error' => $message] + $extra, $status);
    }

    /**
     * Leest de JSON-body van een POST vanaf onze eigen website.
     * De eigen header X-Khoffie voorkomt dat andere sites namens een ingelogde klant iets kunnen posten (CSRF).
     */
    public static function input(): array
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            self::error('Methode niet toegestaan', 405);
        }
        if (($_SERVER['HTTP_X_KHOFFIE'] ?? '') !== '1') {
            self::error('Ongeldig verzoek', 400);
        }
        $data = json_decode(file_get_contents('php://input') ?: '', true);
        return is_array($data) ? $data : [];
    }

    /**
     * Verstuurt een API-verzoek. Geeft [statuscode, gedecodeerde body] terug.
     */
    public static function request(string $method, string $url, ?array $body, array $headers): array
    {
        $ch = curl_init($url);
        $h = ['Accept: application/json'];
        foreach ($headers as $k => $v) {
            $h[] = $k . ': ' . $v;
        }
        if ($body !== null) {
            $h[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $h,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        $raw = curl_exec($ch);
        if ($raw === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException('Verbinding mislukt: ' . $err);
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $decoded = json_decode($raw, true);
        return [$status, is_array($decoded) ? $decoded : ['raw' => $raw]];
    }
}
