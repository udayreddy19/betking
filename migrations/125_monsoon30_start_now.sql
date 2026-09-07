-- Open MONSOON30 immediately (was scheduled for 8 Sep 2026).

UPDATE promotions
SET starts_at = TIMESTAMPTZ '2026-09-07 00:01:00+05:30',
    expires_at = TIMESTAMPTZ '2026-09-21 23:59:00+05:30',
    status = 'ACTIVE'
WHERE code = 'MONSOON30';
