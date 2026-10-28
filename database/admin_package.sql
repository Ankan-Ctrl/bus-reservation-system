CREATE OR REPLACE PACKAGE saarthi_admin AUTHID DEFINER AS
  PROCEDURE create_bus (
    p_bus_number IN VARCHAR2,
    p_operator_name IN VARCHAR2,
    p_bus_type IN VARCHAR2,
    p_total_seats IN NUMBER,
    p_bus_id OUT NUMBER
  );
  PROCEDURE update_bus (
    p_bus_id IN NUMBER,
    p_bus_number IN VARCHAR2,
    p_operator_name IN VARCHAR2,
    p_bus_type IN VARCHAR2,
    p_total_seats IN NUMBER
  );
  PROCEDURE delete_bus (p_bus_id IN NUMBER);
  PROCEDURE create_route (
    p_source_city IN VARCHAR2,
    p_destination_city IN VARCHAR2,
    p_distance_km IN NUMBER,
    p_est_duration_hrs IN NUMBER,
    p_route_id OUT NUMBER
  );
  PROCEDURE update_route (
    p_route_id IN NUMBER,
    p_source_city IN VARCHAR2,
    p_destination_city IN VARCHAR2,
    p_distance_km IN NUMBER,
    p_est_duration_hrs IN NUMBER
  );
  PROCEDURE delete_route (p_route_id IN NUMBER);
  PROCEDURE create_schedule (
    p_bus_id IN NUMBER,
    p_route_id IN NUMBER,
    p_travel_date IN VARCHAR2,
    p_departure_time IN VARCHAR2,
    p_arrival_time IN VARCHAR2,
    p_base_fare IN NUMBER,
    p_schedule_id OUT NUMBER
  );
  PROCEDURE update_schedule (
    p_schedule_id IN NUMBER,
    p_travel_date IN VARCHAR2,
    p_departure_time IN VARCHAR2,
    p_arrival_time IN VARCHAR2,
    p_base_fare IN NUMBER
  );
  PROCEDURE delete_schedule (p_schedule_id IN NUMBER);
END saarthi_admin;
/

