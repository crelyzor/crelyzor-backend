# Phase 5 Encryption — Swap Migration

This migration drops the original plaintext columns and renames the BYTEA
`<col>_enc` staging columns from migration `20260522000000_phase5_encryption_at_rest`
into their final positions.

**Do not apply this migration directly with `prisma migrate deploy`.** It will
fail-fast if the staging columns aren't populated. The supported workflow is:

```bash
pnpm phase5:migrate
```

Which executes:

1. `M1` (`20260522000000_phase5_encryption_at_rest`) — adds DEK infrastructure,
   blind-index columns, and `<col>_enc` staging columns alongside the existing
   plaintext columns.
2. `pnpm phase5:backfill` — generates DEKs for any users missing one, then
   reads every plaintext field and writes the encrypted ciphertext into the
   matching `<col>_enc` staging column.
3. `M2` (this migration) — verifies every plaintext row has a populated
   `<col>_enc` partner, then drops the plaintext columns and renames the
   staging columns into their place.

If M2 is applied before backfill, the `DO $$ ... RAISE EXCEPTION` block at the
top fires and the transaction rolls back — no data loss. You can recover via:

```bash
pnpm prisma migrate resolve --rolled-back 20260522000001_phase5_encryption_swap
pnpm phase5:migrate
```
