<?php
/*
 * Leveringen: aanmaken + afschrijven (cron), Mollie-webhook, batches toewijzen,
 * weekoverzicht voor het beheer en koppeling met Sendcloud.
 *
 * Een levering komt in de database zodra de 7-dagentermijn verstreken is (vanaf dan kan de klant
 * niets meer wijzigen). Op dat moment schrijven we af. Leveringen die verder weg liggen zijn
 * 'voorlopig' en worden in het weekoverzicht berekend uit het abonnement.
 */
declare(strict_types=1);

final class Deliveries
{
    /* ------------------------------------------------------------------ cron */

    /** Dagelijkse (of elk uur) verwerking. Veilig om vaker te draaien. */
    public static function runCron(): array
    {
        $today = today();
        $days = (int) cfg('cancel_days');
        $report = ['created' => 0, 'charged' => 0, 'errors' => 0, 'resumed' => 0];

        foreach (rows('SELECT * FROM subscriptions WHERE status IN ("actief", "gepauzeerd", "opgezegd")') as $raw) {
            $sub = Subscriptions::decode($raw);
            try {
                $next = new DateTimeImmutable($sub['next_delivery']);

                // Pauze voorbij: weer actief zodra de hervattingslevering binnen de 7 dagen valt
                if ($sub['status'] === 'gepauzeerd' && Schedule::isLocked($next, $today, $days)) {
                    $sub['status'] = 'actief';
                    $sub['paused_until'] = null;
                    $report['resumed']++;
                }

                if ($sub['status'] === 'actief') {
                    // Volgende levering bijwerken als de vorige voorbij is
                    if ($next < $today) {
                        $next = Schedule::upcoming($sub, $today, 1)[0]['date'];
                        $sub['next_delivery'] = $next->format('Y-m-d');
                    }
                    // Vanaf de volgende levering rekenen: data daarvoor zijn overgeslagen of gepauzeerd
                    foreach (Schedule::upcoming($sub, max($today, $next), 3) as $u) {
                        if (!Schedule::isLocked($u['date'], $today, $days)) {
                            break;
                        }
                        if (self::ensure($sub, $u)) {
                            $report['created']++;
                        }
                    }
                } elseif ($sub['status'] === 'opgezegd' && $sub['last_delivery']) {
                    $last = new DateTimeImmutable($sub['last_delivery']);
                    if ($last >= $today && Schedule::isLocked($last, $today, $days)) {
                        $info = Schedule::infoFor($sub, $last) ?? ['date' => $last, 'new_flavour' => true, 'flavour_month' => $last->format('Y-m'), 'period' => 0];
                        if (self::ensure($sub, $info)) {
                            $report['created']++;
                        }
                    }
                }
                Subscriptions::save($sub);
            } catch (Throwable $e) {
                $report['errors']++;
                log_msg('error', 'Cron: fout bij abonnement ' . $sub['id'] . ': ' . $e->getMessage());
            }
        }

        // Afschrijven voor leveringen zonder betaling (net aangemaakt, of eerder mislukt door een storing)
        foreach (rows('SELECT d.id FROM deliveries d JOIN subscriptions s ON s.id = d.subscription_id
                       WHERE d.payment_id IS NULL AND d.status = "wacht_op_betaling" AND s.status <> "nieuw" AND d.delivery_date >= ?', [$today->format('Y-m-d')]) as $d) {
            try {
                self::charge((int) $d['id']);
                $report['charged']++;
            } catch (Throwable $e) {
                $report['errors']++;
                log_msg('error', 'Afschrijven mislukt voor levering ' . $d['id'] . ': ' . $e->getMessage());
            }
        }
        setting('cron_last_run', (new DateTimeImmutable())->format('Y-m-d H:i:s'));
        setting('cron_last_report', json_encode($report));
        return $report;
    }

    /** Maakt een levering aan als die nog niet bestaat. */
    private static function ensure(array $sub, array $info): bool
    {
        $date = $info['date']->format('Y-m-d');
        if (row('SELECT id FROM deliveries WHERE subscription_id = ? AND delivery_date = ?', [$sub['id'], $date])) {
            return false;
        }
        $user = row('SELECT * FROM users WHERE id = ?', [$sub['user_id']]);
        $price = Subscriptions::price($sub['size']);
        // Tegoed (bijv. van een uitnodiging) verrekenen; minimaal € 1 blijft over voor de incasso
        $discount = min((int) $user['credit_cents'], max(0, $price - 100));
        q('INSERT INTO deliveries (subscription_id, user_id, delivery_date, flavour_month, new_flavour, size, bags, price_cents, discount_cents, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "wacht_op_betaling")', [
            $sub['id'], $sub['user_id'], $date, $info['flavour_month'], $info['new_flavour'] ? 1 : 0,
            $sub['size'], cfg('bags')[$sub['size']], $price, $discount,
        ]);
        $id = (int) db()->lastInsertId();
        if ($discount > 0) {
            q('UPDATE users SET credit_cents = credit_cents - ? WHERE id = ?', [$discount, $user['id']]);
        }
        self::assignBatch($id);
        return true;
    }

    /** Terugkerende betaling starten voor een levering. */
    public static function charge(int $deliveryId): void
    {
        $d = row('SELECT * FROM deliveries WHERE id = ?', [$deliveryId]);
        $user = row('SELECT * FROM users WHERE id = ?', [$d['user_id']]);
        $sub = Subscriptions::find((int) $d['subscription_id']);
        if (!$user['mollie_customer_id']) {
            throw new RuntimeException('Klant heeft geen Mollie-klantnummer');
        }
        $amount = (int) $d['price_cents'] - (int) $d['discount_cents'];
        $payment = Mollie::createRecurringPayment($user['mollie_customer_id'], $sub['mandate_id'], $amount,
            'Khoffie levering ' . $d['delivery_date'] . ' (' . ($d['size'] === '500' ? '500 g' : '250 g') . ')',
            ['type' => 'recurring', 'delivery_id' => $deliveryId]);
        q('INSERT INTO payments (user_id, subscription_id, mollie_id, kind, amount_cents, status, description) VALUES (?, ?, ?, "recurring", ?, ?, ?)', [
            $user['id'], $sub['id'], $payment['id'], $amount, $payment['status'] ?? 'pending', $payment['description'] ?? '',
        ]);
        q('UPDATE deliveries SET payment_id = ? WHERE id = ?', [db()->lastInsertId(), $deliveryId]);
    }

    /** Opnieuw afschrijven na een mislukte betaling (vanuit het beheer). */
    public static function retryCharge(int $deliveryId): void
    {
        q('UPDATE deliveries SET payment_id = NULL, status = "wacht_op_betaling" WHERE id = ? AND status = "betaling_mislukt"', [$deliveryId]);
        self::charge($deliveryId);
    }

    /* ------------------------------------------------------------------ batches */

    /**
     * Kiest de smaak voor een levering: bij de 2e levering van een maand dezelfde batch als de 1e,
     * anders een actieve batch van die maand die de klant nog niet heeft gehad.
     */
    public static function assignBatch(int $deliveryId): ?int
    {
        $d = row('SELECT * FROM deliveries WHERE id = ?', [$deliveryId]);
        if (!$d || $d['batch_id']) {
            return $d['batch_id'] ?? null;
        }
        $batchId = null;
        if (!$d['new_flavour']) {
            $prev = row('SELECT batch_id FROM deliveries WHERE subscription_id = ? AND flavour_month = ? AND batch_id IS NOT NULL AND id <> ? ORDER BY delivery_date LIMIT 1',
                [$d['subscription_id'], $d['flavour_month'], $deliveryId]);
            $batchId = $prev['batch_id'] ?? null;
        }
        if (!$batchId) {
            $b = row('SELECT id FROM batches WHERE month = ? AND active = 1 AND id NOT IN (SELECT batch_id FROM deliveries WHERE user_id = ? AND batch_id IS NOT NULL)
                      ORDER BY id LIMIT 1', [$d['flavour_month'], $d['user_id']]);
            $batchId = $b['id'] ?? null;
            if (!$batchId && row('SELECT id FROM batches WHERE month = ? AND active = 1 LIMIT 1', [$d['flavour_month']])) {
                // Alle batches van deze maand al gehad: neem de eerstvolgende nieuwe smaak
                $b = row('SELECT id FROM batches WHERE month >= ? AND active = 1 AND id NOT IN (SELECT batch_id FROM deliveries WHERE user_id = ? AND batch_id IS NOT NULL)
                          ORDER BY month, id LIMIT 1', [$d['flavour_month'], $d['user_id']]);
                $batchId = $b['id'] ?? null;
            }
        }
        if ($batchId) {
            q('UPDATE deliveries SET batch_id = ? WHERE id = ?', [$batchId, $deliveryId]);
        }
        return $batchId ? (int) $batchId : null;
    }

    /** Batches toewijzen aan alle leveringen die er nog geen hebben. */
    public static function assignMissingBatches(): int
    {
        $n = 0;
        foreach (rows('SELECT id FROM deliveries WHERE batch_id IS NULL AND status NOT IN ("geannuleerd") ORDER BY new_flavour DESC, delivery_date') as $d) {
            if (self::assignBatch((int) $d['id'])) {
                $n++;
            }
        }
        return $n;
    }

    /* ------------------------------------------------------------------ Mollie-webhook */

    public static function handleMollie(string $mollieId): void
    {
        $local = row('SELECT * FROM payments WHERE mollie_id = ?', [$mollieId]);
        if (!$local) {
            return; // onbekende betaling: negeren
        }
        $p = Mollie::getPayment($mollieId);
        $status = (string) ($p['status'] ?? 'open');
        $wasPaid = $local['status'] === 'paid';
        $paidAt = null;
        if ($status === 'paid') {
            $paidAt = (new DateTimeImmutable($p['paidAt'] ?? 'now'))->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('Y-m-d H:i:s');
        }
        q('UPDATE payments SET status = ?, paid_at = ? WHERE id = ?', [$status, $paidAt, $local['id']]);
        if ($status === 'paid' && $wasPaid) {
            return; // al verwerkt
        }
        $failed = in_array($status, ['failed', 'canceled', 'expired'], true);
        $user = row('SELECT * FROM users WHERE id = ?', [$local['user_id']]);
        $sub = Subscriptions::find((int) $local['subscription_id']);

        if ($local['kind'] === 'first') {
            $delivery = row('SELECT * FROM deliveries WHERE payment_id = ?', [$local['id']]);
            if ($status === 'paid') {
                $sub['status'] = 'actief';
                $sub['mandate_id'] = $p['mandateId'] ?? $sub['mandate_id'];
                $sub['mandate_account'] = self::maskAccount($p['details']['consumerAccount'] ?? null) ?? $sub['mandate_account'];
                Subscriptions::save($sub);
                if ($delivery) {
                    q('UPDATE deliveries SET status = "betaald" WHERE id = ?', [$delivery['id']]);
                    self::assignBatch((int) $delivery['id']);
                }
                if ($user['referred_by']) {
                    q('UPDATE users SET credit_cents = credit_cents + ? WHERE id = ?', [(int) cfg('referral_credit_cents'), $user['referred_by']]);
                }
                Mailer::welcome($user, $sub, new DateTimeImmutable($sub['next_delivery']));
                Mailer::adminNewSubscriber($user, $sub);
            } elseif ($failed && $delivery && $delivery['status'] === 'wacht_op_betaling') {
                q('UPDATE deliveries SET status = "geannuleerd" WHERE id = ?', [$delivery['id']]);
            }
        } elseif ($local['kind'] === 'recurring') {
            $delivery = row('SELECT * FROM deliveries WHERE payment_id = ?', [$local['id']]);
            if ($delivery && $status === 'paid') {
                q('UPDATE deliveries SET status = IF(status = "verzonden", status, "betaald") WHERE id = ?', [$delivery['id']]);
            } elseif ($delivery && $failed) {
                q('UPDATE deliveries SET status = "betaling_mislukt" WHERE id = ? AND status <> "verzonden"', [$delivery['id']]);
                Mailer::paymentFailed($user, (int) $local['amount_cents']);
            }
        } elseif ($local['kind'] === 'verify' && $status === 'paid' && $sub) {
            $old = $sub['mandate_id'];
            $sub['mandate_id'] = $p['mandateId'] ?? $old;
            $sub['mandate_account'] = self::maskAccount($p['details']['consumerAccount'] ?? null) ?? $sub['mandate_account'];
            Subscriptions::save($sub);
            if ($old && $old !== $sub['mandate_id']) {
                try {
                    Mollie::revokeMandate($user['mollie_customer_id'], $old);
                } catch (Throwable $e) {
                    log_msg('warning', 'Oude machtiging intrekken mislukt: ' . $e->getMessage());
                }
            }
        }
    }

    private static function maskAccount(?string $iban): ?string
    {
        if (!$iban) {
            return null;
        }
        $iban = preg_replace('/\s+/', '', $iban);
        return substr($iban, 0, 2) . '•• •••• •••• ' . substr($iban, -4);
    }

    /* ------------------------------------------------------------------ weekoverzicht (beheer) */

    /**
     * Alle leveringen in een week: vastgezette uit de database + voorlopige (berekend).
     * @return array<int, array> gesorteerd op datum en naam
     */
    public static function week(DateTimeImmutable $monday): array
    {
        $sunday = $monday->modify('+6 days');
        $today = today();
        $days = (int) cfg('cancel_days');
        $out = [];

        $dbRows = rows('SELECT d.*, u.first_name, u.last_name, u.email, u.phone, u.street, u.house_number, u.postcode, u.city,
                               b.code AS batch_code, b.country AS batch_country, p.status AS payment_status, s.status AS sub_status
                        FROM deliveries d JOIN users u ON u.id = d.user_id JOIN subscriptions s ON s.id = d.subscription_id
                        LEFT JOIN batches b ON b.id = d.batch_id LEFT JOIN payments p ON p.id = d.payment_id
                        WHERE d.delivery_date BETWEEN ? AND ? ORDER BY d.delivery_date, u.last_name', [$monday->format('Y-m-d'), $sunday->format('Y-m-d')]);
        $have = [];
        foreach ($dbRows as $r) {
            $r['projected'] = false;
            $r['parcels'] = $r['sendcloud_parcels'] ? (json_decode($r['sendcloud_parcels'], true) ?: []) : [];
            $out[] = $r;
            $have[$r['subscription_id'] . '|' . $r['delivery_date']] = true;
        }

        // Voorlopige leveringen (nog niet vastgezet)
        $subs = rows('SELECT s.*, u.first_name, u.last_name, u.email, u.phone, u.street, u.house_number, u.postcode, u.city
                      FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.status IN ("actief", "gepauzeerd", "opgezegd")');
        foreach ($subs as $raw) {
            $sub = Subscriptions::decode($raw);
            $dates = [];
            if ($sub['status'] === 'opgezegd') {
                if ($sub['last_delivery']) {
                    $l = new DateTimeImmutable($sub['last_delivery']);
                    $dates[] = ['date' => $l, 'new_flavour' => true, 'flavour_month' => $l->format('Y-m')];
                }
            } else {
                $from = max($monday, new DateTimeImmutable($sub['next_delivery']), $today);
                foreach (Schedule::upcoming($sub, $from, 3) as $u) {
                    if ($u['date'] <= $sunday) {
                        $dates[] = $u;
                    }
                }
            }
            foreach ($dates as $u) {
                $key = $sub['id'] . '|' . $u['date']->format('Y-m-d');
                if ($u['date'] < $monday || $u['date'] > $sunday || isset($have[$key]) || $u['date'] < $today) {
                    continue;
                }
                $out[] = array_merge($raw, [
                    'id' => null,
                    'subscription_id' => $sub['id'],
                    'delivery_date' => $u['date']->format('Y-m-d'),
                    'flavour_month' => $u['flavour_month'],
                    'new_flavour' => $u['new_flavour'] ? 1 : 0,
                    'bags' => cfg('bags')[$sub['size']],
                    'price_cents' => Subscriptions::price($sub['size']),
                    'discount_cents' => 0,
                    'status' => 'voorlopig',
                    'batch_code' => null,
                    'batch_country' => null,
                    'payment_status' => null,
                    'sub_status' => $sub['status'],
                    'parcels' => [],
                    'projected' => true,
                    'deadline' => Schedule::deadline($u['date'], $days)->format('Y-m-d'),
                ]);
            }
        }
        usort($out, fn($a, $b) => [$a['delivery_date'], $a['last_name'], $a['first_name']] <=> [$b['delivery_date'], $b['last_name'], $b['first_name']]);
        return $out;
    }

    /* ------------------------------------------------------------------ Sendcloud */

    /** Zendingen aanmaken in Sendcloud. Alleen voor betaalde leveringen zonder zending. */
    public static function toSendcloud(array $ids): array
    {
        $done = 0;
        $skipped = [];
        foreach ($ids as $id) {
            $d = row('SELECT d.*, u.first_name, u.last_name, u.email, u.phone, u.street, u.house_number, u.postcode, u.city
                      FROM deliveries d JOIN users u ON u.id = d.user_id WHERE d.id = ?', [(int) $id]);
            if (!$d) {
                continue;
            }
            $name = $d['first_name'] . ' ' . $d['last_name'];
            if ($d['status'] !== 'betaald') {
                $skipped[] = $name . ' (' . self::statusLabel($d['status']) . ')';
                continue;
            }
            if ($d['sendcloud_parcels']) {
                $skipped[] = $name . ' (staat al in Sendcloud)';
                continue;
            }
            $count = cfg('sendcloud.parcel_per_bag', true) ? (int) $d['bags'] : 1;
            $weight = (float) cfg('sendcloud.weight_per_bag_kg', 0.3) * ((int) $d['bags'] / $count);
            $parcels = [];
            for ($i = 1; $i <= $count; $i++) {
                $p = Sendcloud::createParcel([
                    'name' => $name, 'street' => $d['street'], 'house_number' => $d['house_number'],
                    'postcode' => $d['postcode'], 'city' => $d['city'], 'email' => $d['email'], 'phone' => $d['phone'],
                ], 'KH-' . $d['id'] . ($count > 1 ? '-' . $i : ''), $weight);
                $parcels[] = [
                    'id' => $p['id'] ?? null,
                    'tracking_number' => $p['tracking_number'] ?? '',
                    'tracking_url' => $p['tracking_url'] ?? '',
                    'status' => $p['status']['message'] ?? '',
                ];
            }
            q('UPDATE deliveries SET sendcloud_parcels = ? WHERE id = ?', [json_encode($parcels), $d['id']]);
            $done++;
        }
        return ['done' => $done, 'skipped' => $skipped];
    }

    /** Markeren als verzonden en de klant mailen (met track & trace als die er is). */
    public static function markShipped(array $ids, bool $mail = true): int
    {
        $n = 0;
        foreach ($ids as $id) {
            $d = row('SELECT * FROM deliveries WHERE id = ?', [(int) $id]);
            if (!$d || !in_array($d['status'], ['betaald', 'wacht_op_betaling'], true)) {
                continue;
            }
            $parcels = $d['sendcloud_parcels'] ? (json_decode($d['sendcloud_parcels'], true) ?: []) : [];
            // Track & trace ophalen als die nog ontbreekt (label net gemaakt in Sendcloud)
            if ($parcels && Sendcloud::isConfigured()) {
                foreach ($parcels as &$p) {
                    if (empty($p['tracking_url']) && !empty($p['id'])) {
                        try {
                            $fresh = Sendcloud::getParcel((int) $p['id']);
                            $p['tracking_number'] = $fresh['tracking_number'] ?? '';
                            $p['tracking_url'] = $fresh['tracking_url'] ?? '';
                            $p['status'] = $fresh['status']['message'] ?? $p['status'];
                        } catch (Throwable $e) {
                            log_msg('warning', 'Tracking ophalen mislukt: ' . $e->getMessage());
                        }
                    }
                }
                unset($p);
            }
            q('UPDATE deliveries SET status = "verzonden", shipped_at = NOW(), sendcloud_parcels = ? WHERE id = ?', [$parcels ? json_encode($parcels) : null, $d['id']]);
            if ($mail) {
                $user = row('SELECT * FROM users WHERE id = ?', [$d['user_id']]);
                Mailer::shipped($user, array_values(array_filter(array_column($parcels, 'tracking_url'))));
            }
            $n++;
        }
        return $n;
    }

    /** Verwerkt een Sendcloud-webhook (statuswijziging van een zending). */
    public static function handleSendcloud(array $payload): void
    {
        $parcel = $payload['parcel'] ?? null;
        if (!$parcel || empty($parcel['id'])) {
            return;
        }
        $pid = (int) $parcel['id'];
        foreach (rows('SELECT id, sendcloud_parcels FROM deliveries WHERE sendcloud_parcels LIKE ?', ['%"id":' . $pid . '%']) as $d) {
            $list = json_decode($d['sendcloud_parcels'], true) ?: [];
            $changed = false;
            foreach ($list as &$p) {
                if ((int) ($p['id'] ?? 0) === $pid) {
                    $p['tracking_number'] = $parcel['tracking_number'] ?? $p['tracking_number'];
                    $p['tracking_url'] = $parcel['tracking_url'] ?? $p['tracking_url'];
                    $p['status'] = $parcel['status']['message'] ?? $p['status'];
                    $changed = true;
                }
            }
            unset($p);
            if ($changed) {
                q('UPDATE deliveries SET sendcloud_parcels = ? WHERE id = ?', [json_encode($list), $d['id']]);
            }
        }
    }

    /** CSV voor Sendcloud-import of als paklijst. */
    public static function csv(array $rows): string
    {
        $fh = fopen('php://temp', 'r+');
        fputcsv($fh, ['Name', 'Address', 'House number', 'Postal code', 'City', 'Country', 'Email', 'Phone', 'Order number', 'Weight', 'Zakken', 'Batch', 'Leverdatum', 'Status'], ';', '"', '');
        foreach ($rows as $r) {
            fputcsv($fh, [
                $r['first_name'] . ' ' . $r['last_name'], $r['street'], $r['house_number'], $r['postcode'], $r['city'], 'NL',
                $r['email'], $r['phone'], $r['id'] ? 'KH-' . $r['id'] : 'voorlopig',
                number_format((float) cfg('sendcloud.weight_per_bag_kg', 0.3) * (int) $r['bags'], 3, '.', ''),
                $r['bags'], $r['batch_code'] ?: ('smaak ' . $r['flavour_month']), $r['delivery_date'], self::statusLabel($r['status']),
            ], ';', '"', '');
        }
        rewind($fh);
        return "\xEF\xBB\xBF" . stream_get_contents($fh); // BOM zodat Excel de accenten goed toont
    }

    public static function statusLabel(string $status): string
    {
        return [
            'voorlopig' => 'Voorlopig',
            'wacht_op_betaling' => 'Wacht op betaling',
            'betaald' => 'Betaald',
            'betaling_mislukt' => 'Betaling mislukt',
            'verzonden' => 'Verzonden',
            'geannuleerd' => 'Geannuleerd',
        ][$status] ?? $status;
    }
}
