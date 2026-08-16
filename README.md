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

`npm start` führt Migrationen vor dem Server aus. Die Migration `member_usage` ist idempotent; ein schmales Recover-Skript löst nur den bekannten Failed-State (Enum schon vorhanden / P3009) und ruft danach `prisma migrate deploy` auf.

Schema-Änderungen nur über Prisma-Migrationen — kein `db push` gegen Prod.

Seed-Login (`admin@team.local`) ist nur für lokale Entwicklung.

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
