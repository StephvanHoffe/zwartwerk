<?php
/*
 * Abonnementen: aanmaken, eerste betaling, en alles wat een klant in zijn account kan doen.
 * De regels (7 dagen, maandperiodes, dinsdag) zijn gelijk aan die in assets/js/main.js.
 */
declare(strict_types=1);

final class Subscriptions
{
    public const SIZES = ['250', '500'];
    public const FREQS = ['1m', '2m'];
    public const ROASTS = ['verras', 'licht', 'medium-licht', 'medium', 'medium-donker', 'donker'];

    /* ------------------------------------------------------------------ laden & opslaan */

    public static function forUser(int $userId): ?array
    {
        $s = row('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$userId]);
        return $s ? self::decode($s) : null;
    }

    public static function find(int $id): ?array
    {
        $s = row('SELECT * FROM subscriptions WHERE id = ?', [$id]);
        return $s ? self::decode($s) : null;
    }

    public static function decode(array $s): array
    {
        $s['skipped'] = $s['skipped'] ? (json_decode($s['skipped'], true) ?: []) : [];
        return $s;
    }

    public static function save(array $s): void
    {
        q('UPDATE subscriptions SET size = ?, freq = ?, roast = ?, note = ?, status = ?, anchor = ?, next_delivery = ?, paused_until = ?,
              last_delivery = ?, skipped = ?, mandate_id = ?, mandate_account = ?, cancel_reason = ?, cancelled_at = ? WHERE id = ?', [
            $s['size'], $s['freq'], $s['roast'], $s['note'], $s['status'], $s['anchor'], $s['next_delivery'], $s['paused_until'],
            $s['last_delivery'], json_encode(array_values(array_unique($s['skipped']))), $s['mandate_id'], $s['mandate_account'] ?? null,
            $s['cancel_reason'], $s['cancelled_at'], $s['id'],
        ]);
    }

    /** Als de volgende levering al voorbij is (cron nog niet gedraaid): doorschuiven naar de eerstvolgende. */
    public static function normalize(array $s): array
    {
        if (in_array($s['status'], ['actief', 'gepauzeerd'], true) && $s['next_delivery'] < today()->format('Y-m-d')) {
            $s['next_delivery'] = Schedule::upcoming($s, today(), 1)[0]['date']->format('Y-m-d');
            self::save($s);
        }
        return $s;
    }

    public static function next(array $s): DateTimeImmutable
    {
        return new DateTimeImmutable($s['next_delivery']);
    }

    public static function locked(array $s): bool
    {
        return Schedule::isLocked(self::next($s), today(), (int) cfg('cancel_days'));
    }

    public static function price(string $size): int
    {
        return (int) cfg('prices')[$size];
    }

    /* ------------------------------------------------------------------ aanmelden */

    /**
     * Maakt klant + abonnement aan (status 'nieuw') en start de eerste betaling.
     * Geeft de Mollie-betaalpagina terug.
     */
    public static function register(array $in): string
    {
        $email = strtolower(trim((string) ($in['email'] ?? '')));
        $required = ['firstname', 'lastname', 'street', 'nr', 'postcode', 'city', 'password'];
        foreach ($required as $f) {
            if (trim((string) ($in[$f] ?? '')) === '') {
                throw new InvalidArgumentException('Niet alle verplichte velden zijn ingevuld.');
            }
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Vul een geldig e-mailadres in.');
        }
        if (!valid_postcode((string) $in['postcode'])) {
            throw new InvalidArgumentException('Vul een geldige postcode in, bijvoorbeeld 1234 AB.');
        }
        if (strlen((string) $in['password']) < 6) {
            throw new InvalidArgumentException('Kies een wachtwoord van minimaal 6 tekens.');
        }
        if (empty($in['terms'])) {
            throw new InvalidArgumentException('Ga akkoord met de algemene voorwaarden.');
        }
        $size = in_array($in['size'] ?? '', self::SIZES, true) ? $in['size'] : '500';
        $freq = in_array($in['freq'] ?? '', self::FREQS, true) ? $in['freq'] : '1m';
        $roast = in_array($in['roast'] ?? '', self::ROASTS, true) ? $in['roast'] : 'verras';

        $existing = row('SELECT id FROM users WHERE email = ?', [$email]);
        if ($existing) {
            $sub = self::forUser((int) $existing['id']);
            if ($sub && $sub['status'] !== 'nieuw') {
                throw new InvalidArgumentException('Er bestaat al een account met dit e-mailadres. Log in via Mijn account.');
            }
            // Eerder begonnen maar niet betaald: opnieuw beginnen
            q('DELETE FROM users WHERE id = ?', [$existing['id']]);
        }

        $referrer = null;
        $code = strtoupper(trim((string) ($in['referral'] ?? '')));
        if ($code !== '') {
            $referrer = row('SELECT id FROM users WHERE referral_code = ?', [$code]);
            if (!$referrer) {
                throw new InvalidArgumentException('Deze uitnodigingscode kennen we niet.');
            }
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            q('INSERT INTO users (email, password_hash, first_name, last_name, phone, street, house_number, postcode, city, newsletter, referral_code, referred_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $email, password_hash((string) $in['password'], PASSWORD_DEFAULT),
                trim((string) $in['firstname']), trim((string) $in['lastname']), trim((string) ($in['phone'] ?? '')),
                trim((string) $in['street']), trim((string) $in['nr']), normalize_postcode((string) $in['postcode']), trim((string) $in['city']),
                !empty($in['newsletter']) ? 1 : 0, self::newReferralCode((string) $in['firstname']), $referrer['id'] ?? null,
            ]);
            $userId = (int) $pdo->lastInsertId();
            $first = Schedule::firstDeliveryDate(today(), (int) cfg('first_delivery_min_days'));
            q('INSERT INTO subscriptions (user_id, size, freq, roast, status, anchor, next_delivery, skipped, first_discount_pct)
               VALUES (?, ?, ?, ?, "nieuw", ?, ?, "[]", ?)', [
                $userId, $size, $freq, $roast, $first->format('Y-m-d'), $first->format('Y-m-d'),
                $referrer ? (int) cfg('referral_discount_pct') : (int) cfg('welcome_discount_pct'),
            ]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        return self::startFirstPayment($userId);
    }

