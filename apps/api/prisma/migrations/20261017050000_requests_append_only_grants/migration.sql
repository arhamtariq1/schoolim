-- Make the request tables' grants actually narrow.
--
-- 20261017040000 ended with `GRANT SELECT, INSERT ON request_events, ...`. That
-- only adds: this database gives the application role every privilege on every
-- table the owner creates (ALTER DEFAULT PRIVILEGES ... GRANT ALL TO ilm_app),
-- so the narrow grant removed nothing and the "append-only" timeline could
-- still be UPDATEd and DELETEd by the application.
--
-- Found by the end-to-end suite asserting exactly that. The pattern that works
-- is the one `staff_salary_payments` uses: revoke everything, then grant what
-- is meant.
--
-- Reversal (forward-only; manual rollback):
--   GRANT ALL ON "requests", "request_events", "request_attachments" TO ilm_app;

REVOKE ALL ON "requests", "request_events", "request_attachments" FROM ilm_app;

-- A request changes state, so it is updated; it is never deleted by the app.
GRANT SELECT, INSERT, UPDATE ON "requests" TO ilm_app;
-- The timeline and its pictures are history: written once.
GRANT SELECT, INSERT ON "request_events", "request_attachments" TO ilm_app;
