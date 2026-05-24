-- hand-written: ALTER on partitioned core.events; partitions inherit columns automatically.
-- Stores W3C trace context (RFC 9110 traceparent/tracestate) captured at emit time so
-- the dispatcher can restore it for the subscriber, linking spans across the bus.
ALTER TABLE core.events ADD COLUMN IF NOT EXISTS trace_parent text;
ALTER TABLE core.events ADD COLUMN IF NOT EXISTS trace_state text;