    public static function newReferralCode(string $firstName): string
    {
        $base = strtoupper(preg_replace('/[^A-Za-z]/', '', iconv('UTF-8', 'ASCII//TRANSLIT', $firstName) ?: 'KOFFIE'));
        $base = substr($base !== '' ? $base : 'KOFFIE', 0, 6);
        do {
            $code = 'KH-' . $base . random_int(100, 999);
        } while (row('SELECT id FROM users WHERE referral_code = ?', [$code]));
        return $code;
    }

    public static function referralValid(string $code): bool
    {
        return (bool) row('SELECT id FROM users WHERE referral_code = ?', [strtoupper(trim($code))]);
    }

    /** (Opnieuw) de eerste betaling starten voor een abonnement met status 'nieuw'. */
    public static function startFirstPayment(int $userId): string
    {
        $user = row('SELECT * FROM users WHERE id = ?', [$userId]);
        $sub = self::forUser($userId);
        if (!$user || !$sub || $sub['status'] !== 'nieuw') {
            throw new InvalidArgumentException('Er staat geen betaling open.');
        }
        // Eerste leverdatum opnieuw bepalen (bij een latere poging kan de oude datum te dichtbij liggen)
        $first = Schedule::firstDeliveryDate(today(), (int) cfg('first_delivery_min_days'));
        $sub['anchor'] = $sub['next_delivery'] = $first->format('Y-m-d');
        self::save($sub);

        $customerId = self::mollieCustomer($user);
        $price = self::price($sub['size']);
        $discount = (int) round($price * (int) $sub['first_discount_pct'] / 100);
        $amount = $price - $discount;

        q('DELETE FROM deliveries WHERE subscription_id = ? AND status = "wacht_op_betaling"', [$sub['id']]);
        $info = Schedule::infoFor($sub, $first);
        q('INSERT INTO deliveries (subscription_id, user_id, delivery_date, flavour_month, new_flavour, size, bags, price_cents, discount_cents, status)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, "wacht_op_betaling")', [
            $sub['id'], $userId, $first->format('Y-m-d'), $info['flavour_month'] ?? $first->format('Y-m'),
            $sub['size'], cfg('bags')[$sub['size']], $price, $discount,
        ]);
        $deliveryId = (int) db()->lastInsertId();

        $payment = Mollie::createFirstPayment($customerId, $amount,
            'Khoffie eerste levering ' . ($sub['size'] === '500' ? '500 g' : '250 g'),
            rtrim((string) cfg('base_url'), '/') . '/account.html?betaling=terug',
            ['type' => 'first', 'subscription_id' => $sub['id'], 'delivery_id' => $deliveryId]);

        q('INSERT INTO payments (user_id, subscription_id, mollie_id, kind, amount_cents, status, description, checkout_url) VALUES (?, ?, ?, "first", ?, ?, ?, ?)', [
            $userId, $sub['id'], $payment['id'], $amount, $payment['status'] ?? 'open', $payment['description'] ?? '', $payment['_links']['checkout']['href'] ?? null,
        ]);
        q('UPDATE deliveries SET payment_id = ? WHERE id = ?', [db()->lastInsertId(), $deliveryId]);
        return (string) ($payment['_links']['checkout']['href'] ?? '');
    }

