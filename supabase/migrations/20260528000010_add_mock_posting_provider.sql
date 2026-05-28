-- Add 'mock' to posting_provider enum for testing without real Zernio/Browser-Use.
-- Postgres doesn't allow ALTER TYPE … ADD VALUE inside a transaction, so this
-- migration must run standalone (apply-migrations.mjs commits per-migration → OK).

alter type posting_provider add value if not exists 'mock';
