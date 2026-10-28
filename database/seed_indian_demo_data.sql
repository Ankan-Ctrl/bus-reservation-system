SET ECHO OFF
SET VERIFY OFF
SET FEEDBACK ON
SET SERVEROUTPUT ON SIZE UNLIMITED
SET DEFINE OFF
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

PROMPT Adding fictional Indian bus-reservation demo data.
PROMPT Passenger names and bus operators are marked DEMO; some simulated payments are Paid.

ALTER SESSION SET CONTAINER = ORCLPDB;
ALTER SESSION SET CURRENT_SCHEMA = BUSRES_OWNER;

DECLARE
  TYPE t_texts IS VARRAY(5) OF VARCHAR2(100);
  TYPE t_numbers IS VARRAY(5) OF NUMBER;
  TYPE t_ids IS VARRAY(5) OF NUMBER;
  TYPE t_six_numbers IS VARRAY(6) OF NUMBER;
  TYPE t_six_texts IS VARRAY(6) OF VARCHAR2(100);
  TYPE t_six_chars IS VARRAY(6) OF CHAR(1);
  TYPE t_six_labels IS VARRAY(6) OF VARCHAR2(11);

  v_bus_numbers t_texts := t_texts(
    'DEMO-TN-01-1001', 'DEMO-KA-01-1002', 'DEMO-TS-01-1003',
    'DEMO-MH-01-1004', 'DEMO-DL-01-1005'
  );
  v_operators t_texts := t_texts(
    'DEMO - Southern Star', 'DEMO - Deccan Express', 'DEMO - Godavari Travels',
    'DEMO - Western Ghats', 'DEMO - Pink City Lines'
  );
  v_bus_types t_texts := t_texts(
    'AC Sleeper', 'AC Seater', 'AC Sleeper', 'AC Seater', 'AC Sleeper'
  );
  v_sources t_texts := t_texts(
    'Chennai', 'Bengaluru', 'Hyderabad', 'Mumbai', 'Delhi'
  );
  v_destinations t_texts := t_texts(
    'Madurai', 'Chennai', 'Vijayawada', 'Pune', 'Jaipur'
  );
  v_distances t_numbers := t_numbers(462, 346, 274, 150, 281);
  v_durations t_numbers := t_numbers(8, 6, 5, 4, 5);
  v_fares t_numbers := t_numbers(850, 720, 560, 390, 610);
  v_departure_hours t_numbers := t_numbers(22, 21, 20, 19, 21);
  v_bus_ids t_ids := t_ids(NULL, NULL, NULL, NULL, NULL);
  v_route_ids t_ids := t_ids(NULL, NULL, NULL, NULL, NULL);
  v_schedule_ids t_ids := t_ids(NULL, NULL, NULL, NULL, NULL);

  v_demo_names t_six_texts := t_six_texts(
    'DEMO - Aarav Sharma', 'DEMO - Meera Iyer', 'DEMO - Kabir Rao',
    'DEMO - Ananya Menon', 'DEMO - Ishaan Kulkarni', 'DEMO - Diya Singh'
  );
  v_demo_emails t_six_texts := t_six_texts(
    'demo.aarav@example.invalid', 'demo.meera@example.invalid',
    'demo.kabir@example.invalid', 'demo.ananya@example.invalid',
    'demo.ishaan@example.invalid', 'demo.diya@example.invalid'
  );
  v_demo_phones t_six_texts := t_six_texts(
    'DEMO-0001', 'DEMO-0002', 'DEMO-0003',
    'DEMO-0004', 'DEMO-0005', 'DEMO-0006'
  );
  v_demo_ages t_six_numbers := t_six_numbers(32, 28, 66, 31, 41, 24);
  v_demo_genders t_six_chars := t_six_chars('M', 'F', 'M', 'F', 'M', 'F');
  v_demo_seats t_six_labels := t_six_labels('S5', 'S21', 'S27', 'S4', 'S6', 'S22');
  v_demo_passenger_ids t_six_numbers := t_six_numbers(NULL, NULL, NULL, NULL, NULL, NULL);
  v_booking_ids t_six_numbers := t_six_numbers(NULL, NULL, NULL, NULL, NULL, NULL);
  v_seat_id seat.seat_id%TYPE;
  v_bus_id bus.bus_id%TYPE;
  v_route_id route.route_id%TYPE;
  v_schedule_id schedule.schedule_id%TYPE;
  v_booking_id booking.booking_id%TYPE;
  v_passenger_id passenger.passenger_id%TYPE;
  v_existing_count NUMBER;
  v_offset NUMBER;
  v_route_index NUMBER;
