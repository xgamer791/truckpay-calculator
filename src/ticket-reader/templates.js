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

// Colorado Materials: bold company heading at upper left; TICKET # at upper
// right above the date/time and POUNDS / TONS / LOADS table. Learned from the
// full user-supplied form, not the number-only close-up.
export const COLORADO_TEMPLATE = Object.freeze({
  id: 'colorado-materials-v1',
  supplier: 'colorado-materials',
  companyHeading: 'coloradomaterials',
  identityRegion: { x: 0, y: 0, width: .60, height: .60 },
  ticketRegion: { x: .55, y: 0, width: .44, height: .53 },
  numberLabel: 'TICKET #',
  numberPlacement: 'same row, right of TICKET #; above date/time and weight table',
  excludedFields: ['ORDER', 'PO', 'VEHICLE', 'CUSTOMER', 'PRODUCT', 'SCALE #'],
});

// La Grange / Fayette: WM CCP Solutions form. The number is on the left,
// below the company/address heading and immediately right of "Ticket No:".
// Hunter Plant is the CUSTOMER DESTINATION, not the originating plant.
export const LA_GRANGE_TEMPLATE = Object.freeze({
  id: 'la-grange-v1',
  supplier: 'la-grange',
  companyHeading: 'wmccpsolutions',
  source: { name: 'fayette', street: '6549powerplantrd', city: 'lagrange' },
  identityRegion: { x: 0, y: 0, width: .65, height: .65 },
  ticketRegion: { x: 0, y: .12, width: .61, height: .43 },
  numberLabel: 'Ticket No:',
  numberPlacement: 'same row, right of Ticket No; above Source and Source Address',
  excludedFields: ['PO #', 'Truck No', 'Trailer No', 'Source Address', 'Customer Destination', 'Gross', 'Tare', 'Net'],
});
