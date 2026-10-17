# Premium UI Upgrade (17 October 2026)

**If you are upgrading an already-running WorkSphere on Windows:** read [`PREMIUM_UI_UPGRADE_GUIDE.md`](PREMIUM_UI_UPGRADE_GUIDE.md) before copying anything. Use `tools/Apply-Premium-UI.ps1` to back up and replace **only frontend source**. Do not overwrite your PostgreSQL database, `.env`, backend or Prisma directory. See [`docs/PREMIUM_UI_VALIDATION.md`](docs/PREMIUM_UI_VALIDATION.md) for verified checks and limitations.

---

# WorkSphere — Smart Employee & Company Management

Warm-light responsive React + TypeScript employee work platform with an Express/Prisma/PostgreSQL API.

## What's here

- **Five seeded user roles**: Super Admin, HR Admin, Manager, Team Leader and Employee. Authenticated sessions, rotating refresh tokens, in-app notification center, API permission checks and manager-scoped employee/report access.
- **Daily reports**: multiple entries, attachments, save draft, submit, manager approval/rejection/return, historical snapshots, locked approved reports and admin reopen action.
- **Tasks and projects**: create and assign tasks, update status/progress, comment, time log, list and Kanban views, project cards and status tracking.
- **Employee directory**: add, edit, assign manager and role, deactivate employees via backend API. Attendance check-in/out, leave requests and reviews, leave balance and holidays.
- **Master data / company admin**: branch, department, designation, team, leave type; configurable generic master catalog; branding and basic reporting policies, editable role permissions, audit logs.
- **Reports**: live dashboard aggregations and CSV/XLSX/PDF work-report exports.
- **Responsive UI**: design uses warm terracotta, peach sidebar and cream cards; adaptive layout and mobile bottom navigation.

**Important:** This is a substantial working-code foundation, not a certified production release or an implementation of every feature in the supplied 1,049-line specification. Read `IMPLEMENTATION_STATUS.md` before using it for real employee records. Dependencies, builds, migrations and live workflows could not be executed in the creation environment because npm registry access and a PostgreSQL server were unavailable.

## Requirements

- Node.js 22+ and npm 10+
- PostgreSQL 15+ (local install or managed instance)
- VS Code (recommended)
- No Docker required

## Quick start

```powershell
cd WorkSphere
Copy-Item .env.example .env
# Edit .env: DATABASE_URL and secure JWT_SECRET
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:5173** and API **http://localhost:4000/api/health**.

For detailed Windows help, see `SETUP_WINDOWS.md`. Production deployment instructions are in `DEPLOYMENT.md`.

## Development-only demo accounts

**Run the seed only on a disposable development database.** Default seed password is `WorkSphere@12345`, unless overridden via `DEMO_PASSWORD`:

| Role | Email |
|------|-------|
| Super Admin | admin@worksphere.local |
| HR Admin | hr@worksphere.local |
| Manager | manager@worksphere.local |
| Employee | employee@worksphere.local |

Change all credentials and provision real users securely before staging or production. **Never run `npm run db:seed` in a production environment.**

## Development commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run frontend at 5173 and backend at 4000 |
| `npm run typecheck` | Type-check frontend and backend |
| `npm run build` | Generate Prisma Client and build both workspaces |
| `npm run test` | Run Vitest suites (must install deps first) |
| `npm run db:migrate` | Apply committed PostgreSQL migrations |
| `npm run db:dev` | Make a new Prisma migration in development |
| `npm run db:seed` | Seed **development only** demo users and data |

## Key source folders

```text
WorkSphere/
├── backend/src/
│   ├── lib/            # Database connection, auth, permissions, workflow rules
│   ├── routes/         # API route modules
│   └── server.ts       # Express app entry point
├── frontend/src/
│   ├── components/     # Layout and shared UI
│   ├── lib/            # Typed API helper + authentication state
│   ├── pages/          # Work and HR application screens
│   └── styles.css      # Warm-light design system + responsive breakpoints
├── prisma/
│   ├── schema.prisma
│   ├── migrations/     # Versioned initial SQL
│   └── seed.ts
├── docs/
│   └── SECURITY.md
├── SETUP_WINDOWS.md
├── DEPLOYMENT.md
└── IMPLEMENTATION_STATUS.md
```

## Core lifecycle

1. Admin sets up organization, departments, roles, project and reporting manager relationships.
2. Manager creates tasks assigned to their authorized team.
3. Employee logs in, saves a daily report, optionally uploads evidence, submits.
4. Manager sees pending reports in dashboard and reviews: approve, reject or request changes.
5. Returned reports can be revised; approved reports stay locked unless Super Admin reopens them.
6. HR receives optional notifications, sees company dashboards and can review leave requests.

## Privacy and data

Uploaded files are saved locally by default and are not exposed as a public static folder; access is authenticated. Before storing sensitive employee documents, configure durable private storage, virus scanning, backups, retention and legal/privacy reviews. Avoid sensitive personal data in generic notes.

## Scope caveats

See `IMPLEMENTATION_STATUS.md` for what is implemented, partial or not included. The settings master is persistent but not all possible settings affect every relevant workflow yet. SMTP, database and file storage need valid deployment configuration. Local `node_modules/`, real `.env` files, upload files and passwords are not included in this archive.
