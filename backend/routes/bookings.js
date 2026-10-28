const express = require("express");
const oracledb = require("oracledb");
const { asyncRoute } = require("../lib/errors");
const { withConnection } = require("../config/database");

const router = express.Router();

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    const error = new Error(`${name} must be a positive integer.`);
    error.status = 400;
    error.code = "INVALID_INPUT";
    throw error;
  }
  return number;
}

async function getBooking(connection, bookingId) {
  const bookingResult = await connection.execute(
    `SELECT bk.booking_id AS "bookingId",
            bk.passenger_id AS "passengerId",
            bk.schedule_id AS "scheduleId",
            bk.booking_date AS "bookingDate",
            bk.total_amount AS "totalAmount",
            bk.booking_status AS "bookingStatus",
            sch.travel_date AS "travelDate",
            sch.departure_time AS "departureTime",
            sch.arrival_time AS "arrivalTime",
            rt.source_city AS "source",
            rt.destination_city AS "destination",
            bus.bus_number AS "busNumber",
            bus.operator_name AS "busName",
            bus.bus_type AS "busType"
       FROM booking bk
       JOIN schedule sch ON sch.schedule_id = bk.schedule_id
       JOIN route rt ON rt.route_id = sch.route_id
       JOIN bus ON bus.bus_id = sch.bus_id
      WHERE bk.booking_id = :bookingId`,
    { bookingId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const booking = bookingResult.rows[0];
  if (!booking) return null;

  const ticketResult = await connection.execute(
    `SELECT t.ticket_id AS "ticketId",
            t.passenger_name AS "passengerName",
            t.passenger_age AS "passengerAge",
            t.passenger_gender AS "passengerGender",
            t.ticket_fare AS "ticketFare",
            st.seat_number AS "seatNumber",
            st.seat_type AS "seatType",
            st.seat_category AS "seatCategory"
       FROM ticket t
       JOIN seat st ON st.seat_id = t.seat_id
      WHERE t.booking_id = :bookingId`,
    { bookingId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const paymentResult = await connection.execute(
    `SELECT payment_id AS "paymentId",
            amount AS "amount",
            payment_mode AS "paymentMode",
            payment_status AS "paymentStatus",
            payment_date AS "paymentDate",
            refund_amount AS "refundAmount"
       FROM payment
      WHERE booking_id = :bookingId`,
    { bookingId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return {
    ...booking,
    tickets: ticketResult.rows,
    payments: paymentResult.rows
  };
}

router.post("/bookings", asyncRoute(async (request, response) => {
  const { scheduleId, seatNumber, travellerName, email, phone, travellerAge, travellerGender, paymentMode } = request.body;
  const schedule = positiveInteger(scheduleId, "scheduleId");
  if (typeof seatNumber !== "string" || !/^S\d{1,3}$/i.test(seatNumber.trim())) {
    return response.status(400).json({ error: true, code: "INVALID_INPUT", message: "seatNumber must be a seat label such as S5." });
  }
  if (typeof travellerName !== "string" || !travellerName.trim() || travellerName.trim().length > 100) {
    return response.status(400).json({ error: true, code: "INVALID_INPUT", message: "travellerName is required and must be 100 characters or fewer." });
  }
  if (typeof email !== "string" || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return response.status(400).json({ error: true, code: "INVALID_INPUT", message: "Enter a valid email address of 254 characters or fewer." });
  }
  if (typeof phone !== "string" || phone.trim().length > 20 || !/^[+0-9().\-\s]{7,20}$/.test(phone.trim()) || phone.replace(/\D/g, "").length < 7) {
    return response.status(400).json({ error: true, code: "INVALID_INPUT", message: "Enter a phone number with at least 7 digits and at most 20 characters." });
  }
  if (!Number.isSafeInteger(travellerAge) || travellerAge < 1 || travellerAge > 120) {
    return response.status(400).json({ error: true, code: "INVALID_INPUT", message: "travellerAge must be between 1 and 120." });
  }
  if (!["F", "M"].includes(travellerGender)) {
    return response.status(400).json({ error: true, code: "INVALID_INPUT", message: "travellerGender must be F or M, the values demonstrated by the supplied SQL." });
  }
  if (paymentMode !== "UPI") {
    return response.status(400).json({ error: true, code: "INVALID_INPUT", message: "Only UPI is enabled because it is the payment mode demonstrated by the supplied SQL." });
  }

  const result = await withConnection((connection) => connection.execute(
    `BEGIN
       book_ticket_with_contact(
         p_full_name => :fullName,
         p_email => :email,
         p_phone => :phone,
         p_schedule_id => :scheduleId,
         p_seat_number => :seatNumber,
         p_trav_age => :travellerAge,
         p_trav_gender => :travellerGender,
         p_pay_mode => :paymentMode,
         p_passenger_id => :passengerId,
         p_booking_id => :bookingId
       );
     END;`,
    {
      fullName: { val: travellerName.trim(), type: oracledb.STRING, maxSize: 100 },
      email: { val: email.trim().toLowerCase(), type: oracledb.STRING, maxSize: 254 },
      phone: { val: phone.trim(), type: oracledb.STRING, maxSize: 20 },
      scheduleId: { val: schedule, type: oracledb.NUMBER },
      seatNumber: { val: seatNumber.trim().toUpperCase(), type: oracledb.STRING, maxSize: 11 },
      travellerAge: { val: travellerAge, type: oracledb.NUMBER },
      travellerGender: { val: travellerGender, type: oracledb.STRING, maxSize: 1 },
      paymentMode: { val: paymentMode, type: oracledb.STRING, maxSize: 30 },
      passengerId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      bookingId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }
  ));
  response.status(201).json({
    bookingId: result.outBinds.bookingId,
    passengerId: result.outBinds.passengerId
  });
}));

router.get("/bookings/:bookingId", asyncRoute(async (request, response) => {
  const bookingId = positiveInteger(request.params.bookingId, "bookingId");
  const booking = await withConnection((connection) => getBooking(connection, bookingId));
  if (!booking) return response.status(404).json({ error: true, code: "BOOKING_NOT_FOUND", message: "No booking was found with that ID." });
  response.json(booking);
}));

router.get("/passengers/:passengerId/bookings", asyncRoute(async (request, response) => {
  const passengerId = positiveInteger(request.params.passengerId, "passengerId");
  const result = await withConnection((connection) => connection.execute(
    `SELECT b.booking_id AS "bookingId",
            b.passenger_id AS "passengerId",
            b.schedule_id AS "scheduleId",
            b.booking_date AS "bookingDate",
            b.total_amount AS "totalAmount",
            b.booking_status AS "bookingStatus",
            s.travel_date AS "travelDate",
            r.source_city AS "source",
            r.destination_city AS "destination",
            t.passenger_name AS "passengerName",
            st.seat_number AS "seatNumber",
            st.seat_category AS "seatCategory"
       FROM booking b
       JOIN schedule s ON s.schedule_id = b.schedule_id
       JOIN route r ON r.route_id = s.route_id
       LEFT JOIN ticket t ON t.booking_id = b.booking_id
       LEFT JOIN seat st ON st.seat_id = t.seat_id
      WHERE b.passenger_id = :passengerId
      ORDER BY b.booking_id DESC`,
    { passengerId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  ));
  response.json({ items: result.rows });
}));

router.post("/bookings/:bookingId/cancel", asyncRoute(async (request, response) => {
  const bookingId = positiveInteger(request.params.bookingId, "bookingId");
  const booking = await withConnection(async (connection) => {
    await connection.execute("BEGIN cancel_booking(:bookingId); END;", { bookingId });
    return getBooking(connection, bookingId);
  });
  if (!booking) return response.status(404).json({ error: true, code: "BOOKING_NOT_FOUND", message: "No booking was found with that ID." });
  response.json({ booking });
}));

module.exports = router;