    /** Nieuwe rekening koppelen: verificatiebetaling van € 0,01 via iDEAL | Wero. */
    public static function startBankChange(int $userId): string
    {
        $user = row('SELECT * FROM users WHERE id = ?', [$userId]);
        $sub = self::forUser($userId);
        $customerId = self::mollieCustomer($user);
        $payment = Mollie::createFirstPayment($customerId, 1, 'Khoffie rekening koppelen',
            rtrim((string) cfg('base_url'), '/') . '/account.html?betaling=rekening#betalingen',
            ['type' => 'verify', 'subscription_id' => $sub['id']]);
        q('INSERT INTO payments (user_id, subscription_id, mollie_id, kind, amount_cents, status, description, checkout_url) VALUES (?, ?, ?, "verify", 1, ?, ?, ?)', [
            $userId, $sub['id'], $payment['id'], $payment['status'] ?? 'open', $payment['description'] ?? '', $payment['_links']['checkout']['href'] ?? null,
        ]);
        return (string) ($payment['_links']['checkout']['href'] ?? '');
    }

    private static function mollieCustomer(array $user): string
    {
        if ($user['mollie_customer_id']) {
            return $user['mollie_customer_id'];
        }
        $c = Mollie::createCustomer($user['first_name'] . ' ' . $user['last_name'], $user['email']);
        q('UPDATE users SET mollie_customer_id = ? WHERE id = ?', [$c['id'], $user['id']]);
        return $c['id'];
    }

    /* ------------------------------------------------------------------ acties vanuit het account */

