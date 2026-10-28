const { ZipArchive } = require("archiver");
const express = require("express");
const oracledb = require("oracledb");
const { Readable } = require("node:stream");
const { asyncRoute } = require("../lib/errors");
const { withConnection } = require("../config/database");

const router = express.Router();
const supportedResources = new Set(["overview", "buses", "routes", "schedules", "bookings", "reports"]);
const objectRows = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const queries = {
  overview: `
    SELECT (SELECT COUNT(*) FROM bus) AS "busCount",
           (SELECT COUNT(*) FROM route) AS "routeCount",
           (SELECT COUNT(*) FROM schedule) AS "scheduleCount",
           (SELECT COUNT(*) FROM booking) AS "bookingCount",
           (SELECT COUNT(*) FROM booking WHERE UPPER(booking_status) = 'CONFIRMED') AS "confirmedBookingCount",
           (SELECT NVL(SUM(amount), 0) FROM payment WHERE UPPER(payment_status) = 'PAID') AS "paidAmount"
      FROM dual`,
  buses: `
    SELECT bus_id AS "busId",
           bus_number AS "busNumber",
           operator_name AS "operatorName",
           bus_type AS "busType",
           total_seats AS "totalSeats"
      FROM bus
     ORDER BY bus_id
     FETCH FIRST 200 ROWS ONLY`,
  routes: `
    SELECT route_id AS "routeId",
           source_city AS "sourceCity",
           destination_city AS "destinationCity",
           distance_km AS "distanceKm",
           est_duration_hrs AS "estimatedDurationHours"
      FROM route
     ORDER BY route_id
     FETCH FIRST 200 ROWS ONLY`,
  schedules: `
    SELECT sch.schedule_id AS "scheduleId",
           sch.travel_date AS "travelDate",
           sch.departure_time AS "departureTime",
           sch.arrival_time AS "arrivalTime",
           sch.base_fare AS "baseFare",
           sch.available_seats AS "availableSeats",
           b.bus_number AS "busNumber",
           b.operator_name AS "operatorName",
           r.source_city AS "sourceCity",
           r.destination_city AS "destinationCity"
      FROM schedule sch
      JOIN bus b ON b.bus_id = sch.bus_id
      JOIN route r ON r.route_id = sch.route_id
     ORDER BY sch.travel_date DESC, sch.departure_time
     FETCH FIRST 200 ROWS ONLY`,
  bookings: `
    SELECT bk.booking_id AS "bookingId",
           p.full_name AS "accountHolder",
           bk.schedule_id AS "scheduleId",
           r.source_city AS "sourceCity",
           r.destination_city AS "destinationCity",
           bk.booking_date AS "bookingDate",
           sch.travel_date AS "travelDate",
           bk.total_amount AS "totalAmount",
           bk.booking_status AS "bookingStatus",
           (SELECT LISTAGG(t.passenger_name, ', ') WITHIN GROUP (ORDER BY t.ticket_id)
              FROM ticket t
             WHERE t.booking_id = bk.booking_id) AS "travellers",
           (SELECT LISTAGG(st.seat_number, ', ') WITHIN GROUP (ORDER BY st.seat_number)
              FROM ticket t
              JOIN seat st ON st.seat_id = t.seat_id
             WHERE t.booking_id = bk.booking_id) AS "seats"
      FROM booking bk
      JOIN passenger p ON p.passenger_id = bk.passenger_id
      JOIN schedule sch ON sch.schedule_id = bk.schedule_id
      JOIN route r ON r.route_id = sch.route_id
     ORDER BY bk.booking_date DESC, bk.booking_id DESC
     FETCH FIRST 200 ROWS ONLY`,
  reports: `
    SELECT booking_status AS "label",
           COUNT(*) AS "bookingCount",
           SUM(total_amount) AS "totalAmount"
      FROM booking
     GROUP BY booking_status
     ORDER BY booking_status`
};

