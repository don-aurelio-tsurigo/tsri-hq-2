# DAM Gesichtserkennung — Plan (AWS Rekognition)

Stand: 2026-10-05

## Ziel

Fotos im DAM (Staging und Archiv) werden automatisch auf Gesichter gescannt. Redaktion benennt
ein Gesicht einmal, danach wird die Person in allen anderen Fotos gefunden und vorgeschlagen.
Personen landen in einem eigenen Feld **«Personen»** am Asset und werden gleichzeitig als
**Keywords** gesetzt (damit Volltextsuche, Facetten und Exporte ohne Zusatzaufwand funktionieren).

## Grundentscheide

| Entscheid | Begründung |
|---|---|
| AWS Rekognition, Face Collection + **User Vectors** | Kein Modell im Render-Prozess; User Vectors bündeln mehrere Referenzfotos pro Person (`CreateUser`, `AssociateFaces`, `SearchUsers`). |
| **Alle** erkannten Gesichter indexieren (`IndexFaces`) | Nur so ist «neue Person → in allen alten Fotos finden» ein einziger `SearchFaces`-Call statt tausender Bild-Uploads. |
| `IndexFaces` statt `DetectFaces` + `IndexFaces` | `IndexFaces` liefert Bounding Box, Confidence und Qualität bereits mit → ein Call pro Bild. |
| Quelle der Wahrheit = DB (`AssetFace`, `AssetPerson`) | Keywords sind abgeleitet und werden bei jeder Änderung synchronisiert. |
| Durable Job-State via `Asset.faceStatus` + Scheduler | Kein separater Job-Table; überlebt Deploys/Restarts. Gleiches Muster wie `purge-scheduler.ts`. |
| Scan **unabhängig** von `processOneInner` | Der bestehende Prozess läuft nur für `staging/`-Originale ohne `width` — das Archiv würde nie gescannt. |

## Datenmodell (Prisma)

```prisma
enum FaceScanStatus {
  pending
  processing
  done
  failed
  skipped   // Opt-out oder kein Bild

  @@schema("public")
}

enum FaceMatchStatus {
  unassigned  // erkannt, niemand zugewiesen
  suggested   // Rekognition-Vorschlag unter Auto-Schwelle → Redaktion bestätigt
  confirmed   // zugewiesen (manuell oder Auto-Match über hoher Schwelle)
  rejected    // Vorschlag abgelehnt (siehe rejectedPersonIds)
  ignored     // «kein relevantes Gesicht» (Publikum, Hintergrund)

  @@schema("public")
}

enum AssetPersonSource {
  face    // abgeleitet aus bestätigtem AssetFace
  manual  // im Feld «Personen» von Hand gesetzt (z.B. Person von hinten)

  @@schema("public")
}

model DamPerson {
  id                String   @id @default(cuid())
  name              String   @unique
  rekognitionUserId String   @unique
  createdBy         String
  creator           User     @relation(fields: [createdBy], references: [id], onDelete: Restrict)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  faces  AssetFace[]
  assets AssetPerson[]

  @@map("dam_person")
  @@schema("public")
}

model AssetFace {
  id                String          @id @default(cuid())
  assetId           String
  asset             Asset           @relation(fields: [assetId], references: [id], onDelete: Cascade)
  rekognitionFaceId String?         @unique
  /// Normalisiert 0–1, bezogen auf den (EXIF-gedrehten) Master, NICHT auf editParams
  box               Json            // { left, top, width, height }
  confidence        Float
  sharpness         Float?
  status            FaceMatchStatus @default(unassigned)
  personId          String?
  person            DamPerson?      @relation(fields: [personId], references: [id], onDelete: SetNull)
  similarity        Float?
  /// userId bei manueller Zuweisung, null = Auto-Match
  assignedBy        String?
  /// Gesicht ist als Referenz im Rekognition-User der Person (nur manuell bestätigte!)
  associated        Boolean         @default(false)
  rejectedPersonIds String[]        @default([])
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@index([assetId])
  @@index([personId, status])
  @@index([status])
  @@map("asset_face")
  @@schema("public")
}

/// Das neue Feld «Personen» am Asset.
model AssetPerson {
  assetId   String
  asset     Asset             @relation(fields: [assetId], references: [id], onDelete: Cascade)
  personId  String
  person    DamPerson         @relation(fields: [personId], references: [id], onDelete: Cascade)
  source    AssetPersonSource
  createdAt DateTime          @default(now())

  @@id([assetId, personId])
  @@index([personId])
  @@map("asset_person")
  @@schema("public")
}

// Erweiterung Asset
model Asset {
  // …bestehende Felder…
  faceStatus    FaceScanStatus @default(pending)
  faceScannedAt DateTime?
  faces         AssetFace[]
  persons       AssetPerson[]

  @@index([faceStatus])
}
```

