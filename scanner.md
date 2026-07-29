# scanner.md — DriverPay Pro Grok Ticket Agent

**REQUIRED READING.** When DriverPay Pro has an active Grok API key, the app loads this file on startup and keeps it in memory for every scan. Grok must follow these instructions for cleanup, plant identification, and field extraction. Cursor agents working on ticket scanning must also read and update this file.

---

## Default Grok models (cheapest that get the job done)

| Job | Model ID | Why |
|---|---|---|
| **Image cleanup** | `grok-imagine-image` | $0.02/image (edits bill input+output ≈ $0.04). Not `grok-imagine-image-quality` ($0.05). |
| **Ticket OCR** | `grok-build-0.1` | Cheapest Text+Image chat (~$1/$2 per 1M). Alias `grok-code-fast`. Upgrade to `grok-4.3` only if OCR fails. |

Enable **Chat** + **Image** on the API key. Settings → **Test Key** checks both.

Hardcoded in `index.html` as `GROK_IMAGINE_MODEL` / `GROK_CHAT_MODEL`.

---

## Mission

1. Light-clean the ticket photo only: remove background outside the paper; optional mild B&W/contrast. **Do not** change ticket size, shape, proportions, or alter any text/numbers/layout on the ticket.
2. Identify the **plant** using LEARNED layouts below.
3. Extract JSON fields using the plant’s field map — do not guess from unlabeled nearby text.
4. Never invent values — use `null` when missing or unreadable.

---

## Fields to extract (JSON)

```json
{
  "plant": "Colorado Materials" | "Hunter Stone" | string | null,
  "jobNumber": string | null,
  "date": string | null,
  "timeIn": string | null,
  "timeOut": string | null,
  "truckNumber": string | null,
  "miles": number | null,
  "tons": number | null,
  "ticketNumber": string | null,
  "rawText": string
}
```

| Field | Meaning |
|---|---|
| `plant` | Exact known-plant string when identified |
| `jobNumber` | Order / Job / project number used for the haul (not Customer No, not PO unless no Order/Job exists) |
| `date` | Ticket date as printed |
| `timeIn` | Time in / arrive / first time as printed |
| `timeOut` | Time out / leave — `null` if the form only has one TIME |
| `truckNumber` | Digits of the truck/unit from Vehicle/Truck (see truck rules) |
| `miles` | Haul miles if printed (number) |
| `tons` | **NET tons only** (never GROSS, TARE, TODAY, Job To Date, or Dispatch Totals) |
| `ticketNumber` | Ticket # |
| `rawText` | Readable text enough to re-check plant + key fields |

---

## Driver truck number

Expected truck: **1205** (Settings `expectedTruckNumber`).

- Read from **VEHICLE** or **TRUCK** (not Carrier / Hauler).
- Return the truck unit digits in `truckNumber` (e.g. `1205` from `RST1205 - ROLLING STONE` or `1205 JLP AGGREGATE`).
- Keep leading zeros only if they are meaningful; otherwise normalize to the unit number the driver would recognize.
- App warns if ticket truck ≠ expected.

---

## Known plants

1. **Colorado Materials**
2. **Hunter Stone**

Do **not** invent a third plant. If unclear → `"plant": null` and put clues in `rawText`.

**Important:** Hunter Stone tickets may be branded **Martin Marietta** (plant line contains “Hunter Stone”) **or** **Hunter Stone / A Division of Colorado Materials, Ltd.** Both are plant = `"Hunter Stone"`. Do not label Martin Marietta Hunter Stone tickets as Colorado Materials.

---

## Plant identification rules

### Colorado Materials — layout (LEARNED)

> Status: **learned from sample ticket** (Colorado Materials, Ltd. scale ticket).

**Identify by:**
- Header left: Texas outline + star “CM” logo + **Colorado Materials, Ltd.**
- Address: P.O. Box 2109, San Marcos, TX 78667 · (512) 396-1555
- Faint Texas watermark in the main info box
- Footer often says `COPY 2 CARRIER`

**Field map:**

| JSON field | Where on ticket | Sample / notes |
|---|---|---|
| `plant` | Header company name | `"Colorado Materials"` |
| `ticketNumber` | Top-right **TICKET #** | e.g. `3518898` |
| `date` | Top-right under ticket #, **DATE** | e.g. `7/24/2026` |
| `timeIn` | Top-right **TIME** (single time only) | e.g. `6:47:49AM` — put here |
| `timeOut` | *(not on this form)* | always `null` |
| `truckNumber` | Main box **VEHICLE** left ID | `1205` from `1205 JLP AGGREGATE` |
| `jobNumber` | Main box **ORDER** left ID | e.g. `02476475` (not CUSTOMER, not PO) |
| `miles` | *(usually absent)* | `null` if not printed |
| `tons` | Right weights box **NET** → **TONS** | e.g. `24.02` — ignore GROSS/TARE/TODAY |

**Other labeled rows (do not map to jobNumber):** CUSTOMER, PO, PRODUCT, SCALE #, WEIGHMASTER, DESCRIPTION, SUGGESTED DELIVERY INFO.

**Layout sketch:**
```
[CM logo + Colorado Materials, Ltd. ...]     TICKET #  ########
                                             DATE  TIME
+---------------------------+  +------------------+
| VEHICLE / CARRIER / ...   |  | GROSS  lbs tons  |
| ORDER / PO / PRODUCT      |  | TARE             |
| SCALE # / WEIGHMASTER     |  | NET   ← tons     |
+---------------------------+  | TODAY           |
DESCRIPTION | SUGGESTED DELIVERY INFO
```

