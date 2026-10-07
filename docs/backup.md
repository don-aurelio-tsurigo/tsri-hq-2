# Backups & Wiederherstellung

Zwei voneinander unabhängige Ebenen:

| Ebene | Wo | Zeitraum | Wofür |
|---|---|---|---|
| **Render PITR** | Render (Professional Workspace) | letzte 7 Tage, sekundengenau | schneller Restore auf einen exakten Zeitpunkt |
| **Eigene Dumps** | Cloudflare R2, Backup-Bucket | 35 Tage täglich, ~13 Monate monatlich | Fehler, die spät auffallen; Ausfall/Löschung bei Render |

Die DAM-Dateien im normalen R2-Bucket sind von beidem **nicht** erfasst.

## Einrichtung (einmalig)

### 1. API-Token für den Backup-Bucket

Cloudflare Dashboard → **R2 Object Storage** → **Overview** → rechts **Manage API tokens** (bzw. Menü «{} API» → *Manage API tokens*) → **Create Account API token**:

- **Permissions:** Object Read & Write
- **Specify bucket(s):** *Apply to specific buckets only* → nur den Backup-Bucket
- **TTL:** Forever

Nach dem Erstellen werden **Access Key ID** und **Secret Access Key** angezeigt. Das Secret ist nur einmal sichtbar und gehört direkt in GitHub, siehe Schritt 3. Die **Account ID** steht auf der R2-Overview-Seite.

Nicht den Token der App (`R2_*`) wiederverwenden. Der Backup-Token darf nur in den Backup-Bucket schreiben.

### 2. Bucket-Regeln (Backup-Bucket → Settings)

**Object lifecycle rules** (übernehmen das Aufräumen):

| Prefix | Löschen nach |
|---|---|
| `daily/` | 35 Tagen |
| `monthly/` | 400 Tagen |
| `manual/` | 90 Tagen |

**Bucket lock rules** (Schutz gegen Löschen, auch mit gestohlenem Token): Regel ohne Prefix mit 30 Tagen Retention.

### 3. GitHub Secrets

GitHub → Repo `tsri-hq-2` → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Wert |
|---|---|
| `BACKUP_DATABASE_URL` | Render → Datenbank → *Connect* → **External Database URL** |
| `BACKUP_R2_ACCOUNT_ID` | Cloudflare Account ID |
| `BACKUP_R2_BUCKET_NAME` | Name des Backup-Buckets |
| `BACKUP_R2_ACCESS_KEY_ID` | aus Schritt 1 |
| `BACKUP_R2_SECRET_ACCESS_KEY` | aus Schritt 1 |
| `BACKUP_R2_ENDPOINT` | **nur bei EU-Bucket** (Bucket → Settings → *S3 API*): `https://<account-id>.eu.r2.cloudflarestorage.com` |

Falls bei der Render-Datenbank unter *Networking* der Zugriff auf IPs eingeschränkt ist, muss GitHub Actions zugelassen sein (`0.0.0.0/0`, Zugriff ist trotzdem passwortgeschützt).

### 4. Testen

GitHub → **Actions → DB Backup → Run workflow**. Danach liegt im Bucket `manual/<zeitstempel>.dump`.

Der Workflow läuft danach jede Nacht (02:30 UTC). Wenn er fehlschlägt, schickt GitHub eine E-Mail an die Person, die den Workflow zuletzt geändert hat.

## Manuelles Backup vor riskanten Migrationen

Vor Migrationen, die Spalten oder Tabellen löschen oder umbenennen: **Actions → DB Backup → Run workflow** mit Prefix `pre-migration`, abwarten, dann mergen.

## Wiederherstellung

### A) Render PITR (Fehler liegt < 7 Tage zurück)

1. Render → Datenbank → **Recovery** → *Restore* → Zeitpunkt **kurz vor** dem Fehler wählen.
2. Render erstellt eine **neue** Datenbank. Die alte bleibt unverändert.
3. Neue Datenbank prüfen, z.B. lokal mit `psql "<External URL>"`.
4. Im Web Service → *Environment* → `DATABASE_URL` (und ggf. `RAG_DATABASE_URL`) auf die **Internal URL** der neuen Datenbank setzen → Deploy.
5. Alte Datenbank erst nach einigen Tagen löschen.

### B) Aus einem Dump in R2

1. Dump aus dem Backup-Bucket herunterladen (Cloudflare Dashboard → Bucket → Datei → *Download*).
2. In Render eine neue, leere Postgres-Datenbank anlegen (gleiche Region, gleiche oder neuere Version).
3. Einspielen (`pg_restore` in einer Version ≥ dem `pg_dump`, z.B. via `brew install postgresql@18`):

   ```bash
   pg_restore --no-owner --no-acl --exit-on-error -d "<External URL der neuen DB>" backup.dump
   ```

   Falls `CREATE EXTENSION vector` fehlschlägt: vorher `psql "<URL>" -c 'CREATE EXTENSION IF NOT EXISTS vector;'` ausführen.
4. Prüfen, dann wie bei A) Schritt 4 `DATABASE_URL` umstellen.

Einzelne Tabellen statt der ganzen Datenbank: in eine **separate** Datenbank einspielen und die betroffenen Zeilen gezielt zurückkopieren. Nie direkt über die Produktion restoren.

## Restore-Probe

Automatisch am 2. jedes Monats (**Actions → DB Restore-Probe**, auch manuell startbar): Der neueste Dump wird in eine Wegwerf-Postgres (pgvector, PG 18) im GitHub-Runner eingespielt, danach geprüft:

- Restore läuft ohne Fehler durch
- neuester Dump ist höchstens 48 h alt (fängt ein ausgefallenes Nachtbackup ab)
- `user` und `_prisma_migrations` sind nicht leer
- keine Migration aus dem Repo fehlt im Dump (ausser neueren als der Dump)

Schlägt die Probe fehl, kommt eine E-Mail von GitHub. Script: `scripts/db-restore-check.ts`.
