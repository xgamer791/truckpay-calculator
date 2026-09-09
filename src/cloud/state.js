const VALID_MODES = new Set(["auto", "fixed", "perton"]);

function optional(target, key, value) {
  if (value !== undefined && value !== null && value !== "") target[key] = value;
}

export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  if (parts.length < 2) throw new Error("Invalid ticket image.");
  const header = parts[0];
  const encoded = parts.slice(1).join(",");
  const mime = header.match(/^data:([^;,]+)/i)?.[1] ?? "image/jpeg";
  const bytes = header.includes(";base64")
    ? Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(encoded));
  return new Blob([bytes], { type: mime });
}

async function sourceToBlob(source) {
  if (typeof source !== "string" || !source) {
    throw new Error("Ticket image is missing.");
  }
  if (source.startsWith("data:")) return dataUrlToBlob(source);
  const response = await fetch(source);
  if (!response.ok) throw new Error("Unable to read the ticket image.");
  return await response.blob();
}

async function uploadBlob(blob, generateUploadUrl) {
  const uploadUrl = await generateUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg" },
    body: blob,
  });
  if (!response.ok) throw new Error("Ticket upload failed.");
  const payload = await response.json();
  if (!payload.storageId) throw new Error("Ticket storage ID is missing.");
  return payload.storageId;
}

export async function uploadPendingTicketImages(history, generateUploadUrl) {
  const copy = typeof structuredClone === "function"
    ? structuredClone(history)
    : JSON.parse(JSON.stringify(history));
  let changed = false;

  for (const settlement of copy) {
    for (const load of settlement.loads ?? []) {
      const documents = Array.isArray(load.documents) ? load.documents : [];
      for (const document of documents) {
        if (!document.storageId) {
          if (document.orientationVersion !== 1) {
            const { orientDataUrl } = await import('../scanner/orientation.js');
            const source=document.processed || document.original || load.ticket;
            try{
              const oriented=await orientDataUrl(source);
              if(oriented.dataUrl!==source){document.original ||= source;document.processed=oriented.dataUrl;if(load.ticket===source)load.ticket=oriented.dataUrl;}
              document.orientationVersion=1;
            }catch{ /* Keep cloud saving available; the original remains eligible for migration. */ }
          }
          const processed = await sourceToBlob(document.processed || document.original || load.ticket);
          document.storageId = await uploadBlob(processed, generateUploadUrl);
          changed = true;
        }
        if (document.original && document.original !== document.processed && !document.originalStorageId) {
          const original = await sourceToBlob(document.original);
          document.originalStorageId = await uploadBlob(original, generateUploadUrl);
          changed = true;
        }
      }
    }
  }

  return { history: copy, changed };
}

export function buildSnapshot(history, settings) {
  const tickets = [];
  const settlements = (Array.isArray(history) ? history : []).map((settlement) => ({
    clientId: String(settlement.id),
    payoutDate: String(settlement.payoutDate),
    loads: (Array.isArray(settlement.loads) ? settlement.loads : []).map((load) => {
      const clientId = String(load.id);
      const value = {
        clientId,
        day: String(load.day || "Friday"),
        miles: Number(load.miles),
        tons: Number(load.tons),
        pricingMode: VALID_MODES.has(load.pricingMode) ? load.pricingMode : "auto",
      };
      optional(value, "customTotal", Number.isFinite(load.customTotal) ? Number(load.customTotal) : undefined);
      optional(value, "customRate", Number.isFinite(load.customRate) ? Number(load.customRate) : undefined);
      optional(value, "note", typeof load.note === "string" ? load.note.trim() : undefined);

      const documents = Array.isArray(load.documents) ? load.documents : [];
      for (const document of documents) {
        if (!document?.storageId) continue;
        const ticket = {
          clientId: String(document.id),
          loadClientId: clientId,
          type: String(document.type || "ticket"),
          storageId: document.storageId,
        };
        optional(ticket, "originalStorageId", document.originalStorageId);
        optional(ticket, "orientationVersion", document.orientationVersion);
        optional(ticket, "filter", document.filter);
        if (document.ocr !== undefined) ticket.ocr = document.ocr;
        optional(ticket, "capturedAt", document.createdAt);
        optional(ticket, "modifiedAt", document.modifiedAt);
        tickets.push(ticket);
      }
      return value;
    }),
  }));

  return {
    settings: {
      avgTons: Math.min(30, Math.max(17, Number(settings?.avgTons) || 25)),
      truckNumber: String(settings?.truckNumber || "").trim(),
    },
    settlements,
    tickets,
  };
}

export function driverTotals(history) {
  const settlements = Array.isArray(history) ? history : [];
  let loads = 0;
  let tickets = 0;
  let pay = 0;
  for (const settlement of settlements) {
    for (const load of settlement.loads ?? []) {
      loads += 1;
      tickets += Array.isArray(load.documents) ? load.documents.length : 0;
      pay += Number(load.calculatedPay) || 0;
    }
  }
  return { settlements: settlements.length, loads, tickets, pay };
}
