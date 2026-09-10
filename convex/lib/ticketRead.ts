import { v } from 'convex/values';

export const ticketReadValue = v.object({
  version: v.number(),
  status: v.union(v.literal('matched'), v.literal('ignored'), v.literal('unreadable')),
  template: v.optional(v.string()),
  plant: v.optional(v.literal('martin-marietta')),
  ticketNumber: v.optional(v.string()),
  confidence: v.optional(v.number()),
});

export function validateRead(result: { status: string; ticketNumber?: string; plant?: string; confidence?: number }) {
  if (result.status === 'matched' && (result.plant !== 'martin-marietta' || !/^\d{6,12}$/.test(result.ticketNumber || '') || (result.confidence || 0) < .93)) {
    throw new Error('Invalid ticket read');
  }
  if (result.status !== 'matched' && result.ticketNumber) throw new Error('Unrecognized ticket cannot have a number');
}

export function ocrWithRead(ocr: any, result: { status: string; ticketNumber?: string } | undefined) {
  return result?.status === 'matched'
    ? { ...(ocr && typeof ocr === 'object' ? ocr : {}), plant: 'Martin Marietta / Hunter', ticketNumber: result.ticketNumber }
    : ocr;
}
