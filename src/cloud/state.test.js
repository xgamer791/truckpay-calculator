import { describe, expect, it, vi } from "vitest";
const enhanceMock=vi.hoisted(()=>vi.fn(async source=>source));
const orientMock=vi.hoisted(()=>vi.fn(async source=>({dataUrl:source,quarterTurns:0,confident:true})));
vi.mock('../scanner/orientation.js',()=>({orientDataUrl:orientMock}));
vi.mock('../scanner/enhancement-browser.js',()=>({enhanceDataUrl:enhanceMock}));
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
    expect(result.history[0].loads[0].documents[0].orientationVersion).toBe(1);
    expect(result.history[0].loads[0].documents[0].enhancementVersion).toBe(2);
    expect(result.history[0].loads[0].documents[0].original).toBe(local[0].loads[0].documents[0].processed);
    expect(orientMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("summarizes driver history for the admin view", () => {
    expect(driverTotals(history)).toEqual({ settlements: 1, loads: 1, tickets: 1, pay: 92.5 });
  });
});

it.each([1,2])('uploads finished pixels and preserves the original for capture version %s',async version=>{
  const first='data:image/jpeg;base64,RklSU1Q=',finished='data:image/jpeg;base64,RklOQUw=',original='data:image/jpeg;base64,T1JJR0lOQUw=';
  const local=structuredClone(history),load=local[0].loads[0],doc=load.documents[0];
  delete doc.storageId;Object.assign(doc,{processed:version===2?finished:first,original,orientationVersion:1,enhancementVersion:version,ticketRead:{version:3,status:'ignored'}});load.ticket=doc.processed;
  enhanceMock.mockClear();enhanceMock.mockResolvedValueOnce(finished);
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify({storageId:'uploaded-'+fetchMock.mock.calls.length}),{headers:{'Content-Type':'application/json'}}));
  vi.stubGlobal('fetch',fetchMock);
  try{
    const result=await uploadPendingTicketImages(local,async()=>'https://upload.test/file');
    expect(await fetchMock.mock.calls[0][1].body.text()).toBe('FINAL');
    expect(await fetchMock.mock.calls[1][1].body.text()).toBe('ORIGINAL');
    expect(result.history[0].loads[0]).toMatchObject({ticket:finished,documents:[{processed:finished,original,enhancementVersion:2}]});
    expect(enhanceMock).toHaveBeenCalledTimes(version===2?0:1);
  }finally{vi.unstubAllGlobals();enhanceMock.mockReset().mockImplementation(async source=>source);}
});
