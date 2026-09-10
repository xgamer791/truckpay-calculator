import { makeFunctionReference } from "convex/server";

export const cloudApi = {
  profiles: {
    current: makeFunctionReference("profiles:current"),
    complete: makeFunctionReference("profiles:complete"),
    availableTrucks: makeFunctionReference("profiles:availableTrucks"),
  },
  sync: {
    reserveTicketNumber: makeFunctionReference('ticketNumbers:reserve'),
    releaseTicketNumber: makeFunctionReference('ticketNumbers:release'),
    applyTicketRead: makeFunctionReference('ticketReader:applyMine'),
    getMyState: makeFunctionReference("sync:getMyState"),
    generateTicketUploadUrl: makeFunctionReference("sync:generateTicketUploadUrl"),
    saveSnapshot: makeFunctionReference("sync:saveSnapshot"),
  },
  admin: {
    listDrivers: makeFunctionReference("admin:listDrivers"),
    getDriverState: makeFunctionReference("admin:getDriverState"),
  },
};