Migration: bestehende Assets bekommen `faceStatus = pending` → der Scheduler arbeitet das Archiv
(~5000 Bilder) automatisch ab (= Backfill). Bei Frankfurt-Limit von 5 Calls/s und Drosselung
dauert das ca. 1–2 Stunden. Zum Testen der Schwellen vorher `FACE_RECOGNITION_ENABLED=false`
deployen, Script auf einer kleinen Auswahl laufen lassen, dann einschalten.

## Feld «Personen» + Keywords

Regeln (zentral in `src/lib/dam/face-persons.ts`, Funktion `syncAssetPersons(assetId)`):

1. `AssetPerson(source=face)` wird aus allen `AssetFace` mit `status = confirmed` neu berechnet.
   `source=manual` bleibt unangetastet.
2. Keywords = `uniqueKeywords([...personNames, ...übrigeKeywords])`.
   **Personen kommen zuerst**, weil `uniqueKeywords()` bei 24 abschneidet und sonst Namen
   stillschweigend verloren gingen.
3. Fällt eine Person weg, wird genau ihr Name aus den Keywords entfernt
   (`applyKeywordChanges(existing, [], [removedName])`).
4. `updateAssetMetadata` / `bulkUpdatePublishedAssets` in `src/lib/actions/dam.ts` wenden nach dem
   Speichern Regel 2 erneut an → Personen-Keywords lassen sich nicht versehentlich wegklicken.
   In der UI werden sie als gesperrte Chips mit Personen-Icon angezeigt
   («Entfernen über Feld Personen»).
5. Umbenennen einer Person: in einer Transaktion alten Namen ersetzen auf allen Assets mit
   `AssetPerson` dieser Person.
6. Person löschen: Keyword auf allen Assets entfernen, `AssetPerson` per Cascade,
   `AssetFace.personId → null` + `status = unassigned`, Rekognition-User löschen
   (Faces bleiben in der Collection, sind dann wieder «unbenannt»).

Nur `confirmed` erzeugt Keywords. `suggested` erscheint nur in der Review-UI.

## In welcher Stage die Erkennung läuft

```
Upload → complete → process.ts (EXIF, Master, Thumbs, Autotag)
                      │  setzt nichts Neues; Asset hat faceStatus = pending (Default)
                      ▼
              Face-Scheduler (alle ~30 s, + Kick nach process.ts)
                      │  claimt pending-Assets (staging ODER published, nicht gelöscht)
                      ▼
          Master aus R2 → jpegForAutotag() (gedreht, 1536 px, <5 MB)
                      ▼
          IndexFaces (QualityFilter, MaxFaces, Mindestgrösse)
                      ▼
          pro Gesicht: SearchUsers(FaceId) → Auto-Match / Vorschlag / unbenannt
                      ▼
          AssetFace-Zeilen + Crop-Thumbnail (R2) + syncAssetPersons
```

- **Neue Uploads:** direkt nach der Verarbeitung, also noch **in Staging**. Der Uploader sieht in
  «Meine Uploads» die Gesichter und kann sie benennen, während er ohnehin Metadaten erfasst — der
  Moment, in dem er am besten weiss, wer auf dem Bild ist.
- **Publizieren** ändert nichts: `publish.ts` kopiert den Master unter einen `archive/`-Key,
  die Asset-ID bleibt, `AssetFace` hängt an der ID → Gesichter bleiben gültig, kein neuer Scan.
- **Archiv (Bestand):** wird über `faceStatus = pending` vom selben Scheduler abgearbeitet,
  gedrosselt per `FACE_BATCH_SIZE`.
- **editParams** (Zuschnitt, Begradigen, Spiegeln) wirken nur auf Derivate. Die Boxen beziehen
  sich auf den Master. Im Gesichter-Modus zeigt die Preview deshalb das **unbearbeitete**
  Bild (Umrechnung der Boxen bei Begradigen ist den Aufwand nicht wert).

### Matching-Logik

| `SearchUsers`-Similarity | Ergebnis |
|---|---|
| ≥ `FACE_AUTO_MATCH_SIMILARITY` (Start: 97) | `confirmed`, `assignedBy = null`, Keyword wird gesetzt |
| ≥ `FACE_SUGGEST_SIMILARITY` (Start: 85) | `suggested`, erscheint in der Review-Liste der Person |
| darunter | `unassigned` |

