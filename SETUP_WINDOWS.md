# Windows 10/11 + VS Code + PowerShell — setup

No Docker required.

## 1. Install software

1. Install **Node.js LTS 22 or newer** from https://nodejs.org/ . Restart PowerShell, run `node -v` and `npm -v`.
2. Install **PostgreSQL 15+** from https://www.postgresql.org/download/windows/ . Remember the database superuser password. pgAdmin is optional.
3. Install **VS Code** from https://code.visualstudio.com/ .

## 2. Create local database

Use pgAdmin Query Tool or PostgreSQL SQL Shell:

```sql
CREATE USER worksphere_user WITH PASSWORD 'REPLACE_WITH_A_LOCAL_DEVELOPMENT_PASSWORD';
CREATE DATABASE worksphere OWNER worksphere_user;
```

For production, do not use passwords in shared SQL logs or shell history. Use the database provider's secure credentials management.

## 3. Configure project

Extract the ZIP, then in PowerShell:

```powershell
cd .\WorkSphere
code .
Copy-Item .env.example .env
notepad .env
```

Set `DATABASE_URL` with your local connection string and replace `JWT_SECRET` with an unpredictable 48+ character secret. Example:

```dotenv
DATABASE_URL="postgresql://worksphere_user:YOUR_PASSWORD@localhost:5432/worksphere?schema=public"
JWT_SECRET="PUT_A_SECURE_RANDOM_SECRET_WITH_AT_LEAST_48_CHARACTERS_HERE"
APP_ORIGIN="http://localhost:5173"
API_PORT=4000
NODE_ENV=development
```

PowerShell secure random secret:

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Use its output as `JWT_SECRET` (keep it private).

## 4. Install dependencies, migrate and seed

You need internet access to the npm registry for this step.

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

If Prisma reports schema drift, use a NEW empty database. `db:migrate` applies the migration SQL already checked into `prisma/migrations`. **Never use `prisma migrate reset` on a database containing important records.**

## 5. Start application

```powershell
npm run dev
```

Frontend: http://localhost:5173

Backend: http://localhost:4000/api/health

Development login: `admin@worksphere.local` / `WorkSphere@12345` (unless `DEMO_PASSWORD` overrides it). Try `employee@worksphere.local` and `manager@worksphere.local` to view their roles.

## 6. Check project and tests

```powershell
npm run typecheck
npm run test
npm run build
```

Vitest business-rule unit tests are under `backend/src/lib/workflow.test.ts`. Browser/E2E integration and real database workflow tests require more configuration and are **not represented as passing** in this archive. Review `IMPLEMENTATION_STATUS.md`.

## 7. Troubleshooting

**`P1001: Can't reach database`:** Check PostgreSQL service is running, username/password and port 5432.

**Prisma Client missing:** Run `npm run db:generate` after installation.

**Login returns 401:** Run the seed on a development DB and use the matching credentials. Ensure seed is not disabled via `NODE_ENV=production`.

**Frontend cannot access API:** Both servers must be started. Vite proxies `/api` to localhost:4000.

**CSRF error:** Use the frontend UI for requests; do not call mutating API routes without the CSRF cookie and matching request header.

**Port already used:** Stop the competing service before running `npm run dev`.

**SMTP not configured:** Password reset links are printed only to the **development** backend console. In production, configure SMTP.

## 8. Deploy

See `DEPLOYMENT.md` and complete the security and data-protection checklist before handling actual employee information.
