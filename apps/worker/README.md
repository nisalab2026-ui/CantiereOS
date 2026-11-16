# apps/worker — Processi asincroni

**Non ancora creato** (fase 2+, vedi `docs/ARCHITECTURE.md` §7).

Responsabilità previste: PDF, OCR, AI, anteprime file, antivirus, import massivi, email/push,
promemoria e manutenzioni programmate.

Regole: ogni job porta `tenant_id`, `actor_user_id`, `request_id`; è idempotente; ogni query
filtra per `tenant_id` anche se il ruolo `service_role` bypassa RLS.