Personen in `rejectedPersonIds` werden übersprungen.

**Wenn die Redaktion ein Gesicht benennt:**
1. Person wählen oder neu anlegen (`CreateUser`).
2. `AssociateFaces(user, faceId)` → `associated = true`. Nur manuell bestätigte Gesichter
   werden Referenz (sonst «driftet» die Person durch falsche Auto-Matches).
3. `SearchFaces(faceId)` über die Collection → Treffer werden `confirmed` (≥ Auto-Schwelle) bzw.
   `suggested`, sofern noch nicht anders zugewiesen.
4. `syncAssetPersons` für alle betroffenen Assets.

## Wo man alle Gesichter sieht: `/dam/personen`

Neuer Sidebar-Eintrag unter DAM (neben Archiv/Papierkorb).

- **Tab «Personen»:** Raster aller Personen mit Avatar (bestes Crop), Anzahl Fotos,
  Anzahl offener Vorschläge. Aktionen: umbenennen, zusammenführen, löschen.
- **Personen-Detail `/dam/personen/[personId]`:**
  - bestätigte Fotos (Klick → bestehende Archiv-Preview)
  - **Vorschläge** als Crop-Raster mit «Ja / Nein / Alle bestätigen»
  - Referenzgesichter (die `associated` sind), einzeln entfernbar
- **Tab «Unbenannt»:** alle `unassigned`-Gesichter als Crops, sortiert nach Grösse/Schärfe.
  Klick → benennen oder «ignorieren». Kein automatisches Gruppieren von Unbekannten.

Crops: beim Scan aus dem 1536-px-JPEG mit sharp geschnitten (192 px WebP, etwas Rand),
gespeichert unter `faces/{assetFaceId}.webp` in R2, ausgeliefert über
`/api/dam/faces/[faceId]/crop`.

Zusätzlich: **Overlay in der Preview** (Archiv + Meine Uploads) zeigt Boxen auf dem Bild,
benannte mit Label, unbenannte gestrichelt mit «Person zuweisen».

## Module

| Datei | Aufgabe |
|---|---|
| `src/lib/dam/face-rekognition.ts` | Client (eigene Creds), `ensureCollection`, `indexFaces`, `searchUsers`, `searchFaces`, `createUser`, `associateFaces`, `deleteFaces`, `deleteUser` |
| `src/lib/dam/face-scan.ts` | Ein Asset scannen: R2 → JPEG → IndexFaces → Matching → `AssetFace` + Crops |
| `src/lib/dam/face-scheduler.ts` | Claim (`updateMany pending→processing`), Batch, Stale-Reset (`processing` > 10 min → `pending`), Kick-Funktion |
| `src/lib/dam/face-persons.ts` | `syncAssetPersons`, Keyword-Regeln, rename/merge/delete |
| `src/lib/dam/face-assign.ts` | Benennen, Bestätigen, Ablehnen, Ignorieren, Nachsuchen |
| `src/lib/actions/dam-faces.ts` | Server Actions für UI (gleiches Muster wie `actions/dam.ts`) |
| `src/app/api/dam/faces/[faceId]/crop/route.ts` | Crop ausliefern |
| `src/components/dam-face-overlay.tsx` | Boxen + Zuweisungs-Combobox (`dam-combobox.tsx` wiederverwenden) |
| `src/components/dam-persons-field.tsx` | Feld «Personen» in Preview/Meta-Edit/Bulk-Edit |
| `src/app/(app)/dam/personen/…` | Übersicht, Detail, Unbenannt |
| `scripts/dam-face-backfill.ts` | Setzt `pending` gefiltert (Jahr, Collection, Status), zeigt Fortschritt |

Anpassungen an bestehendem Code:
- `src/instrumentation.ts`: `startDamFaceScheduler()` (nur wenn `FACE_RECOGNITION_ENABLED`).
- `src/lib/dam/process.ts`: am Ende `kickDamFaceScan()` für schnelle Reaktion.
- `src/lib/dam/trash.ts` (`purgeAssetById`, `purgeExpiredDamAssets`): vor `asset.delete`
  Rekognition-Faces + Crops löschen. Papierkorb (soft delete) lässt sie stehen.
- `src/lib/actions/dam.ts`: Keyword-Writes über Personen-Regel 2.
- `src/lib/dam/archive-filters.ts` / `archive-search.ts`: Facette «Person» via `AssetPerson`.
- `src/lib/dam/export-metadata.ts`: Namen zusätzlich als XMP `Iptc4xmpExt:PersonInImage`.

