This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Lernarena Plattform Erweiterungen

Gamifizierte Lernplattform mit MongoDB & next-auth. Unterstützte Lektionstypen: single-choice, multiple-choice, matching, memory, lueckentext, markdown, video (YouTube), text.

### Fortschritt & Normalisierung

`completedLessons` speichert jetzt nur `lessonId`. Legacy-Einträge im Format `courseId-lessonId` werden beim Abschluss / Speichern oder per Admin-Endpoint normalisiert.

### Admin / Maintenance Endpoints

| Endpoint | Methode | Zweck |
|----------|---------|-------|
| `/api/admin/audit` | GET | Audit Logs filtern (action, user, targetType, targetId, courseId, since, limit) |
| `/api/admin/audit` | POST | Manueller Audit-Eintrag |
| `/api/admin/audit/cleanup` | DELETE | Löscht Audit Logs älter als X Tage (`days` Query, Default 90) |
| `/api/admin/normalize-progress` | POST | Normalisiert `completedLessons` (Dry-Run via `?dry=1`) |

Automatisch geloggte Aktionen: `lesson.create`, `lesson.update`, `lesson.delete`, `lesson.complete`, `course.delete`.

### Rate Limiting (Geplant / Platzhalter)

In-Memory-Limitierung für Admin-Routen kann via zukünftige Middleware ergänzt werden (ENV Vorschlag: `ADMIN_RATE_LIMIT_POINTS`, `ADMIN_RATE_LIMIT_WINDOW_MS`).

### Beispiel Queries
```
GET /api/admin/audit?action=lesson.create&limit=20
GET /api/admin/audit?user=Kopernikus&since=2025-08-01T00:00:00.000Z
POST /api/admin/normalize-progress?dry=1
DELETE /api/admin/audit/cleanup?days=120
```

### Todos / Weiteres
- Optional: Admin API Key Absicherung
- Verteilt skalierbares Rate Limit (Redis)
- Geplanter Cron für regelmäßiges Audit-Cleanup
- Tests für Parser & Admin Endpoints

---

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Hinweis: package.json Reparatur (Vercel Blob Runtime)

In der aktuellen Historie war `package.json` beschädigt (eine Shell-Zeile landete außerhalb von `scripts`). Dadurch fehlen zur Laufzeit teils Abhängigkeiten wie `@vercel/blob`-Transitives (`undici`, `async-retry`, `bytes`).

• Eine korrigierte Datei liegt als `package.fixed.json` bei. Bitte ersetze die bestehende `package.json` mit deren Inhalt und führe anschließend `npm i` aus.

• In `next.config.ts` sind unter `outputFileTracingIncludes['/api/media']` die Node-Module `@vercel/blob`, `undici`, `async-retry`, `bytes` explizit aufgenommen, damit sie im Standalone-Bundle landen.

### Vercel Deployment Hinweise

1. Environment Variablen im Vercel Projekt setzen:
	- `MONGODB_URI` (Connection String)
	- `NEXTAUTH_SECRET` (starker zufälliger String, z.B. `openssl rand -base64 32`)
	- `NEXTAUTH_URL` (Produktions-URL, z.B. https://lern-arena.vercel.app)
	- `ADMIN_API_KEY` (optional: erlaubt Server-zu-Server Zugriff auf /api/admin ohne Session)
	- `ADMIN_RATE_LIMIT_POINTS` (optional, Default 60)
	- `ADMIN_RATE_LIMIT_WINDOW_MS` (optional, Default 60000)
2. Optional weitere Variablen für zukünftige Features (Rate Limiting, Analytics).
3. Build Output ist `standalone` (siehe `next.config.ts`). Vercel erstellt automatisch Functions.
4. Healthcheck Endpoint: `/api/health` liefert `{ ok: true }`.
5. Sicherheit: Security Headers & CSP sind in `next.config.ts` gesetzt. Falls externe Domains (Bilder, Medien) genutzt werden, CSP & `images.remotePatterns` ergänzen.
6. Datenbank: MongoDB Atlas oder kompatibler Dienst empfohlen. Network Access: Vercel IP Ranges whitelisten oder `0.0.0.0/0` (weniger sicher) + Benutzer mit minimalen Rechten.
7. Skalierung: Mongoose Connection wird gecached (`src/lib/db.ts`).
8. Fehleranalyse: Logs via Vercel Dashboard. Zusätzliche Audit Logs unter `/api/admin/audit` (auth erforderlich).
9. Performance: Editor modularisiert (dynamische Imports) zur Reduktion First Load JS.
10. Weiterer Hardening Vorschlag: `NEXT_PUBLIC_` Variablen streng minimieren (derzeit keine zusätzlichen nötig).

### GitHub CI

Automatischer Build Workflow unter `.github/workflows/ci.yml`:
- Install → Lint → Typecheck (nicht-blockierend) → Build
- Artefakt Upload (.next) zur schnellen Analyse

Secrets in GitHub Repository Settings > Secrets and variables > Actions:
- `MONGODB_URI` (für realistischen Build – sonst Dummy URI)
- Optional weitere (werden derzeit nicht benötigt für Build)

### Admin Security & Rate Limiting

Die Endpunkte unter `/api/admin/*` sind geschützt durch:
1. Middleware Role Check (erlaubt: `author` oder `admin` Rolle in JWT)
2. Optionaler API Key Header `x-api-key: <ADMIN_API_KEY>` (z.B. für Cron Jobs)
3. In-Memory Rate Limit (Token Bucket): Standard 60 Requests pro 60s pro IP (X-Forwarded-For erstes Segment). Konfigurierbar via ENV.

Hinweis: In-Memory Limiter ist nicht global synchronisiert (Edge / mehrere Lambdas). Für harte Limits Redis verwenden.

### Lokale Entwicklung vs Produktion

| Aspekt | Lokal | Produktion |
|--------|-------|------------|
| Auth URL | Automatisch | `NEXTAUTH_URL` setzen |
| Session Secret | Fallback Warnung | Muss gesetzt sein |
| DB Fehler bei Build | Lazy (kein Crash) | Warnung falls fehlt |
| Caching | Dev Hot Reload | Edge / Functions Cold Starts |
