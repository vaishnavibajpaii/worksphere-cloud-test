# WorkSphere Premium UI Upgrade — Safe Windows Guide

This ZIP contains the complete WorkSphere source plus a premium visual upgrade. It was built using the **earlier WorkSphere ZIP from this conversation**, not from your latest local VS Code project. **Do not overwrite your current working database, `.env`, backend, or Prisma directory.**

## Recommended upgrade path (existing working WorkSphere)

1. Make sure you have a backup of the entire current project, including the working `.env` (keep secrets private). Back up your PostgreSQL database separately before deployment.
2. Extract `WorkSphere-Premium-UI-Upgrade.zip` into a **different folder** from the currently working project.
3. Stop `npm run dev` in the current VS Code terminal with `Ctrl+C`.
4. Open PowerShell inside the **newly extracted** `WorkSphere` upgrade folder and run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Apply-Premium-UI.ps1 -ProjectRoot "C:\Users\admin\Downloads\WorkSphere-Employee-Management-System\worksphere"
   ```

   Change the path if your working WorkSphere folder is somewhere else. This script creates a dated backup of affected frontend files **inside your existing project**, then copies only six frontend files. It will NOT copy `backend`, `prisma`, or `.env`.
5. Reopen your **existing working project** in VS Code and run:

   ```powershell
   npm run typecheck
   npm run dev
   ```

6. Open `http://localhost:5173`. Press `Ctrl+Shift+R` in Chrome to reload updated CSS.
7. Verify login, dashboard, report draft/submit, manager approve/return, Admin settings, and mobile widths before using the upgrade with real staff data.

## If you need to roll back

Use the backup path printed by the upgrade script (example folder shown below; change to the actual folder name):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Rollback-Premium-UI.ps1 -ProjectRoot "C:\Users\admin\Downloads\WorkSphere-Employee-Management-System\worksphere" -BackupFolder "C:\Users\admin\Downloads\WorkSphere-Employee-Management-System\worksphere\_ui_upgrade_backup_YYYYMMDD_HHMMSS"
```

If you're in the original working project when running rollback, change `-File` to the full path of the rollback script in your extracted upgrade ZIP.

## What changed

- `frontend/src/premium.css` (new): centralized warm-light design layer, typography, responsive cards/tables/forms, mobile modal work-report UI, print styling, focus and reduced-motion accommodations.
- `frontend/src/main.tsx`: loads the new CSS after the existing stylesheet.
- `frontend/src/components/Layout.tsx`: responsive premium navigation, profile menu, contextual page title, optional logo/favicon from Admin settings, keyboard Escape handling. Original routes, notification fetch and task search action retained.
- `frontend/src/pages/Dashboard.tsx` and `frontend/src/pages/Insights.tsx`: chart colors honor theme variables; no data sources or calculations changed.
- `frontend/index.html`: Inter and Plus Jakarta Sans font setup; updated theme color and description.
- `prisma/schema.prisma`: generator/datasource block *formatting only* fixed in the **full ZIP** because the earlier ZIP had a known P1012 parser error. The safe apply script explicitly leaves your working `prisma` file unchanged.
- `tools/Apply-Premium-UI.ps1` and `tools/Rollback-Premium-UI.ps1`: safe install and rollback.

**No backend files, database migrations, API routes, or report form payloads were edited.**

## Limits of verification

The frontend TypeScript/TSX syntax was parsed with TypeScript, and CSS was parsed for syntax problems. Dependencies could not be installed in the creation environment (npm registry timed out); therefore a complete Vite build, browser QA against an authenticated server, and report workflow regression tests **have not been run** here. Do not treat the visual upgrade as production-verified until the checks above pass in your local environment.

## Suggested branding values in Admin Settings

For the precise palette shown by this upgrade, you can set these from the existing Admin UI (do not update SQL or backend):

- Primary brand: `#B75F48`
- Sidebar background: `#F4EDE5`
- Page background: `#F8F7F4`

Leave existing values if you prefer your current branding.
