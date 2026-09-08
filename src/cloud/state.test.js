import { describe, expect, it, vi } from "vitest";
import {
  buildSnapshot,
  dataUrlToBlob,
  driverTotals,
  uploadPendingTicketImages,
} from "./state";

const history = [{
  id: 101,
  payoutDate: "2026-09-12",
  loads: [{
    id: "load-1",
    day: "Monday",
    miles: 52,
    tons: 25,
    pricingMode: "auto",
    note: "Plant 4",
    calculatedPay: 92.5,
    documents: [{
      id: "ticket-1",
      type: "ticket",
      storageId: "storage-1",
      processed: "https://example.test/ticket.jpg",
      createdAt: "2026-09-08T12:00:00.000Z",
      ocr: { ticketNumber: "ABC123" },
    }],
  }],
}];

describe("cloud snapshot", () => {
  it("normalizes settlements and keeps ticket images out of database arguments", () => {
    const snapshot = buildSnapshot(history, { avgTons: 25, truckNumber: "1205" });
    expect(snapshot.settlements[0].clientId).toBe("101");
    expect(snapshot.settlements[0].loads[0]).toMatchObject({
      clientId: "load-1",
      miles: 52,
      tons: 25,
      note: "Plant 4",
    });
    expect(snapshot.tickets[0]).toMatchObject({
      clientId: "ticket-1",
      loadClientId: "load-1",
      storageId: "storage-1",
    });
    expect(JSON.stringify(snapshot)).not.toContain("example.test/ticket.jpg");
  });

  it("converts captured data URLs into image blobs", async () => {
    const blob = dataUrlToBlob("data:image/jpeg;base64,SGVsbG8=");
    expect(blob.type).toBe("image/jpeg");
    expect(await blob.text()).toBe("Hello");
  });

  it("uploads a new local ticket and retains its storage ID", async () => {
    const local = structuredClone(history);
    delete local[0].loads[0].documents[0].storageId;
    local[0].loads[0].documents[0].processed = "data:image/jpeg;base64,SGVsbG8=";
    const generateUploadUrl = vi.fn().mockResolvedValue("https://upload.test/file");
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ storageId: "new-storage-id" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadPendingTicketImages(local, generateUploadUrl);
    expect(result.changed).toBe(true);
    expect(result.history[0].loads[0].documents[0].storageId).toBe("new-storage-id");
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("summarizes driver history for the admin view", () => {
    expect(driverTotals(history)).toEqual({ settlements: 1, loads: 1, tickets: 1, pay: 92.5 });
  });
});
