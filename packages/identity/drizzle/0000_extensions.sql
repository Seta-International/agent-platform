-- hand-written: drizzle pgTable cannot express CREATE EXTENSION.
-- Runs before 0000_identity_baseline.sql (lexical order); the baseline emits CREATE SCHEMA.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
