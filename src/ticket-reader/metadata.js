export const READER_VERSION = 2;
export const PLANT_LABELS = Object.freeze({
  'martin-marietta': 'Martin Marietta / Hunter',
  'colorado-materials': 'Colorado Materials',
});
export function plantLabel(plant) { return PLANT_LABELS[plant]; }

export function isConfirmedRead(read) {
  return !!(read?.status === 'matched' && PLANT_LABELS[read.plant] &&
    /^\d{6,12}$/.test(read.ticketNumber || '') && read.confidence >= .93);
}

export function needsTicketRead(read) {
  // Retain confirmed Marietta reads; revisit previously ignored tickets now
  // that Colorado Materials is supported. No repeated OCR on every login.
  return !isConfirmedRead(read) && !(read?.version >= READER_VERSION);
}

export function preferredTicketRead(existing, incoming) {
  if (isConfirmedRead(existing)) return existing;
  if (isConfirmedRead(incoming)) return incoming;
  return (existing?.version || 0) >= (incoming?.version || 0) ? existing : incoming;
}