const exportTables = [
  ["PASSENGER", "SELECT passenger_id, full_name, email, phone FROM passenger ORDER BY passenger_id"],
  ["BUS", "SELECT bus_id, bus_number, operator_name, bus_type, total_seats FROM bus ORDER BY bus_id"],
  ["SEAT", "SELECT seat_id, bus_id, seat_number, seat_type, seat_category FROM seat ORDER BY seat_id"],
  ["ROUTE", "SELECT route_id, source_city, destination_city, distance_km, est_duration_hrs FROM route ORDER BY route_id"],
  ["SCHEDULE", "SELECT schedule_id, bus_id, route_id, travel_date, departure_time, arrival_time, base_fare, available_seats FROM schedule ORDER BY schedule_id"],
  ["BOOKING", "SELECT booking_id, passenger_id, schedule_id, booking_date, total_amount, booking_status FROM booking ORDER BY booking_id"],
  ["TICKET", "SELECT ticket_id, booking_id, seat_id, passenger_name, passenger_age, passenger_gender, ticket_fare FROM ticket ORDER BY ticket_id"],
  ["PAYMENT", "SELECT payment_id, booking_id, amount, payment_mode, payment_status, payment_date, refund_amount FROM payment ORDER BY payment_id"]
];

const editProcedures = {
  buses: {
    idField: "busId",
    procedure: "saarthi_admin.update_bus",
    fields: [
      ["busNumber", "bus_number", "string", 20],
      ["operatorName", "operator_name", "string", 100],
      ["busType", "bus_type", "string", 30],
      ["totalSeats", "total_seats", "integer", 300]
    ]
  },
  routes: {
    idField: "routeId",
    procedure: "saarthi_admin.update_route",
    fields: [
      ["sourceCity", "source_city", "string", 100],
      ["destinationCity", "destination_city", "string", 100],
      ["distanceKm", "distance_km", "number", 999999],
      ["estimatedDurationHours", "est_duration_hrs", "number", 9999]
    ]
  },
  schedules: {
    idField: "scheduleId",
    procedure: "saarthi_admin.update_schedule",
    fields: [
      ["travelDate", "travel_date", "date", 10],
      ["departureTime", "departure_time", "time", 5],
      ["arrivalTime", "arrival_time", "time", 5],
      ["baseFare", "base_fare", "number", 99999999]
    ]
  }
};

const createProcedures = {
  buses: {
    procedure: "saarthi_admin.create_bus",
    fields: [
      ["busNumber", "bus_number", "string", 20],
      ["operatorName", "operator_name", "string", 100],
      ["busType", "bus_type", "string", 30],
      ["totalSeats", "total_seats", "integer", 300]
    ]
  },
  routes: {
    procedure: "saarthi_admin.create_route",
    fields: [
      ["sourceCity", "source_city", "string", 100],
      ["destinationCity", "destination_city", "string", 100],
      ["distanceKm", "distance_km", "number", 999999],
      ["estimatedDurationHours", "est_duration_hrs", "number", 9999]
    ]
  },
  schedules: {
    procedure: "saarthi_admin.create_schedule",
    fields: [
      ["busId", "bus_id", "id"],
      ["routeId", "route_id", "id"],
      ["travelDate", "travel_date", "date", 10],
      ["departureTime", "departure_time", "time", 5],
      ["arrivalTime", "arrival_time", "time", 5],
      ["baseFare", "base_fare", "number", 99999999]
    ]
  }
};

const deleteProcedures = {
  buses: ["busId", "saarthi_admin.delete_bus"],
  routes: ["routeId", "saarthi_admin.delete_route"],
  schedules: ["scheduleId", "saarthi_admin.delete_schedule"]
};

function invalidInput(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "INVALID_INPUT";
  return error;
}

function positiveId(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw invalidInput(`${name} must be a positive integer.`);
  return number;
}

