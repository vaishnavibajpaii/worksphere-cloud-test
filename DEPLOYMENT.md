# Deployment — WorkSphere

## Architecture

- React/Vite static frontend served via Cloudflare Pages, Netlify, Nginx or similar.
- Node.js/Express API service running on a host with reliable persistent process and HTTPS.
- PostgreSQL server/database with encrypted traffic and backup/restore procedures.
- Private, durable storage mount or private object storage for uploaded file bytes.
- Optional SMTP server for password-reset messages.

## Build

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm run start -w backend
```

Frontend artifacts are in `frontend/dist/`. Serve those via any secure static site host with SPA fallback to `index.html`.

**API routing:** Browser requests to `/api/*` must reach Express. If the frontend and API are hosted on distinct domains, configure a same-site reverse proxy and cookie policies intentionally. Current cookies use `SameSite=Lax` and are designed for a same-origin `/api` reverse proxy.

## Production configuration

- `NODE_ENV=production`
- `JWT_SECRET`: unique high-entropy secret (48+ characters)
- `DATABASE_URL`: production connection string with TLS enabled and limited privileges
- `APP_ORIGIN`: exact HTTPS UI origin (no wildcard)
- `API_PORT`: container/service listening port
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: production reset email
- `UPLOAD_DIR`: persistent, private volume path

Do not run development seed in production. Provision the first administrator through an explicitly approved secure bootstrap process, not via the demo seed.

## Release checklist

- [ ] npm dependencies installed and audited
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Prisma migration verified against a staging PostgreSQL instance
- [ ] Auth/login, role restrictions, report review, leave balance and file access tested in staging
- [ ] HTTPS + reverse proxy + correct CORS and cookie semantics
- [ ] Production SMTP configured
- [ ] Private persistent file storage configured, upload scanning installed
- [ ] Database backup + restore drill completed
- [ ] Secrets in secret manager, not repository
- [ ] Monitoring, log rotation and incident response procedures configured
- [ ] Personal-data access, retention and local labor/privacy compliance reviewed
- [ ] No development credentials or records in production

**The code archive has not passed this release checklist.** See `IMPLEMENTATION_STATUS.md`.
