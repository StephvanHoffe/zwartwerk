<?php
/* Gedeeld door alle API-bestanden. */
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

set_exception_handler(function (Throwable $e) {
    if ($e instanceof InvalidArgumentException) {
        Http::error($e->getMessage(), 422);
    }
    log_msg('error', 'API-fout: ' . $e->getMessage(), ['file' => $e->getFile() . ':' . $e->getLine()]);
    Http::error(cfg('debug') ? $e->getMessage() : 'Er ging iets mis. Probeer het later opnieuw of mail ons.', 500);
});

function customer_id(): ?int
{
    start_session('zw_sess');
    return isset($_SESSION['uid']) ? (int) $_SESSION['uid'] : null;
}

function require_customer(): int
{
    $id = customer_id();
    if (!$id || !row('SELECT id FROM users WHERE id = ?', [$id])) {
        Http::error('Niet ingelogd', 401);
    }
    return $id;
}

function login_customer(int $id): void
{
    start_session('zw_sess');
    session_regenerate_id(true);
    $_SESSION['uid'] = $id;
}