    public static function action(int $userId, string $action, array $in): array
    {
        $sub = self::forUser($userId);
        if (!$sub) {
            throw new InvalidArgumentException('Geen abonnement gevonden.');
        }
        $sub = self::normalize($sub);
        $today = today();
        $days = (int) cfg('cancel_days');
        $next = self::next($sub);
        $locked = Schedule::isLocked($next, $today, $days);
        $result = [];

        switch ($action) {
            case 'skip':
                self::requireActive($sub);
                if ($locked) {
                    // Deze levering wordt al gebrand; de levering daarna overslaan
                    $sub['skipped'][] = Schedule::nextAfter($sub, $next)->format('Y-m-d');
                } else {
                    $sub['next_delivery'] = Schedule::nextAfter($sub, $next)->format('Y-m-d');
                }
                break;

            case 'pause':
                self::requireActive($sub);
                $months = max(1, min(3, (int) ($in['months'] ?? 1)));
                $from = $locked ? Schedule::nextAfter($sub, $next) : $next;
                $resume = self::resumeAfterPause($sub, $from, $months);
                if ($locked) {
                    foreach (Schedule::upcoming($sub, $next->modify('+1 day'), 12) as $u) {
                        if ($u['date'] < $resume) {
                            $sub['skipped'][] = $u['date']->format('Y-m-d');
                        }
                    }
                    $sub['paused_until'] = $resume->format('Y-m-d');
                } else {
                    $sub['status'] = 'gepauzeerd';
                    $sub['paused_until'] = $resume->format('Y-m-d');
                    $sub['next_delivery'] = $resume->format('Y-m-d');
                }
                $result['resume'] = $resume->format('Y-m-d');
                break;

            case 'resume':
            case 'restart':
                // Pauze na een levering die al gebrand werd: overgeslagen data weer vrijgeven
                if ($action === 'resume' && $sub['status'] === 'actief' && $sub['paused_until']) {
                    $sub['skipped'] = array_values(array_filter($sub['skipped'], fn($d) => $d <= $sub['next_delivery']));
                    $sub['paused_until'] = null;
                    break;
                }
                if ($sub['status'] === 'nieuw') {
                    throw new InvalidArgumentException('Rond eerst je eerste betaling af.');
                }
                $earliest = Schedule::firstDeliveryDate($today, (int) cfg('first_delivery_min_days'));
                if ($sub['status'] === 'opgezegd' && !$sub['mandate_id']) {
                    throw new InvalidArgumentException('Neem contact met ons op om je abonnement te hervatten.');
                }
                if ($action === 'restart' || $sub['status'] === 'opgezegd') {
                    $sub['anchor'] = $earliest->format('Y-m-d');
                    $sub['skipped'] = [];
                }
                $sub['status'] = 'actief';
                $sub['paused_until'] = null;
                $sub['last_delivery'] = null;
                $sub['cancel_reason'] = null;
                $sub['cancelled_at'] = null;
                if (new DateTimeImmutable($sub['next_delivery']) < $earliest || $action === 'restart') {
                    $sub['next_delivery'] = Schedule::upcoming($sub, $earliest, 1)[0]['date']->format('Y-m-d');
                }
                break;

            case 'cancel':
                self::requireActive($sub, true);
                $sub['status'] = 'opgezegd';
                $sub['last_delivery'] = $locked ? $next->format('Y-m-d') : null;
                $sub['cancel_reason'] = mb_substr((string) ($in['reason'] ?? ''), 0, 190);
                $sub['cancelled_at'] = (new DateTimeImmutable())->format('Y-m-d H:i:s');
                $user = row('SELECT * FROM users WHERE id = ?', [$userId]);
                Mailer::cancelled($user, $locked ? $next : null);
                break;

            case 'update-plan':
                self::requireActive($sub, true);
                if (in_array($in['size'] ?? '', self::SIZES, true)) {
                    $sub['size'] = $in['size'];
                }
                if (in_array($in['roast'] ?? '', self::ROASTS, true)) {
                    $sub['roast'] = $in['roast'];
                }
                $sub['note'] = mb_substr(trim((string) ($in['note'] ?? '')), 0, 1000);
                if (in_array($in['freq'] ?? '', self::FREQS, true) && $in['freq'] !== $sub['freq']) {
                    $sub['freq'] = $in['freq'];
                    // De levering die al gebrand wordt blijft staan; anders de eerstvolgende datum in het nieuwe ritme
                    // die nog niet binnen de 7 dagen valt.
                    if (!$locked && $sub['status'] === 'actief') {
                        $sub['next_delivery'] = Schedule::upcoming($sub, $today->modify('+' . ($days + 1) . ' days'), 1)[0]['date']->format('Y-m-d');
                    }
                }
                $result['locked'] = $locked;
                break;

            case 'rate':
                $batch = row('SELECT b.id FROM batches b JOIN deliveries d ON d.batch_id = b.id WHERE b.code = ? AND d.user_id = ? LIMIT 1', [(string) ($in['batch'] ?? ''), $userId]);
                $n = (int) ($in['rating'] ?? 0);
                if (!$batch || $n < 1 || $n > 5) {
                    throw new InvalidArgumentException('Ongeldige beoordeling.');
                }
                q('INSERT INTO ratings (user_id, batch_id, rating) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating)', [$userId, $batch['id'], $n]);
                return self::account($userId);

            case 'update-details':
                foreach (['name', 'street', 'nr', 'postcode', 'city'] as $f) {
                    if (trim((string) ($in[$f] ?? '')) === '') {
                        throw new InvalidArgumentException('Niet alle verplichte velden zijn ingevuld.');
                    }
                }
                if (!valid_postcode((string) $in['postcode'])) {
                    throw new InvalidArgumentException('Vul een geldige postcode in.');
                }
                $parts = preg_split('/\s+/', trim((string) $in['name']), 2);
                q('UPDATE users SET first_name = ?, last_name = ?, phone = ?, street = ?, house_number = ?, postcode = ?, city = ?, newsletter = ? WHERE id = ?', [
                    $parts[0], $parts[1] ?? '', trim((string) ($in['phone'] ?? '')), trim((string) $in['street']), trim((string) $in['nr']),
                    normalize_postcode((string) $in['postcode']), trim((string) $in['city']), !empty($in['newsletter']) ? 1 : 0, $userId,
                ]);
                return self::account($userId);

            case 'change-password':
                $user = row('SELECT password_hash FROM users WHERE id = ?', [$userId]);
                if (!password_verify((string) ($in['old'] ?? ''), $user['password_hash'])) {
                    throw new InvalidArgumentException('Je huidige wachtwoord klopt niet.');
                }
                if (strlen((string) ($in['new'] ?? '')) < 6) {
                    throw new InvalidArgumentException('Kies een wachtwoord van minimaal 6 tekens.');
                }
                q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash((string) $in['new'], PASSWORD_DEFAULT), $userId]);
                return self::account($userId);