BEGIN
  MERGE INTO passenger p
  USING (
    SELECT 'DEMO - Aarav Sharma' full_name, 'demo.aarav@example.invalid' email, 'DEMO-0001' phone FROM dual UNION ALL
    SELECT 'DEMO - Meera Iyer', 'demo.meera@example.invalid', 'DEMO-0002' FROM dual UNION ALL
    SELECT 'DEMO - Kabir Rao', 'demo.kabir@example.invalid', 'DEMO-0003' FROM dual UNION ALL
    SELECT 'DEMO - Ananya Menon', 'demo.ananya@example.invalid', 'DEMO-0004' FROM dual UNION ALL
    SELECT 'DEMO - Ishaan Kulkarni', 'demo.ishaan@example.invalid', 'DEMO-0005' FROM dual UNION ALL
    SELECT 'DEMO - Diya Singh', 'demo.diya@example.invalid', 'DEMO-0006' FROM dual
  ) source
  ON (p.email = source.email)
  WHEN NOT MATCHED THEN
    INSERT (full_name, email, phone)
    VALUES (source.full_name, source.email, source.phone);

  MERGE INTO bus b
  USING (
    SELECT 'DEMO-TN-01-1001' bus_number, 'DEMO - Southern Star' operator_name, 'AC Sleeper' bus_type FROM dual UNION ALL
    SELECT 'DEMO-KA-01-1002', 'DEMO - Deccan Express', 'AC Seater' FROM dual UNION ALL
    SELECT 'DEMO-TS-01-1003', 'DEMO - Godavari Travels', 'AC Sleeper' FROM dual UNION ALL
    SELECT 'DEMO-MH-01-1004', 'DEMO - Western Ghats', 'AC Seater' FROM dual UNION ALL
    SELECT 'DEMO-DL-01-1005', 'DEMO - Pink City Lines', 'AC Sleeper' FROM dual
  ) source
  ON (b.bus_number = source.bus_number)
  WHEN MATCHED THEN UPDATE SET
    b.operator_name = source.operator_name,
    b.bus_type = source.bus_type,
    b.total_seats = 30
  WHEN NOT MATCHED THEN
    INSERT (bus_number, operator_name, bus_type, total_seats)
    VALUES (source.bus_number, source.operator_name, source.bus_type, 30);

  MERGE INTO route r
  USING (
    SELECT 'Chennai' source_city, 'Madurai' destination_city, 462 distance_km, 8 est_duration_hrs FROM dual UNION ALL
    SELECT 'Bengaluru', 'Chennai', 346, 6 FROM dual UNION ALL
    SELECT 'Hyderabad', 'Vijayawada', 274, 5 FROM dual UNION ALL
    SELECT 'Mumbai', 'Pune', 150, 4 FROM dual UNION ALL
    SELECT 'Delhi', 'Jaipur', 281, 5 FROM dual
  ) source
  ON (r.source_city = source.source_city AND r.destination_city = source.destination_city)
  WHEN MATCHED THEN UPDATE SET
    r.distance_km = source.distance_km,
    r.est_duration_hrs = source.est_duration_hrs
  WHEN NOT MATCHED THEN
    INSERT (source_city, destination_city, distance_km, est_duration_hrs)
    VALUES (source.source_city, source.destination_city, source.distance_km, source.est_duration_hrs);

  FOR idx IN 1..5 LOOP
    SELECT bus_id
      INTO v_bus_ids(idx)
      FROM bus
     WHERE bus_number = v_bus_numbers(idx);

    SELECT route_id
      INTO v_route_ids(idx)
      FROM route
     WHERE source_city = v_sources(idx)
       AND destination_city = v_destinations(idx);

    FOR v_seat_idx IN 1..30 LOOP
      INSERT INTO seat (bus_id, seat_number, seat_type, seat_category)
      SELECT v_bus_ids(idx),
             'S' || TO_CHAR(v_seat_idx),
             CASE WHEN MOD(v_seat_idx, 2) = 0 THEN 'Sleeper' ELSE 'Seater' END,
             CASE
               WHEN v_seat_idx BETWEEN 21 AND 26 THEN 'Ladies'
               WHEN v_seat_idx BETWEEN 27 AND 30 THEN 'Senior'
               ELSE 'General'
             END
        FROM dual
       WHERE NOT EXISTS (
         SELECT 1
           FROM seat existing_seat
          WHERE existing_seat.bus_id = v_bus_ids(idx)
             AND existing_seat.seat_number = 'S' || TO_CHAR(v_seat_idx)
       );
    END LOOP;

    IF idx <= 4 THEN
      FOR v_offset IN 1..30 LOOP
        MERGE INTO schedule target
        USING (
          SELECT v_bus_ids(idx) bus_id,
                 v_route_ids(idx) route_id,
                 TRUNC(SYSDATE) + v_offset travel_date,
                 TRUNC(SYSDATE) + v_offset + v_departure_hours(idx) / 24 departure_time,
                 TRUNC(SYSDATE) + v_offset +
                   (v_departure_hours(idx) + v_durations(idx)) / 24 arrival_time,
                 v_fares(idx) base_fare
            FROM dual
        ) source
        ON (target.bus_id = source.bus_id
            AND target.route_id = source.route_id
            AND target.travel_date >= source.travel_date
            AND target.travel_date < source.travel_date + 1)
        WHEN MATCHED THEN UPDATE SET
          target.departure_time = source.departure_time,
          target.arrival_time = source.arrival_time,
          target.base_fare = source.base_fare
        WHEN NOT MATCHED THEN
          INSERT (bus_id, route_id, travel_date, departure_time, arrival_time, base_fare, available_seats)
          VALUES (source.bus_id, source.route_id, source.travel_date, source.departure_time,
                  source.arrival_time, source.base_fare, 30);

        IF v_offset = 1 THEN
          SELECT schedule_id
            INTO v_schedule_ids(idx)
            FROM schedule
           WHERE bus_id = v_bus_ids(idx)
             AND route_id = v_route_ids(idx)
             AND travel_date >= TRUNC(SYSDATE) + 1
             AND travel_date < TRUNC(SYSDATE) + 2;
        END IF;
      END LOOP;
    ELSE
      FOR v_occurrence IN 0..11 LOOP
        v_offset := 5 + (v_occurrence * 7);
        MERGE INTO schedule target
        USING (
          SELECT v_bus_ids(idx) bus_id,
                 v_route_ids(idx) route_id,
                 TRUNC(SYSDATE) + v_offset travel_date,
                 TRUNC(SYSDATE) + v_offset + v_departure_hours(idx) / 24 departure_time,
                 TRUNC(SYSDATE) + v_offset +
                   (v_departure_hours(idx) + v_durations(idx)) / 24 arrival_time,
                 v_fares(idx) base_fare
            FROM dual
        ) source
        ON (target.bus_id = source.bus_id
            AND target.route_id = source.route_id
            AND target.travel_date >= source.travel_date
            AND target.travel_date < source.travel_date + 1)
        WHEN MATCHED THEN UPDATE SET
          target.departure_time = source.departure_time,
          target.arrival_time = source.arrival_time,
          target.base_fare = source.base_fare
        WHEN NOT MATCHED THEN
          INSERT (bus_id, route_id, travel_date, departure_time, arrival_time, base_fare, available_seats)
          VALUES (source.bus_id, source.route_id, source.travel_date, source.departure_time,
                  source.arrival_time, source.base_fare, 30);

        IF v_occurrence = 0 THEN
          SELECT schedule_id
            INTO v_schedule_ids(idx)
            FROM schedule
           WHERE bus_id = v_bus_ids(idx)
             AND route_id = v_route_ids(idx)
             AND travel_date >= TRUNC(SYSDATE) + 5
             AND travel_date < TRUNC(SYSDATE) + 6;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  FOR idx IN 1..6 LOOP
    SELECT passenger_id
      INTO v_demo_passenger_ids(idx)
      FROM passenger
     WHERE email = v_demo_emails(idx);
  END LOOP;

  FOR idx IN 1..6 LOOP
    IF idx <= 2 THEN
      v_route_index := 1;
    ELSE
      v_route_index := idx - 1;
    END IF;

    SELECT COUNT(*)
      INTO v_existing_count
      FROM booking existing_booking
      JOIN schedule existing_schedule ON existing_schedule.schedule_id = existing_booking.schedule_id
     WHERE existing_booking.passenger_id = v_demo_passenger_ids(idx)
       AND existing_schedule.bus_id = v_bus_ids(v_route_index)
       AND existing_schedule.route_id = v_route_ids(v_route_index);

    IF v_existing_count > 0 THEN
      SELECT booking_id, schedule_id
        INTO v_booking_id, v_schedule_id
        FROM (
          SELECT existing_booking.booking_id, existing_booking.schedule_id
            FROM booking existing_booking
            JOIN schedule existing_schedule ON existing_schedule.schedule_id = existing_booking.schedule_id
           WHERE existing_booking.passenger_id = v_demo_passenger_ids(idx)
             AND existing_schedule.bus_id = v_bus_ids(v_route_index)
             AND existing_schedule.route_id = v_route_ids(v_route_index)
           ORDER BY existing_schedule.travel_date DESC, existing_booking.booking_id DESC
        )
       WHERE ROWNUM = 1;
    ELSE
      v_schedule_id := v_schedule_ids(v_route_index);
      MERGE INTO booking target
      USING (
        SELECT v_demo_passenger_ids(idx) passenger_id,
               v_schedule_id schedule_id,
               fare.base_fare total_amount
          FROM schedule fare
         WHERE fare.schedule_id = v_schedule_id
      ) source
      ON (target.passenger_id = source.passenger_id AND target.schedule_id = source.schedule_id)
      WHEN NOT MATCHED THEN
        INSERT (passenger_id, schedule_id, total_amount, booking_status)
        VALUES (source.passenger_id, source.schedule_id, source.total_amount, 'Confirmed');

      SELECT booking_id
        INTO v_booking_id
        FROM booking
       WHERE passenger_id = v_demo_passenger_ids(idx)
         AND schedule_id = v_schedule_id;
    END IF;

    v_booking_ids(idx) := v_booking_id;

    SELECT COUNT(*)
      INTO v_existing_count
      FROM ticket
     WHERE booking_id = v_booking_id;

    IF v_existing_count = 0 THEN
      SELECT seat_id
        INTO v_seat_id
        FROM seat
       WHERE bus_id = v_bus_ids(v_route_index)
         AND seat_number = v_demo_seats(idx);

      INSERT INTO ticket (
        booking_id, seat_id, passenger_name, passenger_age, passenger_gender, ticket_fare
      )
      SELECT v_booking_id, v_seat_id, v_demo_names(idx), v_demo_ages(idx),
             v_demo_genders(idx), s.base_fare
        FROM schedule s
       WHERE s.schedule_id = v_schedule_id;
    END IF;

    INSERT INTO payment (booking_id, amount, payment_mode, payment_status, refund_amount)
    SELECT v_booking_id, s.base_fare, 'UPI',
           CASE WHEN idx IN (1, 3, 5) THEN 'Paid' ELSE 'Pending' END,
           0
      FROM schedule s
     WHERE s.schedule_id = v_schedule_id
       AND NOT EXISTS (
         SELECT 1 FROM payment existing_payment WHERE existing_payment.booking_id = v_booking_id
       );

    UPDATE payment
       SET payment_status = CASE WHEN idx IN (1, 3, 5) THEN 'Paid' ELSE 'Pending' END,
           refund_amount = 0
     WHERE booking_id = v_booking_id;
  END LOOP;

  COMMIT;

  DBMS_OUTPUT.PUT_LINE('Four routes run daily for 30 days; Delhi-Jaipur runs weekly for 12 weeks.');
  DBMS_OUTPUT.PUT_LINE('Five demo buses each seat 30 passengers; schedules are dated Oracle rows.');
  DBMS_OUTPUT.PUT_LINE('Passenger IDs for the booking-history form:');
  FOR idx IN 1..6 LOOP
    DBMS_OUTPUT.PUT_LINE(v_demo_names(idx) || ' | passenger ID ' || v_demo_passenger_ids(idx) ||
                         ' | booking ID ' || v_booking_ids(idx));
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/

