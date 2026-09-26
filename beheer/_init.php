<?php
/* Gedeeld door alle beheerpagina's: inlogcontrole, beveiliging (CSRF) en de opmaak. */
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
start_session('zw_admin');

set_exception_handler(function (Throwable $e) {
    log_msg('error', 'Beheer: ' . $e->getMessage(), ['file' => $e->getFile() . ':' . $e->getLine()]);
    http_response_code(500);
    echo '<p style="font-family:sans-serif">Er ging iets mis: ' . e(cfg('debug') ? $e->getMessage() : 'bekijk het logboek op de instellingenpagina.') . '</p>';
});

function admin(): ?array
{
    if (empty($_SESSION['admin_id'])) {
        return null;
    }
    return row('SELECT id, email, name FROM admins WHERE id = ?', [(int) $_SESSION['admin_id']]);
}

function require_admin(): array
{
    $a = admin();
    if (!$a) {
        header('Location: login.php');
        exit;
    }
    return $a;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}
function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}
/** Controleert een POST: juiste CSRF-token verplicht. */
function is_post(): bool
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        return false;
    }
    if (!hash_equals(csrf_token(), (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('Sessie verlopen. Ga terug en probeer het opnieuw.');
    }
    return true;
}

function flash(?string $msg = null, string $type = 'ok'): array
{
    if ($msg !== null) {
        $_SESSION['flash'][] = [$type, $msg];
        return [];
    }
    $f = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $f;
}

function redirect(string $url): void
{
    header('Location: ' . $url);
    exit;
}

function status_chip(string $status): string
{
    $map = [
        'actief' => 'ok', 'afgerond' => 'ok', 'betaald' => 'ok', 'paid' => 'ok', 'verzonden' => 'ok',
        'gepauzeerd' => 'warn', 'wacht_op_betaling' => 'warn', 'open' => 'warn', 'pending' => 'warn', 'voorlopig' => 'muted', 'nieuw' => 'warn',
        'opgezegd' => 'muted', 'geannuleerd' => 'muted', 'canceled' => 'muted', 'expired' => 'muted',
        'betaling_mislukt' => 'bad', 'failed' => 'bad', 'charged_back' => 'bad',
    ];
    $labels = [
        'nieuw' => 'Nog niet betaald', 'paid' => 'Betaald', 'open' => 'Open', 'pending' => 'In behandeling', 'failed' => 'Mislukt',
        'canceled' => 'Geannuleerd', 'expired' => 'Verlopen', 'charged_back' => 'Teruggeboekt',
    ];
    $label = $labels[$status] ?? Deliveries::statusLabel($status);
    return '<span class="chip chip--' . ($map[$status] ?? 'muted') . '">' . e(ucfirst($label)) . '</span>';
}

function nl_date(?string $ymd, bool $weekday = false): string
{
    return $ymd ? Format::date(new DateTimeImmutable($ymd), $weekday) . ' ' . substr($ymd, 0, 4) : '–';
}

function layout_start(string $title, string $active = ''): void
{
    $a = admin();
    $nav = [
        'index' => ['Overzicht', 'index.php'],
        'week' => ['Verzendlijst per week', 'week.php'],
        'klanten' => ['Klanten', 'klanten.php'],
        'batches' => ['Smaken (batches)', 'batches.php'],
        'betalingen' => ['Betalingen', 'betalingen.php'],
        'instellingen' => ['Instellingen', 'instellingen.php'],
    ];
    $test = str_starts_with((string) cfg('mollie.api_key'), 'test_');
    echo '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>' . e($title) . ' — Khoffie beheer</title><meta name="robots" content="noindex">';
    echo '<link rel="icon" type="image/png" href="../assets/img/favicon.png">';
    echo '<link rel="stylesheet" href="../assets/css/fonts.css"><link rel="stylesheet" href="beheer.css"></head><body>';
    if ($a) {
        echo '<header class="top"><a class="brand" href="index.php"><img src="../assets/img/khoffie-logo-licht.svg" alt="Khoffie"><span>Beheer</span></a>';
        echo '<button class="menu-btn" onclick="document.body.classList.toggle(\'nav-open\')" aria-label="Menu">☰</button>';
        echo '<nav>';
        foreach ($nav as $key => [$label, $href]) {
            echo '<a href="' . $href . '"' . ($key === $active ? ' class="active"' : '') . '>' . e($label) . '</a>';
        }
        echo '<a href="../" target="_blank">Website ↗</a><a href="logout.php">Uitloggen (' . e($a['name']) . ')</a></nav></header>';
        if ($test) {
            echo '<div class="testbar">Testmodus: Mollie gebruikt een test-sleutel. Er wordt geen echt geld afgeschreven.</div>';
        }
    }
    echo '<main class="wrap">';
    foreach (flash() as [$type, $msg]) {
        echo '<div class="flash flash--' . e($type) . '">' . e($msg) . '</div>';
    }
}

function layout_end(): void
{
    echo '</main><script>
document.querySelectorAll("[data-check-all]").forEach(function (box) {
  box.addEventListener("change", function () {
    document.querySelectorAll(box.getAttribute("data-check-all")).forEach(function (c) { if (!c.disabled) c.checked = box.checked; });
  });
});
document.querySelectorAll("[data-confirm]").forEach(function (el) {
  el.addEventListener("click", function (e) { if (!confirm(el.getAttribute("data-confirm"))) e.preventDefault(); });
});
</script></body></html>';
}