---

### Hunter Stone — layout (LEARNED)

Hunter Stone appears in **two form families**. Detect which one, then use that map. Always set `"plant": "Hunter Stone"`.

#### Variant A — Martin Marietta plant ticket (common)

> Status: **learned from sample tickets** (Martin Marietta · plant SK249 / 51269 Hunter Stone, New Braunfels).

**Identify by:**
- **Martin Marietta** logo top-left
- Plant line like `SK249 Hunter Stone` or `51269 Hunter Stone`
- Address on FM 1102, New Braunfels, TX 78132
- Top barcode + **Ticket** number top-right
- Vertical **WARNING / PRECAUCION** strip on the right edge
- Separate **Time In** and **Time Out** columns
- **Miles** column in the logistics grid

**Field map:**

| JSON field | Where on ticket | Sample / notes |
|---|---|---|
| `plant` | Plant line containing Hunter Stone | `"Hunter Stone"` (not “Martin Marietta”) |
| `ticketNumber` | Top-right **Ticket** | e.g. `23680341` |
| `date` | Logistics grid **Date** | e.g. `7/31/2024` |
| `timeIn` | Grid **Time In** | e.g. `8:18` |
| `timeOut` | Grid **Time Out** | e.g. `8:31` |
| `miles` | Grid **Miles** | e.g. `49` |
| `truckNumber` | **Vehicle** line | `1205` from `RST1205 - ROLLING STONE` |
| `jobNumber` | Row **Order No** | e.g. `66016029` — not Customer No, not Dispatch, not PO No |
| `tons` | Weight box **NET** → **TONS** | e.g. `25.61` — ignore GROSS/TARE, Dispatch Totals, Job To Date |

**Layout sketch:**
```
[Martin Marietta]  SK249 Hunter Stone     [barcode]
                   address...             Ticket ########
Vehicle: RST1205 - ...   Carrier: ...
Date | Dispatch | Scale | Time In | Time Out | Miles
Customer No | Order No | PO No | Product | Dispatch Totals | Job To Date
Ship To / Dest / Instructions     |  GROSS/TARE/NET  lbs|tons|metric
Weigh Master ...                  |  WARNING strip →
```

#### Variant B — Hunter Stone / Division of Colorado Materials

> Status: **learned from sample ticket** (header **HUNTER STONE**, subtitle “A Division of Colorado Materials, Ltd.”).

**Identify by:**
- Large **HUNTER STONE** title (not Martin Marietta)
- Subtitle: A Division of Colorado Materials, Ltd.
- Texas star logo
- Labels **TRUCK** / **HAULER** (not Vehicle/Carrier wording of Variant A)
- Single **Time** (like CM) rather than Time In/Out
- Often no Miles field

**Field map:**

| JSON field | Where on ticket | Sample / notes |
|---|---|---|
| `plant` | Header HUNTER STONE | `"Hunter Stone"` |
| `ticketNumber` | Top-right **Ticket #** | e.g. `437651` |
| `date` | Top-right **Date** | e.g. `06/25/2026` |
| `timeIn` | Top-right **Time** | e.g. `9:48 am` |
| `timeOut` | *(not on this form)* | `null` |
| `truckNumber` | **TRUCK** | e.g. `1205` |
| `jobNumber` | **JOB** (prefer) or order-like id | e.g. job name/code as printed; if only descriptive JOB text, still return it; prefer a numeric job/order id if both exist |
| `miles` | *(usually absent)* | `null` |
| `tons` | Weights **NET** → **TONS** | e.g. `26.42` |

**Do not** set plant to Colorado Materials just because the subtitle mentions Colorado Materials, Ltd.

### Plant #3 — TBD

Not configured yet.

---

## Extraction rules (global)

1. **Identify plant first** using logos / plant lines, then apply that plant’s LEARNED map.
2. **Tons = NET tons only.** Never GROSS, TARE, TODAY, LOADS, Dispatch Totals, or Job To Date.
3. **Truck** from VEHICLE / TRUCK only — strip fleet prefixes (`RST`) and trailing names (`ROLLING STONE`, `JLP AGGREGATE`).
4. **Job number** = Order No / ORDER / JOB — never Customer No, Carrier, Dispatch, Scale, or PO (unless Order/Job missing).
5. Keep times/dates **as printed** (AM/PM, leading zeros).
6. One TIME only → `timeIn` set, `timeOut` null. Labeled Time In/Out → both.
7. If two unlabeled times, earlier → `timeIn`, later → `timeOut`.
8. `rawText` must include plant name clues, ticket #, vehicle/truck line, order/job, and NET tons line.
9. If a field is blurry, set `null` — do not invent.

---

## Memory updates

When the driver or Cursor agent supplies a new sample (or a misread), update the matching LEARNED section. Keep maps concise — field location tables beat prose. This file is the single source of truth for plant layouts.

---

## App wiring notes

- Loaded from `./scanner.md` (GitHub Pages root) when a Grok key is present.
- Injected into every Grok OCR prompt.
- Defaults: `GROK_CHAT_MODEL = grok-build-0.1`, `GROK_IMAGINE_MODEL = grok-imagine-image`.