            default:
                throw new InvalidArgumentException('Onbekende actie.');
        }

        self::save($sub);
        return self::account($userId) + ['result' => $result];
    }

    /** Pauze van m maanden = de leveringen van m maanden overslaan, vanaf $from. */
    public static function resumeAfterPause(array $sub, DateTimeImmutable $from, int $months): DateTimeImmutable
    {
        $n = $months * Schedule::perMonth($sub['freq']);
        return Schedule::upcoming($sub, $from, $n + 1)[$n]['date'];
    }

    private static function requireActive(array $sub, bool $allowPaused = true): void
    {
        $ok = $sub['status'] === 'actief' || ($allowPaused && $sub['status'] === 'gepauzeerd');
        if (!$ok) {
            throw new InvalidArgumentException($sub['status'] === 'nieuw'
                ? 'Rond eerst je eerste betaling af.'
                : 'Dit kan niet bij de huidige status van je abonnement.');
        }
    }

    /* ------------------------------------------------------------------ account-gegevens voor de website */

    private static function jsDate(?string $ymd): ?string
    {
        return $ymd ? substr($ymd, 0, 10) . 'T00:00:00' : null;
    }

    /** Alles wat het klantaccount nodig heeft, in hetzelfde formaat als de website verwacht. */
    public static function account(int $userId): array
    {
        $u = row('SELECT * FROM users WHERE id = ?', [$userId]);
        $s = self::forUser($userId);
        if ($s) {
            $s = self::normalize($s);
        }
        $ratings = [];
        foreach (rows('SELECT batch_id, rating FROM ratings WHERE user_id = ?', [$userId]) as $r) {
            $ratings[(int) $r['batch_id']] = (int) $r['rating'];
        }
        $deliveries = [];
        $list = rows('SELECT d.*, b.code, b.country, b.region, b.farm, b.process, b.notes, b.roast AS broast, p.status AS pstatus
                      FROM deliveries d LEFT JOIN batches b ON b.id = d.batch_id LEFT JOIN payments p ON p.id = d.payment_id
                      WHERE d.user_id = ? AND d.status IN ("betaald", "verzonden") ORDER BY d.delivery_date', [$userId]);
        foreach ($list as $d) {
            $shipped = $d['status'] === 'verzonden' || $d['delivery_date'] <= today()->format('Y-m-d');
            if (!$shipped || !$d['code']) {
                continue;
            }
            $parcels = $d['sendcloud_parcels'] ? (json_decode($d['sendcloud_parcels'], true) ?: []) : [];
            $deliveries[] = [
                'id' => (int) $d['id'],
                'batch' => $d['code'],
                'date' => self::jsDate($d['delivery_date']),
                'country' => $d['country'],
                'region' => $d['region'],
                'farm' => $d['farm'],
                'process' => $d['process'],
                'notes' => array_values(array_filter(array_map('trim', explode(',', (string) $d['notes'])))),
                'roast' => (int) $d['broast'],
                'size' => $d['size'],
                'grind' => 'bonen',
                'price' => ($d['price_cents'] - $d['discount_cents']) / 100,
                'status' => 'bezorgd',
                'rating' => $ratings[(int) $d['batch_id']] ?? 0,
                'invoice' => $d['payment_id'] ? (int) $d['payment_id'] : null,
                'tracking' => array_values(array_filter(array_column($parcels, 'tracking_url'))),
            ];
        }
        $pending = null;
        if ($s && $s['status'] === 'nieuw') {
            $p = row('SELECT status FROM payments WHERE subscription_id = ? AND kind = "first" ORDER BY id DESC LIMIT 1', [$s['id']]);
            $pending = ['status' => $p['status'] ?? 'open'];
        }
        return [
            'ok' => true,
            'live' => true,
            'name' => trim($u['first_name'] . ' ' . $u['last_name']),
            'email' => $u['email'],
            'phone' => $u['phone'],
            'address' => ['street' => $u['street'], 'nr' => $u['house_number'], 'postcode' => $u['postcode'], 'city' => $u['city']],
            'memberSince' => self::jsDate($u['created_at']),
            'newsletter' => (bool) $u['newsletter'],
            'referral' => $u['referral_code'],
            'credit' => (int) $u['credit_cents'] / 100,
            'pendingPayment' => $pending,
            'sub' => $s ? [
                'size' => $s['size'],
                'freq' => $s['freq'],
                'grind' => 'bonen',
                'roast' => $s['roast'],
                'pay' => 'ideal-wero',
                'account' => $s['mandate_account'],
                'status' => $s['status'],
                'pausedUntil' => self::jsDate($s['paused_until']),
                'anchor' => self::jsDate($s['anchor']),
                'nextDelivery' => self::jsDate($s['next_delivery']),
                'lastDelivery' => self::jsDate($s['last_delivery']),
                'skipped' => array_map([self::class, 'jsDate'], $s['skipped']),
                'note' => (string) $s['note'],
            ] : null,
            'deliveries' => $deliveries,
        ];
    }
}