CREATE OR REPLACE PACKAGE BODY saarthi_admin AS
  PROCEDURE create_bus (
    p_bus_number IN VARCHAR2,
    p_operator_name IN VARCHAR2,
    p_bus_type IN VARCHAR2,
    p_total_seats IN NUMBER,
    p_bus_id OUT NUMBER
  )
  IS
  BEGIN
    IF TRIM(p_bus_number) IS NULL OR LENGTH(TRIM(p_bus_number)) > 20
       OR TRIM(p_operator_name) IS NULL OR LENGTH(TRIM(p_operator_name)) > 100
       OR TRIM(p_bus_type) IS NULL OR LENGTH(TRIM(p_bus_type)) > 30
       OR p_total_seats NOT BETWEEN 1 AND 300 THEN
      RAISE_APPLICATION_ERROR(-20110, 'Bus values are invalid or exceed supported limits');
    END IF;

    INSERT INTO bus (bus_number, operator_name, bus_type, total_seats)
    VALUES (TRIM(p_bus_number), TRIM(p_operator_name), TRIM(p_bus_type), p_total_seats)
    RETURNING bus_id INTO p_bus_id;

    FOR seat_number IN 1..p_total_seats LOOP
      INSERT INTO seat (bus_id, seat_number, seat_type, seat_category)
      VALUES (p_bus_id, 'S' || seat_number, 'Seater', 'General');
    END LOOP;

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END create_bus;

  PROCEDURE update_bus (
    p_bus_id IN NUMBER,
    p_bus_number IN VARCHAR2,
    p_operator_name IN VARCHAR2,
    p_bus_type IN VARCHAR2,
    p_total_seats IN NUMBER
  )
  IS
    v_current_seats bus.total_seats%TYPE;
    v_seat_count NUMBER;
    v_distinct_seats NUMBER;
    v_min_seat NUMBER;
    v_max_seat NUMBER;
    v_used_seats NUMBER;
    v_confirmed_bookings NUMBER;
  BEGIN
    IF TRIM(p_bus_number) IS NULL OR LENGTH(TRIM(p_bus_number)) > 20
       OR TRIM(p_operator_name) IS NULL OR LENGTH(TRIM(p_operator_name)) > 100
       OR TRIM(p_bus_type) IS NULL OR LENGTH(TRIM(p_bus_type)) > 30
       OR p_total_seats NOT BETWEEN 1 AND 300 THEN
      RAISE_APPLICATION_ERROR(-20110, 'Bus values are invalid or exceed supported limits');
    END IF;

    SELECT total_seats
      INTO v_current_seats
      FROM bus
     WHERE bus_id = p_bus_id
       FOR UPDATE;

    SELECT COUNT(*),
           COUNT(DISTINCT CASE
             WHEN REGEXP_LIKE(seat_number, '^S[0-9]{1,3}$')
             THEN TO_NUMBER(SUBSTR(seat_number, 2))
           END),
           MIN(CASE
             WHEN REGEXP_LIKE(seat_number, '^S[0-9]{1,3}$')
             THEN TO_NUMBER(SUBSTR(seat_number, 2))
           END),
           MAX(CASE
             WHEN REGEXP_LIKE(seat_number, '^S[0-9]{1,3}$')
             THEN TO_NUMBER(SUBSTR(seat_number, 2))
           END)
      INTO v_seat_count, v_distinct_seats, v_min_seat, v_max_seat
      FROM seat
     WHERE bus_id = p_bus_id;

    IF p_total_seats <> v_current_seats
       AND (v_seat_count <> v_current_seats
            OR v_distinct_seats <> v_current_seats
            OR v_min_seat <> 1
            OR v_max_seat <> v_current_seats) THEN
      RAISE_APPLICATION_ERROR(-20113, 'Seat inventory is not a sequential S1..Sn layout; change the fleet size in the database first');
    END IF;

    IF p_total_seats < v_current_seats THEN
      SELECT COUNT(*)
        INTO v_used_seats
        FROM ticket t
        JOIN seat st ON st.seat_id = t.seat_id
       WHERE st.bus_id = p_bus_id
         AND TO_NUMBER(SUBSTR(st.seat_number, 2)) > p_total_seats;
      IF v_used_seats > 0 THEN
        RAISE_APPLICATION_ERROR(-20113, 'Cannot remove seats referenced by ticket history');
      END IF;
      DELETE FROM seat
       WHERE bus_id = p_bus_id
         AND TO_NUMBER(SUBSTR(seat_number, 2)) > p_total_seats;
    ELSIF p_total_seats > v_current_seats THEN
      FOR seat_number IN v_current_seats + 1..p_total_seats LOOP
        INSERT INTO seat (bus_id, seat_number, seat_type, seat_category)
        VALUES (p_bus_id, 'S' || seat_number, 'Seater', 'General');
      END LOOP;
    END IF;

    UPDATE bus
       SET bus_number = TRIM(p_bus_number),
           operator_name = TRIM(p_operator_name),
           bus_type = TRIM(p_bus_type),
           total_seats = p_total_seats
     WHERE bus_id = p_bus_id;

    FOR trip IN (
      SELECT schedule_id
        FROM schedule
       WHERE bus_id = p_bus_id
       FOR UPDATE
    ) LOOP
      SELECT COUNT(*)
        INTO v_confirmed_bookings
        FROM booking
       WHERE schedule_id = trip.schedule_id
         AND booking_status = 'Confirmed';
      IF v_confirmed_bookings > p_total_seats THEN
        RAISE_APPLICATION_ERROR(-20113, 'Fleet size cannot be smaller than confirmed bookings on a scheduled trip');
      END IF;
      UPDATE schedule
         SET available_seats = p_total_seats - v_confirmed_bookings
       WHERE schedule_id = trip.schedule_id;
    END LOOP;

    COMMIT;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      ROLLBACK;
      RAISE_APPLICATION_ERROR(-20111, 'Bus was not found');
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END update_bus;

  PROCEDURE delete_bus (p_bus_id IN NUMBER)
  IS
    v_count NUMBER;
  BEGIN
    SELECT bus_id
      INTO v_count
      FROM bus
     WHERE bus_id = p_bus_id
       FOR UPDATE;

    SELECT COUNT(*) INTO v_count FROM schedule WHERE bus_id = p_bus_id;
    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(-20112, 'Cannot delete a bus that has scheduled or historical trips');
    END IF;

    SELECT COUNT(*)
      INTO v_count
      FROM ticket t
      JOIN seat st ON st.seat_id = t.seat_id
     WHERE st.bus_id = p_bus_id;
    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(-20112, 'Cannot delete a bus with ticket history');
    END IF;

    DELETE FROM seat WHERE bus_id = p_bus_id;
    DELETE FROM bus WHERE bus_id = p_bus_id;
    COMMIT;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      ROLLBACK;
      RAISE_APPLICATION_ERROR(-20111, 'Bus was not found');
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END delete_bus;

  PROCEDURE create_route (
    p_source_city IN VARCHAR2,
    p_destination_city IN VARCHAR2,
    p_distance_km IN NUMBER,
    p_est_duration_hrs IN NUMBER,
    p_route_id OUT NUMBER
  )
  IS
  BEGIN
    IF TRIM(p_source_city) IS NULL OR LENGTH(TRIM(p_source_city)) > 100
       OR TRIM(p_destination_city) IS NULL OR LENGTH(TRIM(p_destination_city)) > 100
       OR UPPER(TRIM(p_source_city)) = UPPER(TRIM(p_destination_city))
       OR p_distance_km <= 0 OR p_distance_km > 999999
       OR p_est_duration_hrs <= 0 OR p_est_duration_hrs > 9999 THEN
      RAISE_APPLICATION_ERROR(-20110, 'Route values are invalid or exceed supported limits');
    END IF;

    INSERT INTO route (source_city, destination_city, distance_km, est_duration_hrs)
    VALUES (TRIM(p_source_city), TRIM(p_destination_city), p_distance_km, p_est_duration_hrs)
    RETURNING route_id INTO p_route_id;
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END create_route;

  PROCEDURE update_route (
    p_route_id IN NUMBER,
    p_source_city IN VARCHAR2,
    p_destination_city IN VARCHAR2,
    p_distance_km IN NUMBER,
    p_est_duration_hrs IN NUMBER
  )
  IS
  BEGIN
    IF TRIM(p_source_city) IS NULL OR LENGTH(TRIM(p_source_city)) > 100
       OR TRIM(p_destination_city) IS NULL OR LENGTH(TRIM(p_destination_city)) > 100
       OR UPPER(TRIM(p_source_city)) = UPPER(TRIM(p_destination_city))
       OR p_distance_km <= 0 OR p_distance_km > 999999
       OR p_est_duration_hrs <= 0 OR p_est_duration_hrs > 9999 THEN
      RAISE_APPLICATION_ERROR(-20110, 'Route values are invalid or exceed supported limits');
    END IF;

    UPDATE route
       SET source_city = TRIM(p_source_city),
           destination_city = TRIM(p_destination_city),
           distance_km = p_distance_km,
           est_duration_hrs = p_est_duration_hrs
     WHERE route_id = p_route_id;
    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20111, 'Route was not found');
    END IF;
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END update_route;

  PROCEDURE delete_route (p_route_id IN NUMBER)
  IS
    v_count NUMBER;
  BEGIN
    SELECT route_id
      INTO v_count
      FROM route
     WHERE route_id = p_route_id
       FOR UPDATE;
    SELECT COUNT(*) INTO v_count FROM schedule WHERE route_id = p_route_id;
    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(-20112, 'Cannot delete a route that has scheduled or historical trips');
    END IF;

    DELETE FROM route WHERE route_id = p_route_id;
    COMMIT;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      ROLLBACK;
      RAISE_APPLICATION_ERROR(-20111, 'Route was not found');
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END delete_route;

  PROCEDURE create_schedule (
    p_bus_id IN NUMBER,
    p_route_id IN NUMBER,
    p_travel_date IN VARCHAR2,
    p_departure_time IN VARCHAR2,
    p_arrival_time IN VARCHAR2,
    p_base_fare IN NUMBER,
    p_schedule_id OUT NUMBER
  )
  IS
    v_total_seats bus.total_seats%TYPE;
    v_route_id route.route_id%TYPE;
    v_departure DATE;
    v_arrival DATE;
    v_travel_date DATE;
    v_count NUMBER;
  BEGIN
    IF NOT REGEXP_LIKE(p_travel_date, '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
       OR NOT REGEXP_LIKE(p_departure_time, '^([01][0-9]|2[0-3]):[0-5][0-9]$')
       OR NOT REGEXP_LIKE(p_arrival_time, '^([01][0-9]|2[0-3]):[0-5][0-9]$')
       OR p_base_fare < 0 OR p_base_fare > 99999999 THEN
      RAISE_APPLICATION_ERROR(-20110, 'Schedule date, times, or fare are invalid');
    END IF;

    v_travel_date := TO_DATE(p_travel_date, 'YYYY-MM-DD');
    v_departure := TO_DATE(p_travel_date || ' ' || p_departure_time, 'YYYY-MM-DD HH24:MI');
    v_arrival := TO_DATE(p_travel_date || ' ' || p_arrival_time, 'YYYY-MM-DD HH24:MI');
    IF v_arrival <= v_departure THEN
      v_arrival := v_arrival + 1;
    END IF;

    SELECT total_seats
      INTO v_total_seats
      FROM bus
     WHERE bus_id = p_bus_id
       FOR UPDATE;
    SELECT route_id
      INTO v_route_id
      FROM route
     WHERE route_id = p_route_id;

    SELECT COUNT(*)
      INTO v_count
      FROM schedule other_trip
     WHERE other_trip.bus_id = p_bus_id
       AND v_departure < other_trip.arrival_time
       AND v_arrival > other_trip.departure_time;
    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(-20114, 'This bus already has an overlapping departure');
    END IF;

    INSERT INTO schedule (
      bus_id, route_id, travel_date, departure_time, arrival_time, base_fare, available_seats
    )
    VALUES (
      p_bus_id, v_route_id, v_travel_date, v_departure, v_arrival, p_base_fare, v_total_seats
    )
    RETURNING schedule_id INTO p_schedule_id;
    COMMIT;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      ROLLBACK;
      RAISE_APPLICATION_ERROR(-20111, 'The selected bus or route was not found');
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END create_schedule;

  PROCEDURE update_schedule (
    p_schedule_id IN NUMBER,
    p_travel_date IN VARCHAR2,
    p_departure_time IN VARCHAR2,
    p_arrival_time IN VARCHAR2,
    p_base_fare IN NUMBER
  )
  IS
    v_bus_id schedule.bus_id%TYPE;
    v_departure DATE;
    v_arrival DATE;
    v_travel_date DATE;
    v_count NUMBER;
  BEGIN
    IF NOT REGEXP_LIKE(p_travel_date, '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
       OR NOT REGEXP_LIKE(p_departure_time, '^[0-9]{2}:[0-9]{2}$')
       OR NOT REGEXP_LIKE(p_arrival_time, '^[0-9]{2}:[0-9]{2}$')
       OR p_base_fare < 0 OR p_base_fare > 99999999 THEN
      RAISE_APPLICATION_ERROR(-20110, 'Schedule date, times, or fare are invalid');
    END IF;

    v_travel_date := TO_DATE(p_travel_date, 'YYYY-MM-DD');
    v_departure := TO_DATE(p_travel_date || ' ' || p_departure_time, 'YYYY-MM-DD HH24:MI');
    v_arrival := TO_DATE(p_travel_date || ' ' || p_arrival_time, 'YYYY-MM-DD HH24:MI');
    IF v_arrival <= v_departure THEN
      v_arrival := v_arrival + 1;
    END IF;

    SELECT bus_id
      INTO v_bus_id
      FROM schedule
     WHERE schedule_id = p_schedule_id;
    SELECT bus_id
      INTO v_bus_id
      FROM bus
     WHERE bus_id = v_bus_id
       FOR UPDATE;
    SELECT schedule_id
      INTO v_count
      FROM schedule
     WHERE schedule_id = p_schedule_id
       FOR UPDATE;

    SELECT COUNT(*)
      INTO v_count
      FROM booking
     WHERE schedule_id = p_schedule_id;
    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(-20112, 'Cannot edit a trip after bookings exist; cancel the booking instead');
    END IF;

    SELECT COUNT(*)
      INTO v_count
      FROM schedule other_trip
     WHERE other_trip.bus_id = v_bus_id
       AND other_trip.schedule_id <> p_schedule_id
       AND v_departure < other_trip.arrival_time
       AND v_arrival > other_trip.departure_time;
    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(-20114, 'This bus already has an overlapping departure');
    END IF;

    UPDATE schedule
       SET travel_date = v_travel_date,
           departure_time = v_departure,
           arrival_time = v_arrival,
           base_fare = p_base_fare
     WHERE schedule_id = p_schedule_id;
    COMMIT;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      ROLLBACK;
      RAISE_APPLICATION_ERROR(-20111, 'Schedule was not found');
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END update_schedule;

  PROCEDURE delete_schedule (p_schedule_id IN NUMBER)
  IS
    v_count NUMBER;
  BEGIN
    SELECT schedule_id
      INTO v_count
      FROM schedule
     WHERE schedule_id = p_schedule_id
       FOR UPDATE;
    SELECT COUNT(*) INTO v_count FROM booking WHERE schedule_id = p_schedule_id;
    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(-20112, 'Cannot delete a trip with booking history; cancel the booking instead');
    END IF;

    DELETE FROM schedule WHERE schedule_id = p_schedule_id;
    COMMIT;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      ROLLBACK;
      RAISE_APPLICATION_ERROR(-20111, 'Schedule was not found');
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END delete_schedule;
END saarthi_admin;
/