function validateField(field, column, kind, maximum, value) {
  if (kind === "string") {
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
      throw invalidInput(`${field} is required and must be ${maximum} characters or fewer.`);
    }
    return [column, value.trim(), oracledb.STRING, maximum];
  }
  if (kind === "integer" || kind === "id") {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || (maximum && number > maximum)) {
      throw invalidInput(kind === "id"
        ? `${field} must be a positive integer.`
        : `${field} must be a whole number between 1 and ${maximum}.`);
    }
    return [column, number, oracledb.NUMBER];
  }
  if (kind === "number") {
    if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
      throw invalidInput(`${field} is required.`);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < (field === "baseFare" ? 0 : Number.EPSILON) || number > maximum) {
      throw invalidInput(`${field} is outside the supported numeric range.`);
    }
    return [column, number, oracledb.NUMBER];
  }
  if (kind === "date" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) {
    throw invalidInput(`${field} must be a valid date in YYYY-MM-DD format.`);
  }
  if (kind === "time" && (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
    throw invalidInput(`${field} must be a valid 24-hour time in HH:MM format.`);
  }
  return [column, value, oracledb.STRING, maximum];
}

function validateCreate(resource, body) {
  const config = createProcedures[resource];
  if (!config || !body || typeof body !== "object" || Array.isArray(body)) {
    throw invalidInput("Unsupported admin create request.");
  }
  const allowedFields = new Set(config.fields.map(([field]) => field));
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    throw invalidInput("The request includes fields that are not allowed.");
  }
  const values = config.fields.map(([field, column, kind, maximum]) =>
    validateField(field, column, kind, maximum, body[field]));
  return { config, values };
}

function validateEdit(resource, body) {
  const config = editProcedures[resource];
  if (!config || !body || typeof body !== "object" || Array.isArray(body)) {
    throw invalidInput("Unsupported admin edit request.");
  }
  const allowedFields = new Set([config.idField, ...config.fields.map(([field]) => field)]);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    throw invalidInput("The request includes fields that are not editable.");
  }
  const id = positiveId(body[config.idField], config.idField);
  const values = config.fields.map(([field, column, kind, maximum]) =>
    validateField(field, column, kind, maximum, body[field]));
  return { id, values };
}

