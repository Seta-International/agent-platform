-- Drizzle's text({enum}) is a type-only hint and does not emit CHECK
-- constraints, so this is hand-written. 0001's files_status_check predates the
-- chat-attachment lifecycle and still rejects the 'uploaded'/'consumed'
-- statuses that 0005 added at the type level only — making
-- markChatAttachmentUploaded()/markAttachmentsConsumed() fail at runtime.
-- Widen the constraint to the full status set declared in schema.ts.

ALTER TABLE knowledge.files DROP CONSTRAINT files_status_check;

ALTER TABLE knowledge.files
  ADD CONSTRAINT files_status_check
  CHECK (status IN ('uploading','uploaded','consumed','parsing','embedding','ready','failed'));
