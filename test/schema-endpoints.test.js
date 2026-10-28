const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const express = require("express");

const database = require("../backend/config/database");
const { errorHandler } = require("../backend/lib/errors");
const executed = [];
const exportedTables = [];

const exportedColumns = {
  PASSENGER: ["PASSENGER_ID", "FULL_NAME", "EMAIL", "PHONE"],
  BUS: ["BUS_ID", "BUS_NUMBER", "OPERATOR_NAME", "BUS_TYPE", "TOTAL_SEATS"],
  SEAT: ["SEAT_ID", "BUS_ID", "SEAT_NUMBER", "SEAT_TYPE", "SEAT_CATEGORY"],
  ROUTE: ["ROUTE_ID", "SOURCE_CITY", "DESTINATION_CITY", "DISTANCE_KM", "EST_DURATION_HRS"],
  SCHEDULE: ["SCHEDULE_ID", "BUS_ID", "ROUTE_ID", "TRAVEL_DATE", "DEPARTURE_TIME", "ARRIVAL_TIME", "BASE_FARE", "AVAILABLE_SEATS"],
  BOOKING: ["BOOKING_ID", "PASSENGER_ID", "SCHEDULE_ID", "BOOKING_DATE", "TOTAL_AMOUNT", "BOOKING_STATUS"],
  TICKET: ["TICKET_ID", "BOOKING_ID", "SEAT_ID", "PASSENGER_NAME", "PASSENGER_AGE", "PASSENGER_GENDER", "TICKET_FARE"],
  PAYMENT: ["PAYMENT_ID", "BOOKING_ID", "AMOUNT", "PAYMENT_MODE", "PAYMENT_STATUS", "PAYMENT_DATE", "REFUND_AMOUNT"]
};

const fakeRows = {
  routes: [{ sourceCity: "Chennai", destinationCity: "Madurai" }],
  schedules: [{
    scheduleId: 10,
    busId: 4,
    routeId: 2,
    source: "Chennai",
    destination: "Madurai",
    distanceKm: 462,
    durationHours: 8,
    travelDate: "2026-10-30",
    departureTime: "2026-10-30T16:15:00.000Z",
    arrivalTime: "2026-10-31T00:15:00.000Z",
    fare: 850,
    availableSeats: 18,
    busNumber: "TN-01-AB-1234",
    busName: "Vaigai Travels",
    busType: "AC Sleeper",
    totalSeats: 30
  }],
  seats: [{ seatId: 51, seatNumber: "S21", seatType: "Sleeper", category: "Ladies", status: "available" }],
  overview: [{ busCount: 4, routeCount: 6, scheduleCount: 9, bookingCount: 12, confirmedBookingCount: 8, paidAmount: 6800 }],
  buses: [{ busId: 4, busNumber: "TN-01-AB-1234", operatorName: "Vaigai Travels", busType: "AC Sleeper", totalSeats: 30 }],
  adminRoutes: [{ routeId: 2, sourceCity: "Chennai", destinationCity: "Madurai", distanceKm: 462, estimatedDurationHours: 8 }],
  adminSchedules: [{ scheduleId: 10, availableSeats: 18 }],
  bookings: [{ bookingId: 29, accountHolder: "Priya Nair", sourceCity: "Chennai", destinationCity: "Madurai", seats: "S21" }],
  booking: [{
    bookingId: 29,
    passengerId: 3,
    scheduleId: 10,
    bookingDate: "2026-10-28",
    travelDate: "2026-10-30",
    totalAmount: 850,
    bookingStatus: "Confirmed",
    departureTime: "2026-10-30T16:15:00.000Z",
    arrivalTime: "2026-10-31T00:15:00.000Z",
    source: "Chennai",
    destination: "Madurai",
    busNumber: "TN-01-AB-1234",
    busName: "Vaigai Travels",
    busType: "AC Sleeper"
  }],
  tickets: [{ ticketId: 55, passengerName: "Priya Nair", passengerAge: 25, passengerGender: "F", ticketFare: 850, seatNumber: "S21", seatType: "Sleeper", seatCategory: "Ladies" }],
  payments: [{ paymentId: 72, amount: 850, paymentMode: "UPI", paymentStatus: "Paid", paymentDate: "2026-10-28", refundAmount: 0 }],
  passengerHistory: [{ bookingId: 29, passengerId: 3, source: "Chennai", destination: "Madurai", passengerName: "Priya Nair", seatNumber: "S21", seatCategory: "Ladies" }],
  bookingReport: [{ label: "Confirmed", bookingCount: 8, totalAmount: 6800 }],
  paymentReport: [{ label: "Paid", paymentCount: 8, totalAmount: 6800, refundAmount: 0 }]
};

