export const TRUCKING_COMPANY = "JLP Trucking";

export const FLEET_TRUCKS = ["1203", "1204", "1211", "1210", "1205"] as const;

export function isFleetTruck(truckNumber: string): boolean {
  return FLEET_TRUCKS.some((truck) => truck === truckNumber);
}
