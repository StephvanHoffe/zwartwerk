<?php
/*
 * Leverschema — dezelfde rekenregels als schedule() in assets/js/main.js.
 *
 * Elke 'periode' is een maand vanaf de startdatum (anchor) en heeft één smaak.
 * De levering valt op de eerste dinsdag vanaf die datum. Bij 2× per maand komt
 * er 14 dagen later een tweede levering met dezelfde bonen.
 */
declare(strict_types=1);

final class Schedule
{
    public static function perMonth(string $freq): int
    {
        return $freq === '2m' ? 2 : 1;
    }

    public static function addMonths(DateTimeImmutable $d, int $n): DateTimeImmutable
    {
        $day = (int) $d->format('j');
        $first = $d->modify('first day of this month')->modify(($n >= 0 ? '+' : '') . $n . ' month');
        $last = (int) $first->format('t');
        return $first->setDate((int) $first->format('Y'), (int) $first->format('n'), min($day, $last));
    }

    public static function toTuesday(DateTimeImmutable $d): DateTimeImmutable
    {
        while ((int) $d->format('N') !== 2) {
            $d = $d->modify('+1 day');
        }
        return $d;
    }

    /** Eerste levering: eerstvolgende dinsdag, minimaal $minDays vooruit. */
    public static function firstDeliveryDate(DateTimeImmutable $today, int $minDays): DateTimeImmutable
    {
        return self::toTuesday($today->modify('+' . $minDays . ' days'));
    }

    /**
     * Geeft de eerstvolgende $count leverdata vanaf $from (inclusief).
     * @param array $sub met anchor (Y-m-d), freq en skipped (array van Y-m-d)
     * @return array<int, array{date: DateTimeImmutable, period: int, new_flavour: bool, flavour_month: string}>
     */
    public static function upcoming(array $sub, DateTimeImmutable $from, int $count): array
    {
        $anchor = new DateTimeImmutable($sub['anchor']);
        $per = self::perMonth($sub['freq']);
        $skipped = array_flip($sub['skipped'] ?? []);
        $out = [];
        for ($k = 0; count($out) < $count && $k < 240; $k++) {
            $base = self::toTuesday(self::addMonths($anchor, $k));
            for ($j = 0; $j < $per; $j++) {
                $d = $base->modify('+' . ($j * 14) . ' days');
                if ($d >= $from && !isset($skipped[$d->format('Y-m-d')])) {
                    $out[] = [
                        'date' => $d,
                        'period' => $k,
                        'new_flavour' => $j === 0,
                        'flavour_month' => $base->format('Y-m'),
                    ];
                }
                if (count($out) >= $count) {
                    break;
                }
            }
        }
        return $out;
    }

    public static function nextAfter(array $sub, DateTimeImmutable $date): DateTimeImmutable
    {
        return self::upcoming($sub, $date->modify('+1 day'), 1)[0]['date'];
    }

    /** Informatie over een specifieke leverdatum (periode, smaakmaand). */
    public static function infoFor(array $sub, DateTimeImmutable $date): ?array
    {
        $list = self::upcoming($sub, $date, 1);
        if ($list && $list[0]['date']->format('Y-m-d') === $date->format('Y-m-d')) {
            return $list[0];
        }
        return null;
    }

    /** Laatste dag waarop je nog kunt wijzigen voor een levering. */
    public static function deadline(DateTimeImmutable $date, int $cancelDays): DateTimeImmutable
    {
        return $date->modify('-' . $cancelDays . ' days');
    }

    public static function isLocked(DateTimeImmutable $date, DateTimeImmutable $today, int $cancelDays): bool
    {
        return $today > self::deadline($date, $cancelDays);
    }
}