const connection = {
  async execute(sql, binds = {}) {
    executed.push({ sql, binds });
    if (sql.includes("saarthi_admin.")) {
      if (sql.includes("create_bus")) return { outBinds: { recordId: 31 } };
      if (sql.includes("create_route")) return { outBinds: { recordId: 32 } };
      if (sql.includes("create_schedule")) return { outBinds: { recordId: 33 } };
      if (sql.includes("delete_route")) {
        const error = new Error("Cannot delete a route that has scheduled or historical trips");
        error.errorNum = 20112;
        throw error;
      }
      return {};
    }
    if (sql.includes(" FROM passenger ORDER BY passenger_id") ||
        sql.includes(" FROM bus ORDER BY bus_id") ||
        sql.includes(" FROM seat ORDER BY seat_id") ||
        sql.includes(" FROM route ORDER BY route_id") ||
        sql.includes(" FROM schedule ORDER BY schedule_id") ||
        sql.includes(" FROM booking ORDER BY booking_id") ||
        sql.includes(" FROM ticket ORDER BY ticket_id") ||
        sql.includes(" FROM payment ORDER BY payment_id")) {
      const table = sql.match(/FROM\s+([A-Z]+)/i)[1].toUpperCase();
      exportedTables.push(table);
      let fetched = false;
      return {
        metaData: exportedColumns[table].map((name) => ({ name })),
        resultSet: {
          async getRows() {
            if (fetched) return [];
            fetched = true;
            return [[1, `test-${table}`, "demo@example.invalid", "+91 98765 43210"]];
          },
          async close() {}
        }
      };
    }
    if (sql.includes("book_ticket_with_contact(")) return { outBinds: { bookingId: 29, passengerId: 17 } };
    if (sql.includes("book_ticket(")) return { outBinds: { bookingId: 29 } };
    if (sql.includes("cancel_booking(")) return {};
    if (sql.includes('AS "ticketId"')) return { rows: fakeRows.tickets };
    if (sql.includes('AS "paymentId"')) return { rows: fakeRows.payments };
    if (sql.includes('AS "passengerId"') && sql.includes("FROM booking bk")) return { rows: fakeRows.booking };
    if (sql.includes('AS "passengerName"') && sql.includes("FROM booking b")) return { rows: fakeRows.passengerHistory };
    if (sql.includes('AS "sourceCity"') && sql.includes("FROM route")) return { rows: fakeRows.routes };
    if (sql.includes('AS "scheduleId"') && sql.includes("JOIN route r ON r.route_id = sch.route_id") && sql.includes("get_available_seats")) return { rows: fakeRows.schedules };
    if (sql.includes('AS "seatType"') && sql.includes("FROM seat st")) return { rows: fakeRows.seats };
    if (sql.includes('AS "busCount"')) return { rows: fakeRows.overview };
    if (sql.includes('AS "busNumber"') && sql.includes("FROM bus")) return { rows: fakeRows.buses };
    if (sql.includes('AS "estimatedDurationHours"')) return { rows: fakeRows.adminRoutes };
    if (sql.includes('AS "scheduleId"') && sql.includes("FROM schedule sch")) return { rows: fakeRows.adminSchedules };
    if (sql.includes('AS "accountHolder"')) return { rows: fakeRows.bookings };
    if (sql.includes("GROUP BY booking_status")) return { rows: fakeRows.bookingReport };
    if (sql.includes("GROUP BY payment_status")) return { rows: fakeRows.paymentReport };
    throw new Error(`Unexpected SQL in endpoint test: ${sql}`);
  }
};

database.withConnection = async (callback) => callback(connection);

const app = express();
app.use(express.json());
app.use("/api", require("../backend/routes/schedules"));
app.use("/api", require("../backend/routes/bookings"));
app.use("/api/admin", require("../backend/routes/admin"));
app.use(errorHandler);
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("route suggestions use the route entities shown in the ER diagram", async () => {
  const response = await fetch(`${baseUrl}/routes`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: fakeRows.routes });
});

test("trip search binds route cities and date and returns ER diagram bus/schedule fields", async () => {
  const response = await fetch(`${baseUrl}/schedules?source=Chennai&destination=Madurai&travelDate=2026-10-30`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.items[0].scheduleId, 10);
  assert.equal(body.items[0].busNumber, "TN-01-AB-1234");
  assert.equal(body.items[0].distanceKm, 462);
  assert.equal(body.items[0].availableSeats, 18);

  const call = executed.find(({ sql }) => sql.includes("get_available_seats"));
  assert.deepEqual(call.binds, { source: "Chennai", destination: "Madurai", travelDate: "2026-10-30" });
  assert.match(call.sql, /r\.route_id\s*=\s*sch\.route_id/i);
  assert.match(call.sql, /b\.bus_id\s*=\s*sch\.bus_id/i);
});

