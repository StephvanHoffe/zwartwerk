<?php
/*
 * Zwartwerk — gedeelde basis voor API, beheer en cron.
 */
declare(strict_types=1);

date_default_timezone_set('Europe/Amsterdam');

define('ZW_ROOT', dirname(__DIR__));
define('ZW_APP', __DIR__);

if (!is_file(ZW_APP . '/config.php')) {
    http_response_code(500);
    exit('Configuratie ontbreekt: kopieer app/config.example.php naar app/config.php en vul die in. Zie INSTALLATIE.md.');
}

$GLOBALS['ZW_CONFIG'] = require ZW_APP . '/config.php';

if (!empty($GLOBALS['ZW_CONFIG']['debug'])) {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
}

require_once ZW_APP . '/lib/Schedule.php';
require_once ZW_APP . '/lib/Http.php';
require_once ZW_APP . '/lib/Mollie.php';
require_once ZW_APP . '/lib/Sendcloud.php';
require_once ZW_APP . '/lib/Mailer.php';
require_once ZW_APP . '/lib/Subscriptions.php';
require_once ZW_APP . '/lib/Deliveries.php';

/** Instelling ophalen met puntnotatie, bijv. cfg('mollie.api_key'). */
function cfg(string $key, $default = null)
{
    $value = $GLOBALS['ZW_CONFIG'];
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $default;
        }
        $value = $value[$part];
    }
    return $value;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', cfg('db.host'), cfg('db.name'));
        $pdo = new PDO($dsn, cfg('db.user'), cfg('db.pass'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '" . (new DateTime())->format('P') . "'");
    }
    return $pdo;
}

/** Korte helpers voor queries. */
function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}
function row(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}
function rows(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function today(): DateTimeImmutable
{
    // ZW_TODAY maakt testen met een andere datum mogelijk (alleen in debug)
    if (cfg('debug') && getenv('ZW_TODAY')) {
        return new DateTimeImmutable(getenv('ZW_TODAY'));
    }
    return new DateTimeImmutable('today');
}

function log_msg(string $level, string $message, array $context = []): void
{
    try {
        q('INSERT INTO app_log (level, message, context) VALUES (?, ?, ?)', [
            $level, mb_substr($message, 0, 500), $context ? json_encode($context, JSON_UNESCAPED_UNICODE) : null,
        ]);
    } catch (Throwable $e) {
        error_log('[zwartwerk] ' . $message);
    }
}

function setting(string $name, ?string $value = null): ?string
{
    if ($value !== null) {
        q('INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [$name, $value]);
        return $value;
    }
    $r = row('SELECT value FROM settings WHERE name = ?', [$name]);
    return $r['value'] ?? null;
}

function e($s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

function money(int $cents): string
{
    return ($cents < 0 ? '− ' : '') . '€ ' . number_format(abs($cents) / 100, 2, ',', '.');
}

function client_ip(): string
{
    return substr($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0', 0, 45);
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function start_session(string $name): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name($name);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** Eenvoudige bescherming tegen raden van wachtwoorden: max. 8 pogingen per 15 minuten per IP. */
function too_many_attempts(string $kind): bool
{
    q('DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 1 DAY)');
    $n = row('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND kind = ? AND created_at > (NOW() - INTERVAL 15 MINUTE)', [client_ip(), $kind]);
    return (int) $n['n'] >= 8;
}
function record_attempt(string $kind): void
{
    q('INSERT INTO login_attempts (ip, kind) VALUES (?, ?)', [client_ip(), $kind]);
}
function clear_attempts(string $kind): void
{
    q('DELETE FROM login_attempts WHERE ip = ? AND kind = ?', [client_ip(), $kind]);
}

function valid_postcode(string $pc): bool
{
    return (bool) preg_match('/^[1-9][0-9]{3}\s?[a-zA-Z]{2}$/', trim($pc));
}
function normalize_postcode(string $pc): string
{
    $pc = strtoupper(preg_replace('/\s+/', '', trim($pc)));
    return substr($pc, 0, 4) . ' ' . substr($pc, 4);
}
