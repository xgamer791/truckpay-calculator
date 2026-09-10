// Plant memory, created from the user's Hunter/Martin Marietta ticket example.
// Coordinates are fractions of the upright image, not a particular camera size.
// Add another supplier only after the user provides its ticket sample.
export const MARIETTA_TEMPLATE = Object.freeze({
  id: 'martin-marietta-v1',
  supplier: 'martin-marietta',
  companyHeading: 'martinmarietta',
  hunter: { logoWord: 'martin', name: 'hunterstone', plantCode: '54249', street: '7305fm1102' },
  identityRegion: { x: 0, y: 0, width: .60, height: .65 },
  ticketRegion: { x: .45, y: .05, width: .53, height: .58 },
  numberLabel: 'Ticket',
  numberPlacement: 'same row, immediately right of Ticket; above Vehicle/Carrier',
  excludedFields: ['Dispatch', 'Order No', 'Customer No', 'PO No', 'Vehicle'],
});
