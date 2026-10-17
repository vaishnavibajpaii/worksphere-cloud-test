# Security engineering notes

- Cookies: signed JWT access cookie (15 min) and opaque refresh session (7 days) with DB hash and rotation. The JS-readable CSRF cookie must match a request header on unsafe methods; protect same-origin hosting and exact CORS.
- Credentials: Argon2id password hashes. Reset token stored as SHA256 and time-limited; resets revoke sessions. Never enable seed in production.
- Authorization: API permission middleware plus object-level scope checks for direct reports. Review explicit `requireScope` coverage across each route before production rollout.
- Input: Zod on most write endpoints; Express JSON size limit, file type and 5MB upload guard. Signature magic-byte scanning and antivirus are not included.
- Auditing: Significant actions written to `AuditLog`; do not use audit logs alone as tamper-evident compliance evidence.
- Files: kept outside frontend public directory, auth-gated download and basic report-association checks. Migrate to private object storage for production.
- Risk: RBAC `primaryRole` and `UserRole` records must stay synchronized. Avoid direct database modifications bypassing services.
- Production readiness: implement all items in `DEPLOYMENT.md` and conduct threat model, PII retention, authentication and API authorization testing.