test("trip search rejects impossible calendar dates", async () => {
  const countBefore = executed.length;
  const response = await fetch(`${baseUrl}/schedules?source=Chennai&destination=Madurai&travelDate=2026-02-31`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_SEARCH");
  assert.equal(executed.length, countBefore);
});

test("seat availability includes the ER seat type and reserved-seat category", async () => {
  const response = await fetch(`${baseUrl}/schedules/10/seats`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.items[0].seatType, "Sleeper");
  assert.equal(body.items[0].category, "Ladies");
  assert.match(executed.find(({ sql }) => sql.includes('AS "seatType"')).sql, /is_seat_available/i);
});

test("booking saves passenger contact through PL/SQL and ticket lookup returns route, seat, and refund details", async () => {
  const bookingResponse = await fetch(`${baseUrl}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scheduleId: 10,
      seatNumber: "S21",
      travellerName: "Priya Nair",
      email: "Priya.Nair@example.com",
      phone: "+91 98765 43210",
      travellerAge: 25,
      travellerGender: "F",
      paymentMode: "UPI"
    })
  });
  assert.equal(bookingResponse.status, 201);
  assert.deepEqual(await bookingResponse.json(), { bookingId: 29, passengerId: 17 });
  const procedure = executed.find(({ sql }) => sql.includes("book_ticket_with_contact("));
  assert.equal(procedure.binds.fullName.val, "Priya Nair");
  assert.equal(procedure.binds.email.val, "priya.nair@example.com");
  assert.equal(procedure.binds.phone.val, "+91 98765 43210");
  assert.equal(procedure.binds.seatNumber.val, "S21");
  assert.match(procedure.sql, /p_schedule_id\s*=>\s*:scheduleId/);
  assert.match(procedure.sql, /p_passenger_id\s*=>\s*:passengerId/);

  const ticketResponse = await fetch(`${baseUrl}/bookings/29`);
  const ticket = await ticketResponse.json();
  assert.equal(ticketResponse.status, 200);
  assert.equal(ticket.source, "Chennai");
  assert.equal(ticket.travelDate, "2026-10-30");
  assert.equal(ticket.tickets[0].seatCategory, "Ladies");
  assert.equal(ticket.tickets[0].seatType, "Sleeper");
  assert.equal(ticket.payments[0].refundAmount, 0);
});

test("booking rejects invalid contact details before calling Oracle", async () => {
  const countBefore = executed.length;
  const response = await fetch(`${baseUrl}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scheduleId: 10,
      seatNumber: "S5",
      travellerName: "Priya Nair",
      email: "not-an-email",
      phone: "12",
      travellerAge: 25,
      travellerGender: "F",
      paymentMode: "UPI"
    })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_INPUT");
  assert.equal(executed.length, countBefore);
});

test("booking rejects phone numbers with fewer than seven digits", async () => {
  const countBefore = executed.length;
  const response = await fetch(`${baseUrl}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scheduleId: 10,
      seatNumber: "S5",
      travellerName: "Priya Nair",
      email: "priya.nair@example.com",
      phone: "12-34",
      travellerAge: 25,
      travellerGender: "F",
      paymentMode: "UPI"
    })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /phone number/i);
  assert.equal(executed.length, countBefore);
});

test("passenger booking history follows the passenger-to-booking relationship", async () => {
  const response = await fetch(`${baseUrl}/passengers/3/bookings`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.items[0].source, "Chennai");
  assert.equal(body.items[0].seatNumber, "S21");
  const query = executed.find(({ sql }) => sql.includes('AS "passengerName"') && sql.includes("FROM booking b"));
  assert.match(query.sql, /b\.passenger_id\s*=\s*:passengerId/);
  assert.match(query.sql, /r\.route_id\s*=\s*s\.route_id/);
});

test("admin overview and entity lists return read-only Oracle-shaped data", async () => {
  const overview = await fetch(`${baseUrl}/admin/overview`);
  assert.equal((await overview.json()).summary.confirmedBookingCount, 8);

  const buses = await fetch(`${baseUrl}/admin/buses`);
  assert.equal((await buses.json()).items[0].operatorName, "Vaigai Travels");

  const routes = await fetch(`${baseUrl}/admin/routes`);
  assert.equal((await routes.json()).items[0].sourceCity, "Chennai");

  const reports = await fetch(`${baseUrl}/admin/reports`);
  const report = await reports.json();
  assert.equal(report.bookings[0].bookingCount, 8);
  assert.equal(report.payments[0].refundAmount, 0);
});

test("admin create, edit, and delete use only the managed service tables", async () => {
  const response = await fetch(`${baseUrl}/admin/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 })
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, "ADMIN_CREATE_NOT_ALLOWED");
});

