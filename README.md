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

`npm start` führt vor dem Server **`prisma migrate deploy`** aus (inkrementelle Prod-Migrationen).

### Einmaliger Schema-Reset (Task-Split)

Die aktuelle Baseline (`20260808140000_init_task_split`) ist nicht kompatibel mit der alten `Task`+`kind`-DB. Einmalig Prod leeren, dann neu migrieren + seeden:

1. Im Render-Dashboard: **Web Service → Shell** öffnen (oder lokal mit der Prod-`DATABASE_URL`).
2. Ausführen:

```bash
npx prisma migrate reset --force
```

Das droppt die DB, wendet alle Migrationen an und startet `npm run db:seed`.

3. Danach App neu starten / Deploy abwarten. Login wie nach lokalem Seed (`admin@team.local` / `admin1234`, sofern keine `SEED_*` Env Vars gesetzt sind).

**Achtung:** Alle Prod-Daten gehen verloren. Spätere Deploys brauchen nur noch `migrate deploy` (automatisch via `npm start`).

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