function csvCell(value) {
  let text = value instanceof Date
    ? value.toISOString()
    : Buffer.isBuffer(value)
      ? value.toString("base64")
      : String(value ?? "");
  if (typeof value !== "number" && typeof value !== "bigint" && /^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function* csvRows(resultSet, columns) {
  try {
    yield `\uFEFF${columns.map(({ name }) => csvCell(name)).join(",")}\r\n`;
    while (true) {
      const rows = await resultSet.getRows(500);
      if (!rows.length) break;
      for (const row of rows) {
        yield `${row.map(csvCell).join(",")}\r\n`;
      }
    }
  } finally {
    await resultSet.close();
  }
}

function appendCsv(archive, resultSet, columns, name) {
  const stream = Readable.from(csvRows(resultSet, columns));
  return new Promise((resolve, reject) => {
    const cleanup = () => archive.removeListener("error", onArchiveError);
    const onEnd = () => { cleanup(); resolve(); };
    const onStreamError = (error) => { cleanup(); reject(error); };
    const onArchiveError = (error) => { cleanup(); stream.destroy(error); reject(error); };
    stream.once("end", onEnd);
    stream.once("error", onStreamError);
    archive.once("error", onArchiveError);
    archive.append(stream, { name });
  });
}

router.use((request, response, next) => {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
    return response.status(403).json({
      error: true,
      code: "ADMIN_LOCAL_ONLY",
      message: "Admin management and full database export are available only from this machine."
    });
  }
  next();
});

router.get("/export.zip", asyncRoute(async (request, response) => {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("warning", (error) => {
    if (error.code !== "ENOENT") {
      console.error("[GET /api/admin/export.zip]", error);
      if (!response.destroyed) response.destroy(error);
    }
  });
  archive.on("error", (error) => {
    console.error("[GET /api/admin/export.zip]", error);
    if (!response.destroyed) response.destroy(error);
  });

  const today = new Date().toISOString().slice(0, 10);
  response.attachment(`saarthi-database-${today}.zip`);
  archive.pipe(response);

  await withConnection(async (connection) => {
    for (const [table, sql] of exportTables) {
      const result = await connection.execute(sql, {}, { resultSet: true });
      await appendCsv(archive, result.resultSet, result.metaData, `${table}.csv`);
    }
    await archive.finalize();
  });
}));

router.put("/:resource/:recordId", asyncRoute(async (request, response) => {
  const { resource } = request.params;
  const config = editProcedures[resource];
  if (!config) {
    return response.status(403).json({
      error: true,
      code: "ADMIN_EDIT_NOT_ALLOWED",
      message: "Only bus, route, and schedule records can be edited. Use cancellation for bookings."
    });
  }
  const { id, values } = validateEdit(resource, { ...request.body, [config.idField]: request.params.recordId });
  const names = values.map(([column]) => column);
  const binds = Object.fromEntries(values.map(([column, value, type, maxSize]) => [
    column,
    maxSize ? { val: value, type, maxSize } : { val: value, type }
  ]));
  binds.recordId = { val: id, type: oracledb.NUMBER };
  const callArguments = [
    ":recordId",
    ...names.map((column) => `:${column}`)
  ];
  await withConnection((connection) => connection.execute(
    `BEGIN ${config.procedure}(${callArguments.join(", ")}); END;`,
    binds
  ));
  response.json({ updated: true, resource, id });
}));

router.delete("/:resource/:recordId", asyncRoute(async (request, response) => {
  const { resource } = request.params;
  const config = deleteProcedures[resource];
  if (!config) {
    return response.status(403).json({
      error: true,
      code: "ADMIN_DELETE_NOT_ALLOWED",
      message: "Only unreferenced bus, route, and schedule records can be deleted. Use cancellation for bookings."
    });
  }
  const id = positiveId(request.params.recordId, config[0]);
  await withConnection((connection) => connection.execute(
    `BEGIN ${config[1]}(:recordId); END;`,
    { recordId: { val: id, type: oracledb.NUMBER } }
  ));
  response.json({ deleted: true, resource, id });
}));

router.post("/:resource", asyncRoute(async (request, response) => {
  const { resource } = request.params;
  const config = createProcedures[resource];
  if (!config) {
    return response.status(403).json({
      error: true,
      code: "ADMIN_CREATE_NOT_ALLOWED",
      message: "Only buses, routes, and schedules can be added. Create passengers and bookings through the reservation flow."
    });
  }
  const { values } = validateCreate(resource, request.body);
  const binds = Object.fromEntries(values.map(([column, value, type, maxSize]) => [
    column,
    maxSize ? { val: value, type, maxSize } : { val: value, type }
  ]));
  binds.recordId = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
  const result = await withConnection((connection) => connection.execute(
    `BEGIN ${config.procedure}(${values.map(([column]) => `:${column}`).concat(":recordId").join(", ")}); END;`,
    binds
  ));
  const id = Number(result.outBinds.recordId);
  response.status(201).json({ created: true, resource, id });
}));

router.get("/:resource", asyncRoute(async (request, response) => {
  const { resource } = request.params;
  if (!supportedResources.has(resource)) {
    return response.status(404).json({ error: true, code: "RESOURCE_NOT_FOUND", message: "Unknown admin resource." });
  }

  const result = await withConnection(async (connection) => {
    if (resource !== "overview" && resource !== "reports") {
      return connection.execute(queries[resource], {}, objectRows);
    }

    if (resource === "overview") {
      return connection.execute(queries.overview, {}, objectRows);
    }

    const bookings = await connection.execute(queries.reports, {}, objectRows);
    const payments = await connection.execute(
      `SELECT payment_status AS "label",
              COUNT(*) AS "paymentCount",
              SUM(amount) AS "totalAmount",
              SUM(refund_amount) AS "refundAmount"
         FROM payment
        GROUP BY payment_status
        ORDER BY payment_status`,
      {},
      objectRows
    );
    return { rows: bookings.rows, paymentRows: payments.rows };
  });

  if (resource === "overview") return response.json({ summary: result.rows[0] });
  if (resource === "reports") {
    return response.json({ bookings: result.rows, payments: result.paymentRows });
  }
  response.json({ items: result.rows });
}));

router.all("/:resource", (request, response) => {
  response.set("Allow", "GET, POST");
  response.status(405).json({
    error: true,
    code: "ADMIN_READ_ONLY",
    message: "Use the dedicated create, edit, and delete controls for bus, route, and schedule records."
  });
});

module.exports = router;
