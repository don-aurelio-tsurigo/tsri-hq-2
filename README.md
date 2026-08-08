# Tsüri HQ 2.0

Internes Team-HQ für Tsüri — Redaktion, Projekte, Tasks und Büro-Pläne.

## Stack

- Next.js (App Router) + TypeScript
- PostgreSQL + Prisma
- Better Auth (Passwort + Magic Link)
- Tailwind CSS

## Schnellstart

1. **Lokale Postgres** (ohne Docker):

```bash
npx prisma dev --name teamhub
```

Die angezeigte `DATABASE_URL` in `.env` eintragen (siehe `.env.example`).

2. **Abhängigkeiten & Schema:**

```bash
npm install
npm run db:migrate
npm run db:seed
```

3. **Dev-Server:**

```bash
npm run dev
```

Login nach Seed:

- E-Mail: `admin@team.local`
- Passwort: `admin1234`

## Deploy (Render)

### Einmaliger Schema-Reset (Task-Split)

Die Baseline (`20260808140000_init_task_split`) ist nicht kompatibel mit der alten `Task`+`kind`-DB. **`migrate deploy` im Start-Command scheitert**, solange die alte Schema-History noch da ist — deshalb erst Deploy (ohne migrate), dann Reset:

1. Neuesten `main`-Deploy abwarten (Start-Command nur `next start`).
2. Render: **Web Service → Shell**, dann:

```bash
npx prisma migrate reset --force
```

Das droppt die DB, wendet alle Migrationen an und führt `npm run db:seed` aus.

3. App neu starten (Manual Deploy / Restart). Login: `admin@team.local` / `admin1234` (oder `SEED_*` Env Vars).

**Achtung:** Alle Prod-Daten gehen verloren.

Danach für künftige Deploys im Render-Dashboard unter **Settings → Pre-Deploy Command** (oder Start Command) eintragen:

```bash
npx prisma migrate deploy
```

bzw. Start: `npx prisma migrate deploy && next start`. Lokal/Scripts: `npm run db:deploy`.

## Kernkonzept

- **Organisation** mit Rollen `admin` / `member`
- Jede Person ist ein **voller Account** (kein Gast)
- Beim Beitritt: automatisch **Personal Space** (privat)
- **Team Spaces**: Team, Redaktion, Büro, Wiki, Projekte
- **Meine Inbox**: private Tasks + zugewiesene Team-Tasks
- Einladungen unter `/settings/members` (nur Admin)

## Nächste Phasen

- Phase 2: Redaktions-Kanban (`kind=article` + Stages), Projekt-Spaces
- Phase 3: Wiki-Seiten, Chores-/Kochplan-Views
- Phase 4: Notifications, feinere Rechte, CMS-Anbindung
