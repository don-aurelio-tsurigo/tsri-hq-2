# Finance: Provisionen

Nachbau der Airtable-Tabellen «Provision Buchungen», «Provision Monatsabrechnung» und «Provisionsmodell» (Base Budget Tsüri) im Finance-Bereich.

## Entscheide (2026-10-16)

- Ein provisionsrelevanter Deal gehört **genau einer** Sales-Person. Der Betrag wird nur in **Tsüri intern** und **Extern** aufgeteilt.
- Die Formeln sind **parametrisierte Modelle**, die im Tool editierbar sind. Sie werden pro Person mit «gültig ab» zugewiesen.
- Der **Grundbetrag** wird jeden Monat ausbezahlt, auch in Monaten ohne Deals.
- Monatsabrechnungen werden **abgeschlossen und gesperrt**. Dabei werden die Beträge und Modellparameter eingefroren.

## Fachlogik

**Abrechnungsperiode:** Sie läuft vom 21. bis zum 20. Ein Verkauf am 21. oder später zählt zum Folgemonat (wie die Airtable-Formel `DAY(Datum) > 20`). Massgeblich ist das Verkaufsdatum des Deals, nicht die Raten.

**Provisionsbasis:** Die Provision wird auf den ganzen Deal-Betrag gerechnet (eine Provisionszeile pro Bexio-Auftrag), nicht auf die Raten.

**Formel:** Jedes Modell hat diese Parameter:

| Parameter | Standard (bis 2026) | Valentina ab Juli 26 |
|---|---|---|
| Grundbetrag / Monat | 500 | 2'000 |
| Satz extern | 25 % | 25 % |
| Satz intern min. | 15 % | 15 % |
| Satz intern max. | 45 % | 35 % |
| Schwelle (intern + extern) | 10'000 | 10'000 |
| Progression nach | Intern | Total |

```
total = intern + extern
satzIntern = total > Schwelle
  ? max
  : min + (max − min) × (Progressionsbasis / Schwelle)
Provision = Grundbetrag + extern × SatzExtern + intern × satzIntern
```

Geprüft: Diese Formel reproduziert alle 18 Airtable-Monatsabrechnungen exakt, sowohl «Provision regulär» als auch «Provision Valentina 2026».

## Datenmodell (Prisma)

- **`AppCapability.sales`**: markiert Sales-Mitarbeitende. Nur sie stehen in der Personenauswahl, und nur sie sehen ihr eigenes Dashboard.
- **`FinanceCommissionModel`**: Name, Grundbetrag, Satz extern, Satz intern min./max., Schwelle, Progressionsbasis (`intern | total`), Notizen, archiviert.
- **`FinanceCommissionAssignment`**: User, Modell, `validFrom` und optional `validUntil` (Perioden). Zuweisungen derselben Person dürfen sich nicht überlappen.
- **Auf `FinanceDeal`** kommen neue Felder:
  - `commissionStatus` (`undecided | relevant | not_relevant`)
  - `salesUserId`
  - `soldAt` (Datum)
  - `commissionIntern`, `commissionExtern`

  Der Zeitraum wird aus `soldAt` abgeleitet. Die Aufteilung intern/extern ist standardmässig 100 % intern. Weicht die Summe vom Deal-Total ab, gibt es eine Warnung, aber keine Sperre.
- **`FinanceCommissionStatement`** (nur für abgeschlossene Perioden): User, Periode, Summe intern/extern, Provision, Modell-Snapshot (JSON), `closedAt`, `closedById`. Offene Perioden werden live berechnet.

  Ist eine Periode abgeschlossen, lassen sich die Provisionsfelder ihrer Deals nicht mehr ändern. Das Wieder-Öffnen ist nur für Finance möglich.

## UI

1. **Deal-Editor** (`/finance/deals`) bekommt den Abschnitt «Provision»:
   - Entscheid relevant / nicht relevant
   - Sales-Person (Vorschlag aus `responsibleName` vom Webhook)
   - Verkaufsdatum
   - Aufteilung intern/extern

   Die Deal-Liste erhält einen Filter «Provision offen», damit nichts liegen bleibt.
2. **`/finance/provisionen`** (Capability `finance`): Übersicht pro Periode × Person mit Deals, intern, extern und Provision, dazu «Periode abschliessen». Ein zweiter Tab «Modelle» enthält die Modelle und Zuweisungen pro Person.
3. **Dashboard für Mitarbeitende** (`/me/provisionen` oder als Kachel auf `/me`, Capability `sales`):
   - laufende Periode live (Hochrechnung)
   - eigene Deals pro Periode
   - abgeschlossene Abrechnungen

   Jede Person sieht nur ihre eigenen Daten.

## Umsetzung in Phasen

1. Schema, Migration und `src/lib/finance/commission.ts`:
   - Periode
   - Formel
   - Aggregation

   Dazu Tests mit den 18 Airtable-Abrechnungen als Fixtures.
2. Provisionsabschnitt im Deal-Editor und Filter in der Deal-Liste.
3. `/finance/provisionen` mit Übersicht, Abschluss sowie Modellen und Zuweisungen.
4. Mitarbeitenden-Dashboard.
5. Airtable-Import:
   - Modelle anlegen
   - Zuweisungen setzen
   - die 49 Provisionsbuchungen über die Bexio-Auftragsnummer den Deals zuordnen (Rest als Liste)
   - vergangene Perioden abschliessen

## Geklärt (2026-10-16)

- **Timothy** arbeitet nur selten mit und hat **keinen Grundbetrag**. Er bekommt das Modell «Timothy»: Standard-Sätze, Grundbetrag 0. (Annahme: dieselben Sätze wie Standard, wie es Airtable via «Provision regulär» rechnet.)
- **Valentina:** Bis Juni 26 gilt Standard, ab der Periode Juli 26 das Modell «Valentina ab Juli 26».
- **Manuelle Deals** lassen sich der Provision hinzufügen. Dafür wird der bestehende manuelle Deal (`source = manual`) genutzt. Die Provision hängt nicht vom Budget-Status des Deals ab (offen/aufgeteilt/ignoriert).
- **Alle bisherigen Perioden gelten als ausbezahlt.** Der Import schliesst alle Perioden ab, deren Ende vor dem Importdatum liegt (Stand heute: bis und mit 09-2026).

  Die Beträge werden mit den Modell-Zuweisungen oben gerechnet. Bei Valentina weichen sie für Feb.–Jun. 26 vom Airtable-Feld «Provision ab Juli 26» ab, weil dieses rückwirkend ihr neues Modell verwendet. Der Import listet diese Abweichungen auf.

**Grundbetrag jeden Monat:** Er gilt nur, solange eine Zuweisung aktiv ist. Darum hat eine Zuweisung neben `validFrom` auch ein optionales `validUntil` (z. B. Austritt).

## Offene Punkte

- **Mapping Airtable-Mitarbeitende → Tool-User:** Betrifft Marc, Valentina und Timothy. Klärung beim Import.
- **Ab welcher Periode gilt die Zuweisung für Marc und Valentina?** Davon hängen die Grundbetrag-Monate ohne Deals ab. Vorschlag: ab der ersten Periode mit einer Provisionsbuchung in Airtable.