test("admin adds buses, routes, and schedules through the scoped Oracle package", async () => {
  const creations = [
    {
      resource: "buses",
      expectedId: 31,
      input: { busNumber: "NEW-TN-01-0001", operatorName: "Local Express", busType: "AC Seater", totalSeats: 24 },
      procedure: "create_bus",
      expectedBind: ["total_seats", 24]
    },
    {
      resource: "routes",
      expectedId: 32,
      input: { sourceCity: "Chennai", destinationCity: "Salem", distanceKm: 342, estimatedDurationHours: 6.5 },
      procedure: "create_route",
      expectedBind: ["source_city", "Chennai"]
    },
    {
      resource: "schedules",
      expectedId: 33,
      input: {
        busId: 4,
        routeId: 2,
        travelDate: "2026-11-02",
        departureTime: "08:30",
        arrivalTime: "15:00",
        baseFare: 720
      },
      procedure: "create_schedule",
      expectedBind: ["bus_id", 4]
    }
  ];

  for (const creation of creations) {
    const response = await fetch(`${baseUrl}/admin/${creation.resource}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creation.input)
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      created: true,
      resource: creation.resource,
      id: creation.expectedId
    });
    const call = executed.findLast(({ sql }) => sql.includes(`saarthi_admin.${creation.procedure}`));
    assert.ok(call);
    assert.equal(call.binds[creation.expectedBind[0]].val, creation.expectedBind[1]);
    assert.equal(call.binds.recordId.dir, require("oracledb").BIND_OUT);
  }
});

test("admin create rejects invalid fields before Oracle execution", async () => {
  const countBefore = executed.length;
  const response = await fetch(`${baseUrl}/admin/buses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      busNumber: "NEW-TN-01-0001",
      operatorName: "Local Express",
      busType: "AC Seater",
      totalSeats: 24,
      ownerPassword: "unexpected"
    })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_INPUT");
  assert.equal(executed.length, countBefore);
});

test("admin edits call only the allowlisted Oracle package procedures", async () => {
  const response = await fetch(`${baseUrl}/admin/buses/4`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      busNumber: "TN-01-AB-4321",
      operatorName: "Vaigai Travels",
      busType: "AC Sleeper",
      totalSeats: 30
    })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updated: true, resource: "buses", id: 4 });
  const call = executed.find(({ sql }) => sql.includes("saarthi_admin.update_bus"));
  assert.equal(call.binds.recordId.val, 4);
  assert.equal(call.binds.bus_number.val, "TN-01-AB-4321");
  assert.equal(call.binds.total_seats.val, 30);
});

test("admin edits reject unapproved table attributes before Oracle execution", async () => {
  const countBefore = executed.length;
  const response = await fetch(`${baseUrl}/admin/buses/4`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      busNumber: "TN-01-AB-4321",
      operatorName: "Vaigai Travels",
      busType: "AC Sleeper",
      totalSeats: 30,
      password: "unexpected"
    })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_INPUT");
  assert.equal(executed.length, countBefore);
});

test("admin cannot edit or delete protected passenger, booking, ticket, or payment rows", async () => {
  const update = await fetch(`${baseUrl}/admin/passengers/3`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "Changed" })
  });
  assert.equal(update.status, 403);
  assert.equal((await update.json()).code, "ADMIN_EDIT_NOT_ALLOWED");

  const deletion = await fetch(`${baseUrl}/admin/payments/72`, { method: "DELETE" });
  assert.equal(deletion.status, 403);
  assert.equal((await deletion.json()).code, "ADMIN_DELETE_NOT_ALLOWED");
});

test("admin receives a database constraint message for referenced route deletion", async () => {
  const response = await fetch(`${baseUrl}/admin/routes/2`, { method: "DELETE" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "ADMIN_CHANGE_REJECTED");
});

test("database export returns one ZIP archive with every Oracle entity", async () => {
  const response = await fetch(`${baseUrl}/admin/export.zip`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/zip/);
  const archive = Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...archive.subarray(0, 2)], [0x50, 0x4b]);
  assert.deepEqual([...new Set(exportedTables)].sort(), Object.keys(exportedColumns).sort());
});
