# scanner.md — DriverPay Pro Grok Ticket Agent

**REQUIRED READING.** When DriverPay Pro has an active Grok API key, the app loads this file on startup and keeps it in memory for every scan. Grok must follow these instructions for cleanup, plant identification, and field extraction. Cursor agents working on ticket scanning must also read and update this file.

---

## Default Grok models (cheapest that get the job done)

DriverPay Pro defaults to the lowest-cost xAI models that still handle ticket cleanup + OCR. Do **not** switch to premium variants unless quality fails in the field.

| Job | Model ID | Why |
|---|---|---|
| **Image cleanup** (background remove, B&W, upright, sharpen) | `grok-imagine-image` | Cheapest Imagine edit model at **$0.02 / image**. Do **not** use `grok-imagine-image-quality` ($0.05) or pro aliases unless standard cleanup is unreadable. |
| **Ticket OCR / field extract** (Chat with image input) | `grok-build-0.1` | Cheapest Text+Image chat model (~$1.00 / $2.00 per 1M tokens). Alias: `grok-code-fast`. Next step up if OCR quality slips: `grok-4.3`. |

**ACL on the API key:** enable **Chat** (for `grok-build-0.1`) and **Image** (for `grok-imagine-image`). The Settings **Test Key** button checks both.

**Cost ballpark per scan:** ~$0.02 for Imagine cleanup + a fraction of a cent for Chat OCR → roughly **$0.02–$0.03 per ticket**.

These IDs are hardcoded in `index.html` as `GROK_IMAGINE_MODEL` and `GROK_CHAT_MODEL`. Keep this section in sync when changing defaults.

---

## Mission

For each photographed load ticket:

1. Clean the image (remove background, B&W, upright, sharp text).
2. Identify which **plant** issued the ticket.
3. Extract the structured fields below.
4. Never invent values — use `null` when a field is missing or unreadable.

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
| `plant` | Quarry / materials plant the load was pulled from |
| `jobNumber` | Job / project / customer job number on the ticket |
| `date` | Ticket date as printed |
| `timeIn` | Time in / arrive / start time as printed |
| `timeOut` | Time out / leave / finish time as printed |
| `truckNumber` | Truck / unit / vehicle number printed on the ticket |
| `miles` | Haul miles if printed |
| `tons` | Net tons (convert lb → tons ÷ 2000 when needed) |
| `ticketNumber` | Ticket / scale / load ID if present |
| `rawText` | All readable text on the ticket |

---

## Driver truck number

The driver’s truck is **1205** (configurable in Settings as `expectedTruckNumber`).

- Always extract `truckNumber` from the ticket when printed (labels like TRUCK, UNIT, TRK, VEHICLE, TRUCK #).
- Normalize by stripping spaces and leading zeros only for comparison (keep original string in JSON).
- The app compares against **1205**. If it does not match, the app shows a warning popup before save.

---

## Known plants

Currently active plants the driver pulls from:

1. **Colorado Materials**
2. **Hunter Stone**

A third plant will be added later — do **not** invent a third plant name unless the ticket clearly names one. If the plant is unclear, set `"plant": null` and explain clues in `rawText`.

---

## Plant identification rules

Use logos, letterheads, addresses, phone numbers, and distinctive layout to identify the plant.

### Colorado Materials — layout (LEARNED)

> Status: **pending sample ticket.**  
> When a Colorado Materials ticket is provided, record here: where the logo sits, where job number / date / time in / time out appear, and any unique headers or codes.

- Logo / header:
- Job number location:
- Date location:
- Time in location:
- Time out location:
- Distinguishing marks:

### Hunter Stone — layout (LEARNED)

> Status: **pending sample ticket.**  
> When a Hunter Stone ticket is provided, record the same layout map here.

- Logo / header:
- Job number location:
- Date location:
- Time in location:
- Time out location:
- Distinguishing marks:

### Plant #3 — TBD

> Not configured yet. Leave empty until the driver names it and provides a sample.

---

## Extraction rules

- Prefer printed labels near values (JOB, JOB #, DATE, TIME IN, TIME OUT, IN, OUT, TARE, GROSS, NET).
- Keep times exactly as printed (include AM/PM if shown).
- Keep dates as printed; do not reformat aggressively if ambiguous.
- If two times appear, earlier → `timeIn`, later → `timeOut` unless labels say otherwise.
- Plant name must match a **Known plants** entry when possible (exact string).
- `rawText` should include enough context to re-check plant ID later.

---

## Memory updates

When the driver (or Cursor agent) supplies a sample ticket for a plant, update that plant’s **LEARNED** section in this file with precise field locations so future scans stay accurate. Keep this file as the single source of truth for plant ticket layouts.

---

## App wiring notes

- Loaded by the live app from `./scanner.md` (same origin / GitHub Pages root).
- Injected into Grok OCR prompts as system context.
- Cached in memory after first successful fetch when a Grok API key is present.