PROMPT Paid statuses below are simulated demo records; no money was received.

COLUMN full_name FORMAT A34
COLUMN source_city FORMAT A16
COLUMN destination_city FORMAT A16
COLUMN booking_status FORMAT A12
SELECT p.passenger_id AS passenger_id,
       p.full_name AS full_name,
       b.booking_id AS booking_id,
       r.source_city AS source_city,
       r.destination_city AS destination_city,
       TRUNC(s.travel_date) AS travel_date,
       b.booking_status AS booking_status
  FROM passenger p
  JOIN booking b ON b.passenger_id = p.passenger_id
  JOIN schedule s ON s.schedule_id = b.schedule_id
  JOIN route r ON r.route_id = s.route_id
 WHERE p.email LIKE 'demo.%@example.invalid'
 ORDER BY p.passenger_id, b.booking_id;

SELECT r.source_city,
       r.destination_city,
       CASE
         WHEN r.source_city = 'Delhi' AND r.destination_city = 'Jaipur' THEN 'Weekly'
         ELSE 'Daily'
       END AS service_frequency,
       COUNT(*) AS scheduled_departures,
       MIN(TRUNC(s.travel_date)) AS first_trip,
       MAX(TRUNC(s.travel_date)) AS last_trip
  FROM route r
  JOIN schedule s ON s.route_id = r.route_id
  JOIN bus b ON b.bus_id = s.bus_id
 WHERE b.bus_number LIKE 'DEMO-%'
   AND s.travel_date >= TRUNC(SYSDATE) + 1
   AND (
     (r.source_city = 'Delhi' AND r.destination_city = 'Jaipur'
       AND s.travel_date < TRUNC(SYSDATE) + 83
       AND MOD(TRUNC(s.travel_date) - (TRUNC(SYSDATE) + 5), 7) = 0)
     OR
     ((r.source_city <> 'Delhi' OR r.destination_city <> 'Jaipur')
       AND s.travel_date < TRUNC(SYSDATE) + 31)
   )
 GROUP BY r.source_city, r.destination_city
 ORDER BY r.source_city;
