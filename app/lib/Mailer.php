<?php
/*
 * E-mail via PHP mail() (werkt standaard op DirectAdmin-hosting).
 * Elke mail wordt ook gelogd in mail_log, zodat je in het beheer kunt zien wat er verstuurd is.
 */
declare(strict_types=1);

final class Mailer
{
    public static function send(string $to, string $subject, string $body): bool
    {
        $sent = false;
        if (cfg('mail.enabled', true)) {
            $fromName = '=?UTF-8?B?' . base64_encode((string) cfg('mail.from_name', 'Khoffie')) . '?=';
            $headers = [
                'From: ' . $fromName . ' <' . cfg('mail.from') . '>',
                'Reply-To: ' . cfg('mail.from'),
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
            ];
            $sent = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers), '-f' . cfg('mail.from'));
            if (!$sent) {
                log_msg('warning', 'E-mail kon niet worden verstuurd', ['to' => $to, 'subject' => $subject]);
            }
        }
        try {
            q('INSERT INTO mail_log (recipient, subject, body, sent) VALUES (?, ?, ?, ?)', [$to, $subject, $body, $sent ? 1 : 0]);
        } catch (Throwable $e) {
            // loggen mag nooit de hoofdactie laten mislukken
        }
        return $sent;
    }

    private static function footer(): string
    {
        return "\n\nKleine oplage. Groot verhaal.\nKhoffie\n" . cfg('base_url') . "\n" . cfg('mail.from');
    }

    private static function accountUrl(): string
    {
        return rtrim((string) cfg('base_url'), '/') . '/account.html';
    }

    public static function welcome(array $user, array $sub, DateTimeImmutable $first): void
    {
        $body = "Hoi {$user['first_name']},\n\n"
            . "Welkom bij Khoffie! Je betaling is gelukt en je abonnement is actief.\n\n"
            . "Je abonnement: " . ($sub['size'] === '500' ? '500 gram (2 zakken)' : '250 gram') . ', '
            . ($sub['freq'] === '2m' ? '2× per maand' : '1× per maand') . ", altijd hele bonen.\n"
            . "Je eerste zak komt op " . Format::date($first) . ". Welke bonen? Dat blijft een verrassing tot de brievenbus klepert.\n\n"
            . "In je account kun je pauzeren, overslaan, je abonnement aanpassen en je bonen beoordelen:\n" . self::accountUrl()
            . self::footer();
        self::send($user['email'], 'Welkom bij Khoffie ☕', $body);
    }

    public static function cancelled(array $user, ?DateTimeImmutable $last): void
    {
        $body = "Hoi {$user['first_name']},\n\n"
            . "We hebben je opzegging ontvangen. Jammer dat je gaat!\n"
            . ($last ? "Je laatste levering komt nog op " . Format::date($last) . ".\n" : "Er volgen geen leveringen en afschrijvingen meer.\n")
            . "\nJe kunt op elk moment weer instappen via je account. Je bonenhistorie bewaren we, zodat je geen smaak twee keer krijgt.\n"
            . self::accountUrl() . self::footer();
        self::send($user['email'], 'Bevestiging van je opzegging', $body);
    }

    public static function paymentFailed(array $user, int $cents): void
    {
        $body = "Hoi {$user['first_name']},\n\n"
            . "Het automatisch afschrijven van " . money($cents) . " voor je volgende Khoffie-levering is helaas niet gelukt.\n"
            . "Zolang de betaling openstaat, houden we je zak nog even vast. Log in op je account om het op te lossen, of mail ons:\n"
            . self::accountUrl() . self::footer();
        self::send($user['email'], 'Je betaling is niet gelukt', $body);
        self::send((string) cfg('mail.admin_to'), 'Mislukte betaling: ' . $user['first_name'] . ' ' . $user['last_name'], "Mislukte afschrijving van " . money($cents) . " voor {$user['email']}.\nBekijk het in het beheer: " . rtrim((string) cfg('base_url'), '/') . "/beheer/betalingen.php");
    }

    public static function passwordReset(array $user, string $token): void
    {
        $url = self::accountUrl() . '?reset=' . urlencode($token);
        $body = "Hoi {$user['first_name']},\n\n"
            . "Je hebt gevraagd om een nieuw wachtwoord. Via deze link stel je het in (de link is 1 uur geldig):\n\n$url\n\n"
            . "Heb je dit niet zelf gevraagd? Dan kun je deze mail negeren." . self::footer();
        self::send($user['email'], 'Nieuw wachtwoord instellen', $body);
    }

    public static function shipped(array $user, array $trackingUrls): void
    {
        $body = "Hoi {$user['first_name']},\n\n"
            . "Je koffie is onderweg naar je brievenbus!\n\n"
            . ($trackingUrls ? "Volg je zending:\n" . implode("\n", $trackingUrls) . "\n\n" : '')
            . "Proef, geniet en vergeet niet je bonen te beoordelen in je bonenpaspoort:\n" . self::accountUrl() . self::footer();
        self::send($user['email'], 'Je Khoffie is onderweg ☕', $body);
    }

    public static function orderConfirmed(array $user, array $order, DateTimeImmutable $date): void
    {
        $body = "Hoi {$user['first_name']},\n\n"
            . "Bedankt voor je bestelling! Je betaling is gelukt.\n\n"
            . "Je bestelling: " . ($order['size'] === '500' ? '500 gram (2 zakken)' : '250 gram (1 zak)') . " hele bonen, eenmalig.\n"
            . "We branden vers voor je en je koffie valt op " . Format::date($date) . " door de brievenbus. Welke bonen? Dat blijft een verrassing.\n\n"
            . "In je account zie je je bestelling en factuur. Smaakt het naar meer? Daar kun je ook een abonnement starten:\n" . self::accountUrl()
            . self::footer();
        self::send($user['email'], 'Bedankt voor je bestelling ☕', $body);
    }

    public static function adminNewOrder(array $user, array $order, DateTimeImmutable $date): void
    {
        self::send((string) cfg('mail.admin_to'), 'Nieuwe losse bestelling: ' . $user['first_name'] . ' ' . $user['last_name'],
            "Nieuwe losse bestelling!\n\n{$user['first_name']} {$user['last_name']} ({$user['email']})\n"
            . ($order['size'] === '500' ? '500 gram (2 zakken)' : '250 gram (1 zak)') . ', eenmalig, levering ' . Format::date($date)
            . "\n{$user['street']} {$user['house_number']}, {$user['postcode']} {$user['city']}\n\n"
            . rtrim((string) cfg('base_url'), '/') . '/beheer/klant.php?id=' . $user['id']);
    }

    public static function adminNewSubscriber(array $user, array $sub): void
    {
        self::send((string) cfg('mail.admin_to'), 'Nieuwe abonnee: ' . $user['first_name'] . ' ' . $user['last_name'],
            "Nieuwe abonnee!\n\n{$user['first_name']} {$user['last_name']} ({$user['email']})\n"
            . ($sub['size'] === '500' ? '500 gram' : '250 gram') . ', ' . ($sub['freq'] === '2m' ? '2× per maand' : '1× per maand')
            . "\n{$user['street']} {$user['house_number']}, {$user['postcode']} {$user['city']}\n\n"
            . rtrim((string) cfg('base_url'), '/') . '/beheer/klant.php?id=' . $user['id']);
    }
}

final class Format
{
    private const DAYS = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
    private const MONTHS = ['', 'januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

    public static function date(DateTimeInterface $d, bool $weekday = true): string
    {
        return ($weekday ? self::DAYS[(int) $d->format('N')] . ' ' : '') . $d->format('j') . ' ' . self::MONTHS[(int) $d->format('n')];
    }

    public static function monthName(string $ym): string
    {
        [$y, $m] = explode('-', $ym);
        return self::MONTHS[(int) $m] . ' ' . $y;
    }
}
