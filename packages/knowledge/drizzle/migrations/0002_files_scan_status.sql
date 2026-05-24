-- Adds AV-scan tracking columns to knowledge.files.
-- scan_status is the gate that the parse pipeline reads — files cannot
-- transition past 'uploading' into parsing until the scan job marks them clean.

ALTER TABLE knowledge.files
  ADD COLUMN scan_status text NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending','scanning','clean','infected','error')),
  ADD COLUMN scan_at    timestamptz,
  ADD COLUMN scan_detail text;

CREATE INDEX files_scan_status
  ON knowledge.files (scan_status)
  WHERE scan_status IN ('pending','scanning','error');
