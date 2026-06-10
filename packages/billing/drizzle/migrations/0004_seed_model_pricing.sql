-- hand-written: seed initial global model prices (data seed; drizzle models DDL only).
-- Idempotent: re-running never overwrites operator edits.
INSERT INTO billing.model_pricing (model_key, unit_price_in, unit_price_out, currency) VALUES
  ('openai/gpt-5.5',                  0.00000125, 0.00001,  'USD'),
  ('anthropic/claude-opus-4-8',       0.000005,   0.000025, 'USD'),
  ('openai/text-embedding-3-small',   0.00000002, 0,        'USD'),
  ('mock',                            0,          0,        'USD')
ON CONFLICT (model_key) DO NOTHING;