## Konfiguration

```
FACE_RECOGNITION_ENABLED=true
REKOGNITION_REGION=eu-central-1          # Frankfurt; Zürich (eu-central-2) bietet Rekognition nicht an
REKOGNITION_ACCESS_KEY_ID=...            # eigener IAM-User, nur rekognition:*
REKOGNITION_SECRET_ACCESS_KEY=...
REKOGNITION_COLLECTION_ID=tsri-dam-faces
FACE_AUTO_MATCH_SIMILARITY=97
FACE_SUGGEST_SIMILARITY=85
FACE_MIN_BOX_SIZE=0.05                   # min. Höhe relativ zum Bild → Menschenmengen raus
FACE_MAX_PER_IMAGE=15
FACE_BATCH_SIZE=3
```

Rate-Limit Frankfurt (AWS-Default): 5 Transaktionen/s für `IndexFaces`, `SearchFaces`,
`SearchUsers`, `AssociateFaces`. Der Scheduler arbeitet sequenziell und fängt
`ThrottlingException` mit Retry + Backoff ab.

Abhängigkeit: `@aws-sdk/client-rekognition`.

Einmalig in AWS: AI-Services-Opt-out-Policy aktivieren (keine Nutzung der Bilder zum Training).

## Kosten (grob, Preisliste vor Start prüfen)

Rekognition Image ≈ 0.001 USD pro Call (erste Million), Face-Speicher ≈ 0.00001 USD pro Gesicht
und Monat. Annahme: ~5000 Archivbilder, Ø 2 indexierte Gesichter:

- Backfill: 5000 IndexFaces + 10 000 SearchUsers ≈ **15 USD einmalig**
- Speicher: 10 000 Gesichter ≈ **0.10 USD/Monat**
- Laufend: pro neuem Bild ≈ 0.003 USD (bei 100 Uploads/Woche ≈ 1.30 USD/Monat)
- Ein evtl. AWS Free Tier für neue Konten deckt den Grossteil davon ab.

## Phasen

**Phase 1 — MVP**
1. Schema + Migration (Bestand `pending`, Feature-Flag zunächst aus)
2. `face-rekognition.ts`, `face-scan.ts`, `face-scheduler.ts`, Kick aus `process.ts`
3. Purge-Hooks in `trash.ts`
4. Overlay in Archiv-Preview und Meine Uploads, benennen / neue Person / ignorieren
5. Feld «Personen» + Keyword-Sync inkl. Schutz in `updateAssetMetadata`
6. Backfill-Script: Testlauf auf ~200 Bildern, Schwellen prüfen, dann ganzes Archiv

**Phase 2 — Übersicht**
1. `/dam/personen` mit Personen, Detail mit Vorschlägen, Unbenannt
2. Umbenennen, Zusammenführen, Löschen
3. Archiv-Facette «Person», Feld «Personen» im Bulk-Edit

**Phase 3 — Qualität**
1. Statistik (Auto-Matches, Ablehnungsquote) → Schwellen nachziehen
2. XMP `PersonInImage` im Export
3. Opt-out pro Person («nie vorschlagen», Faces + User löschen)

## Entscheide (2026-10-05)

- Region: `eu-central-1` (Frankfurt). Zürich bietet Rekognition nicht an.
- Berechtigung: **alle DAM-User** dürfen Personen anlegen, umbenennen, zusammenführen, löschen.
  Löschen mit Bestätigungsdialog (`dam-confirm-dialog.tsx`), weil es Keywords auf vielen Bildern ändert.
- Auto-Match ≥ 97 % setzt sofort `confirmed` + Keyword.
- Archivgrösse: ~5000 Bilder.

## Setup AWS (einmalig, durch Elio)

1. AWS-Konto anlegen (Firmen-Mail, Firmenkreditkarte), Root-Account mit MFA sichern.
2. IAM-User `tsri-dam-rekognition` mit Policy nur für `rekognition:*` auf
   `arn:aws:rekognition:eu-central-1:<account>:collection/tsri-dam-faces` (+ `CreateCollection`).
3. Access Key erzeugen → in Render als `REKOGNITION_ACCESS_KEY_ID` / `REKOGNITION_SECRET_ACCESS_KEY`.
4. Billing-Alarm (z.B. 20 USD/Monat) setzen.
5. AI-Services-Opt-out: braucht AWS Organizations (kostenlos) → Organization anlegen,
   Policy-Typ «AI services opt-out policies» aktivieren, Policy für Rekognition = opt out.
