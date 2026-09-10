import { v } from 'convex/values';
import { plantLabel, READER_VERSION } from '../../src/ticket-reader/metadata.js';

export const ticketReadValue = v.object({
  version: v.number(),
  status: v.union(v.literal('matched'), v.literal('ignored'), v.literal('unreadable')),
  template: v.optional(v.string()),
  plant: v.optional(v.union(v.literal('martin-marietta'), v.literal('colorado-materials'))),
  ticketNumber: v.optional(v.string()),
  confidence: v.optional(v.number()),
  quarterTurns: v.optional(v.number()),
});

export function validateRead(result: { version: number; status: string; ticketNumber?: string; plant?: string; confidence?: number }) {
  if (!Number.isInteger(result.version) || result.version < 1 || result.version > READER_VERSION) throw new Error('Invalid ticket reader version');
  if (result.status === 'matched' && (!plantLabel(result.plant) || !/^\d{6,12}$/.test(result.ticketNumber || '') || (result.confidence || 0) < .93)) {
    throw new Error('Invalid ticket read');
  }
  if (result.status !== 'matched' && result.ticketNumber) throw new Error('Unrecognized ticket cannot have a number');
}

export function ocrWithRead(ocr: any, result: { status: string; plant?: string; ticketNumber?: string } | undefined) {
  return result?.status === 'matched'
    ? { ...(ocr && typeof ocr === 'object' ? ocr : {}), plant: plantLabel(result.plant), ticketNumber: result.ticketNumber }
    : ocr;
}
