export const READER_VERSION = 3;
export const PLANT_LABELS = Object.freeze({
  'martin-marietta': 'Martin Marietta / Hunter',
  'colorado-materials': 'Colorado Materials',
  'la-grange': 'La Grange / Fayette (WM CCP Solutions)',
});
export function plantLabel(plant) { return PLANT_LABELS[plant]; }

export function isConfirmedRead(read) {
  return !!(read?.status === 'matched' && PLANT_LABELS[read.plant] &&
    /^\d{6,12}$/.test(read.ticketNumber || '') && read.confidence >= .93);
}

export function needsTicketRead(read) {
  // La Grange's existing poor photos will be retaken. Adding its template must
  // not rescan the already-attempted v2 images or guess their missing numbers.
  return !isConfirmedRead(read) && !(read?.version >= 2);
}

export function preferredTicketRead(existing, incoming) {
  if (isConfirmedRead(existing)) return existing;
  if (isConfirmedRead(incoming)) return incoming;
  return (existing?.version || 0) >= (incoming?.version || 0) ? existing : incoming;
}
