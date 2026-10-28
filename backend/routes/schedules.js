const express = require("express");
const oracledb = require("oracledb");
const { asyncRoute } = require("../lib/errors");
const { withConnection } = require("../config/database");

const router = express.Router();

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

router.get("/routes", asyncRoute(async (request, response) => {
  const result = await withConnection((connection) => connection.execute(
    `SELECT DISTINCT source_city AS "sourceCity",
                    destination_city AS "destinationCity"
       FROM route
      ORDER BY source_city, destination_city`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  ));
  response.json({ items: result.rows });
}));

router.get("/schedules", asyncRoute(async (request, response) => {
  const { source, destination, travelDate } = request.query;
  if (typeof source !== "string" || !source.trim() || typeof destination !== "string" || !destination.trim() || typeof travelDate !== "string" || !isValidDate(travelDate)) {
    return response.status(400).json({ error: true, code: "INVALID_SEARCH", message: "Provide source, destination, and travelDate in YYYY-MM-DD format." });
  }
  const result = await withConnection((connection) => connection.execute(
    `SELECT sch.schedule_id AS "scheduleId",
            sch.bus_id AS "busId",
            sch.route_id AS "routeId",
            r.source_city AS "source",
            r.destination_city AS "destination",
            r.distance_km AS "distanceKm",
            r.est_duration_hrs AS "durationHours",
            sch.travel_date AS "travelDate",
            sch.departure_time AS "departureTime",
            sch.arrival_time AS "arrivalTime",
            sch.base_fare AS "fare",
            get_available_seats(sch.schedule_id) AS "availableSeats",
            b.bus_number AS "busNumber",
            b.operator_name AS "busName",
            b.bus_type AS "busType",
            b.total_seats AS "totalSeats"
       FROM schedule sch
       JOIN route r ON r.route_id = sch.route_id
       JOIN bus b ON b.bus_id = sch.bus_id
      WHERE UPPER(TRIM(r.source_city)) = UPPER(TRIM(:source))
        AND UPPER(TRIM(r.destination_city)) = UPPER(TRIM(:destination))
        AND sch.travel_date >= TO_DATE(:travelDate, 'YYYY-MM-DD')
        AND sch.travel_date < TO_DATE(:travelDate, 'YYYY-MM-DD') + 1
        AND get_available_seats(sch.schedule_id) > 0
      ORDER BY sch.departure_time, b.operator_name`,
    { source: source.trim(), destination: destination.trim(), travelDate },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  ));
  response.json({ items: result.rows });
}));

router.get("/schedules/:scheduleId/seats", asyncRoute(async (request, response) => {
  const scheduleId = Number(request.params.scheduleId);
  if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) {
    return response.status(400).json({ error: true, code: "INVALID_SCHEDULE_ID", message: "Schedule ID must be a positive integer." });
  }
  const result = await withConnection((connection) => connection.execute(
    `SELECT st.seat_id AS "seatId",
            st.seat_number AS "seatNumber",
            st.seat_type AS "seatType",
            st.seat_category AS "category",
            CASE
              WHEN is_seat_available(:scheduleId, st.seat_id) = 'Y' THEN 'available'
              ELSE 'booked'
            END AS "status"
       FROM seat st
       JOIN schedule sch ON sch.bus_id = st.bus_id
      WHERE sch.schedule_id = :scheduleId
      ORDER BY TO_NUMBER(SUBSTR(st.seat_number, 2))`,
    { scheduleId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  ));
  response.json({ items: result.rows });
}));

module.exports = router;
