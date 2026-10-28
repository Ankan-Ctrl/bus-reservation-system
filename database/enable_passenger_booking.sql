SET ECHO OFF
SET VERIFY OFF
SET FEEDBACK ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

ALTER SESSION SET CONTAINER = ORCLPDB;
ALTER SESSION SET CURRENT_SCHEMA = BUSRES_OWNER;

ALTER TABLE payment MODIFY (payment_status DEFAULT 'Pending');

CREATE OR REPLACE PROCEDURE book_ticket (
  p_passenger_id IN NUMBER,
  p_schedule_id IN NUMBER,
  p_seat_number IN VARCHAR2,
  p_trav_name IN VARCHAR2,
  p_trav_age IN NUMBER,
  p_trav_gender IN CHAR,
  p_pay_mode IN VARCHAR2,
  p_booking_id OUT NUMBER
)
IS
  v_bus_id schedule.bus_id%TYPE;
  v_fare schedule.base_fare%TYPE;
  v_available schedule.available_seats%TYPE;
  v_departure schedule.departure_time%TYPE;
  v_seat_id seat.seat_id%TYPE;
  v_category seat.seat_category%TYPE;
BEGIN
  IF p_trav_age NOT BETWEEN 1 AND 120 OR UPPER(p_trav_gender) NOT IN ('F', 'M') THEN
    RAISE_APPLICATION_ERROR(-20016, 'Passenger age or gender is invalid');
  END IF;
  IF UPPER(p_pay_mode) <> 'UPI' THEN
    RAISE_APPLICATION_ERROR(-20017, 'Only UPI payment mode is configured');
  END IF;

  SELECT bus_id, base_fare, available_seats, departure_time
    INTO v_bus_id, v_fare, v_available, v_departure
    FROM schedule
   WHERE schedule_id = p_schedule_id
     FOR UPDATE;

  IF v_available <= 0 THEN
    RAISE_APPLICATION_ERROR(-20012, 'The trip is full');
  END IF;
  IF v_departure <= SYSDATE THEN
    RAISE_APPLICATION_ERROR(-20015, 'The trip has already departed');
  END IF;

  SELECT seat_id, seat_category
    INTO v_seat_id, v_category
    FROM seat
   WHERE bus_id = v_bus_id
     AND seat_number = UPPER(TRIM(p_seat_number));

  IF v_category = 'Ladies' AND UPPER(p_trav_gender) <> 'F' THEN
    RAISE_APPLICATION_ERROR(-20040, 'This seat is reserved for women passengers');
  ELSIF v_category = 'Senior' AND p_trav_age < 60 THEN
    RAISE_APPLICATION_ERROR(-20041, 'This seat is reserved for senior citizens (age 60 and above)');
  END IF;

  IF is_seat_available(p_schedule_id, v_seat_id) = 'N' THEN
    RAISE_APPLICATION_ERROR(-20014, 'This seat is already booked on the selected trip');
  END IF;

  INSERT INTO booking (passenger_id, schedule_id, total_amount, booking_status)
  VALUES (p_passenger_id, p_schedule_id, v_fare, 'Confirmed')
  RETURNING booking_id INTO p_booking_id;

  INSERT INTO ticket (
    booking_id, seat_id, passenger_name, passenger_age, passenger_gender, ticket_fare
  ) VALUES (
    p_booking_id, v_seat_id, TRIM(p_trav_name), p_trav_age, UPPER(p_trav_gender), v_fare
  );

  INSERT INTO payment (booking_id, amount, payment_mode, payment_status)
  VALUES (p_booking_id, v_fare, UPPER(p_pay_mode), 'Pending');

  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
    RAISE_APPLICATION_ERROR(-20011, 'Passenger, trip, or seat was not found');
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END book_ticket;
/

CREATE OR REPLACE PROCEDURE book_ticket_with_contact (
  p_full_name IN VARCHAR2,
  p_email IN VARCHAR2,
  p_phone IN VARCHAR2,
  p_schedule_id IN NUMBER,
  p_seat_number IN VARCHAR2,
  p_trav_age IN NUMBER,
  p_trav_gender IN CHAR,
  p_pay_mode IN VARCHAR2,
  p_passenger_id OUT NUMBER,
  p_booking_id OUT NUMBER
)
IS
BEGIN
  IF TRIM(p_full_name) IS NULL OR LENGTH(TRIM(p_full_name)) > 100 THEN
    RAISE_APPLICATION_ERROR(-20018, 'Passenger full name is required and must be 100 characters or fewer');
  END IF;
  IF p_email IS NULL OR LENGTH(TRIM(p_email)) > 254 THEN
    RAISE_APPLICATION_ERROR(-20019, 'Passenger email is required and must be 254 characters or fewer');
  END IF;
  IF NOT REGEXP_LIKE(TRIM(p_email), '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN
    RAISE_APPLICATION_ERROR(-20021, 'Passenger email address is invalid');
  END IF;
  IF p_phone IS NULL OR LENGTH(TRIM(p_phone)) > 20 THEN
    RAISE_APPLICATION_ERROR(-20020, 'Passenger phone is required and must be 20 characters or fewer');
  END IF;
  IF NOT REGEXP_LIKE(TRIM(p_phone), '^[+0-9(). -]{7,20}$')
     OR LENGTH(REGEXP_REPLACE(TRIM(p_phone), '[^0-9]')) < 7 THEN
    RAISE_APPLICATION_ERROR(-20022, 'Passenger phone must contain at least 7 digits');
  END IF;

  INSERT INTO passenger (full_name, email, phone)
  VALUES (TRIM(p_full_name), LOWER(TRIM(p_email)), TRIM(p_phone))
  RETURNING passenger_id INTO p_passenger_id;

  book_ticket(
    p_passenger_id => p_passenger_id,
    p_schedule_id => p_schedule_id,
    p_seat_number => p_seat_number,
    p_trav_name => TRIM(p_full_name),
    p_trav_age => p_trav_age,
    p_trav_gender => p_trav_gender,
    p_pay_mode => p_pay_mode,
    p_booking_id => p_booking_id
  );
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END book_ticket_with_contact;
/

DECLARE
  v_errors NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO v_errors
    FROM all_errors
   WHERE owner = 'BUSRES_OWNER'
     AND name IN ('BOOK_TICKET', 'BOOK_TICKET_WITH_CONTACT');
  IF v_errors > 0 THEN
    RAISE_APPLICATION_ERROR(-20003, 'Booking procedure migration did not compile');
  END IF;
END;
/

GRANT EXECUTE ON book_ticket_with_contact TO BUSRES_WEB;
CREATE OR REPLACE SYNONYM BUSRES_WEB.BOOK_TICKET_WITH_CONTACT
  FOR BUSRES_OWNER.BOOK_TICKET_WITH_CONTACT;

ALTER SESSION SET CURRENT_SCHEMA = SYS;
PROMPT Passenger records are now created by the booking procedure.
