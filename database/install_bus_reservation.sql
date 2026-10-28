SET ECHO OFF
SET VERIFY OFF
SET FEEDBACK ON
SET SERVEROUTPUT ON
SET DEFINE ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

PROMPT Installing the Saarthi reservation schema in ORCLPDB.
PROMPT This creates BUSRES_OWNER and BUSRES_WEB and does not add sample records.

ALTER SESSION SET CONTAINER = ORCLPDB;

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO v_count
    FROM dba_users
   WHERE username IN ('BUSRES_OWNER', 'BUSRES_WEB');
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20001, 'BUSRES_OWNER or BUSRES_WEB already exists; refusing to overwrite an existing installation.');
  END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM dba_tables
   WHERE table_name IN ('PASSENGER', 'BUS', 'SEAT', 'ROUTE', 'SCHEDULE', 'BOOKING', 'TICKET', 'PAYMENT');
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20002, 'Reservation tables already exist in this PDB; refusing to create a second schema without review.');
  END IF;
END;
/

ACCEPT web_password CHAR PROMPT 'Create a strong password for BUSRES_WEB (up to 30 characters); save it in the local .env: ' HIDE

CREATE USER BUSRES_OWNER NO AUTHENTICATION
  DEFAULT TABLESPACE USERS
  QUOTA 100M ON USERS;

CREATE USER BUSRES_WEB IDENTIFIED BY "&web_password"
  DEFAULT TABLESPACE USERS
  TEMPORARY TABLESPACE TEMP;

UNDEFINE web_password

GRANT CREATE SESSION TO BUSRES_WEB;
GRANT CREATE TABLE, CREATE SEQUENCE, CREATE PROCEDURE, CREATE TRIGGER TO BUSRES_OWNER;
ALTER SESSION SET CURRENT_SCHEMA = BUSRES_OWNER;

CREATE SEQUENCE seq_passenger START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 20;
CREATE SEQUENCE seq_bus       START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 20;
CREATE SEQUENCE seq_seat      START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 20;
CREATE SEQUENCE seq_route     START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 20;
CREATE SEQUENCE seq_schedule  START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 20;
CREATE SEQUENCE seq_booking   START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 20;
CREATE SEQUENCE seq_ticket    START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 20;
CREATE SEQUENCE seq_payment   START WITH 1 INCREMENT BY 1 NOCYCLE CACHE 20;

CREATE TABLE passenger (
  passenger_id NUMBER(10) DEFAULT seq_passenger.NEXTVAL NOT NULL,
  full_name VARCHAR2(100) NOT NULL,
  email VARCHAR2(254),
  phone VARCHAR2(20),
  CONSTRAINT pk_passenger PRIMARY KEY (passenger_id)
);

CREATE TABLE bus (
  bus_id NUMBER(10) DEFAULT seq_bus.NEXTVAL NOT NULL,
  bus_number VARCHAR2(20) NOT NULL,
  operator_name VARCHAR2(100) NOT NULL,
  bus_type VARCHAR2(30) NOT NULL,
  total_seats NUMBER(5) NOT NULL,
  CONSTRAINT pk_bus PRIMARY KEY (bus_id),
  CONSTRAINT uq_bus_number UNIQUE (bus_number),
  CONSTRAINT ck_bus_total_seats CHECK (total_seats > 0)
);

CREATE TABLE seat (
  seat_id NUMBER(10) DEFAULT seq_seat.NEXTVAL NOT NULL,
  bus_id NUMBER(10) NOT NULL,
  seat_number VARCHAR2(11) NOT NULL,
  seat_type VARCHAR2(30) NOT NULL,
  seat_category VARCHAR2(10) DEFAULT 'General' NOT NULL,
  CONSTRAINT pk_seat PRIMARY KEY (seat_id),
  CONSTRAINT fk_seat_bus FOREIGN KEY (bus_id) REFERENCES bus (bus_id),
  CONSTRAINT uq_seat_bus_number UNIQUE (bus_id, seat_number),
  CONSTRAINT ck_seat_category CHECK (seat_category IN ('General', 'Ladies', 'Senior')),
  CONSTRAINT ck_seat_number CHECK (REGEXP_LIKE(seat_number, '^S[0-9]{1,3}$'))
);

CREATE TABLE route (
  route_id NUMBER(10) DEFAULT seq_route.NEXTVAL NOT NULL,
  source_city VARCHAR2(100) NOT NULL,
  destination_city VARCHAR2(100) NOT NULL,
  distance_km NUMBER(8, 2) NOT NULL,
  est_duration_hrs NUMBER(6, 2) NOT NULL,
  CONSTRAINT pk_route PRIMARY KEY (route_id),
  CONSTRAINT uq_route_cities UNIQUE (source_city, destination_city),
  CONSTRAINT ck_route_cities CHECK (UPPER(TRIM(source_city)) <> UPPER(TRIM(destination_city))),
  CONSTRAINT ck_route_distance CHECK (distance_km > 0),
  CONSTRAINT ck_route_duration CHECK (est_duration_hrs > 0)
);

CREATE TABLE schedule (
  schedule_id NUMBER(10) DEFAULT seq_schedule.NEXTVAL NOT NULL,
  bus_id NUMBER(10) NOT NULL,
  route_id NUMBER(10) NOT NULL,
  travel_date DATE NOT NULL,
  departure_time DATE NOT NULL,
  arrival_time DATE NOT NULL,
  base_fare NUMBER(10, 2) NOT NULL,
  available_seats NUMBER(5) NOT NULL,
  CONSTRAINT pk_schedule PRIMARY KEY (schedule_id),
  CONSTRAINT fk_schedule_bus FOREIGN KEY (bus_id) REFERENCES bus (bus_id),
  CONSTRAINT fk_schedule_route FOREIGN KEY (route_id) REFERENCES route (route_id),
  CONSTRAINT ck_schedule_fare CHECK (base_fare >= 0),
  CONSTRAINT ck_schedule_available CHECK (available_seats >= 0)
);

CREATE TABLE booking (
  booking_id NUMBER(10) DEFAULT seq_booking.NEXTVAL NOT NULL,
  passenger_id NUMBER(10) NOT NULL,
  schedule_id NUMBER(10) NOT NULL,
  booking_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  total_amount NUMBER(10, 2) NOT NULL,
  booking_status VARCHAR2(20) DEFAULT 'Confirmed' NOT NULL,
  CONSTRAINT pk_booking PRIMARY KEY (booking_id),
  CONSTRAINT fk_booking_passenger FOREIGN KEY (passenger_id) REFERENCES passenger (passenger_id),
  CONSTRAINT fk_booking_schedule FOREIGN KEY (schedule_id) REFERENCES schedule (schedule_id),
  CONSTRAINT ck_booking_amount CHECK (total_amount >= 0),
  CONSTRAINT ck_booking_status CHECK (booking_status IN ('Confirmed', 'Cancelled'))
);

CREATE TABLE ticket (
  ticket_id NUMBER(10) DEFAULT seq_ticket.NEXTVAL NOT NULL,
  booking_id NUMBER(10) NOT NULL,
  seat_id NUMBER(10) NOT NULL,
  passenger_name VARCHAR2(100) NOT NULL,
  passenger_age NUMBER(3) NOT NULL,
  passenger_gender CHAR(1) NOT NULL,
  ticket_fare NUMBER(10, 2) NOT NULL,
  CONSTRAINT pk_ticket PRIMARY KEY (ticket_id),
  CONSTRAINT fk_ticket_booking FOREIGN KEY (booking_id) REFERENCES booking (booking_id),
  CONSTRAINT fk_ticket_seat FOREIGN KEY (seat_id) REFERENCES seat (seat_id),
  CONSTRAINT uq_ticket_booking UNIQUE (booking_id),
  CONSTRAINT ck_ticket_age CHECK (passenger_age BETWEEN 1 AND 120),
  CONSTRAINT ck_ticket_gender CHECK (passenger_gender IN ('F', 'M')),
  CONSTRAINT ck_ticket_fare CHECK (ticket_fare >= 0)
);

CREATE TABLE payment (
  payment_id NUMBER(10) DEFAULT seq_payment.NEXTVAL NOT NULL,
  booking_id NUMBER(10) NOT NULL,
  amount NUMBER(10, 2) NOT NULL,
  payment_mode VARCHAR2(30) NOT NULL,
  payment_status VARCHAR2(20) DEFAULT 'Pending' NOT NULL,
  payment_date TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  refund_amount NUMBER(10, 2) DEFAULT 0 NOT NULL,
  CONSTRAINT pk_payment PRIMARY KEY (payment_id),
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES booking (booking_id),
  CONSTRAINT uq_payment_booking UNIQUE (booking_id),
  CONSTRAINT ck_payment_amount CHECK (amount >= 0),
  CONSTRAINT ck_payment_mode CHECK (payment_mode IN ('UPI')),
  CONSTRAINT ck_payment_status CHECK (payment_status IN ('Paid', 'Pending', 'Failed', 'Refund Pending', 'Refunded')),
  CONSTRAINT ck_payment_refund CHECK (refund_amount >= 0)
);

CREATE INDEX ix_schedule_search ON schedule (route_id, travel_date);
CREATE INDEX ix_booking_passenger ON booking (passenger_id, booking_date);
CREATE INDEX ix_booking_schedule_status ON booking (schedule_id, booking_status);
CREATE INDEX ix_ticket_seat ON ticket (seat_id);

CREATE OR REPLACE TRIGGER trg_schedule_init_seats
BEFORE INSERT ON schedule
FOR EACH ROW
DECLARE
  v_total_seats bus.total_seats%TYPE;
BEGIN
  IF :NEW.available_seats IS NULL THEN
    SELECT total_seats
      INTO v_total_seats
      FROM bus
     WHERE bus_id = :NEW.bus_id;
    :NEW.available_seats := v_total_seats;
  END IF;
END trg_schedule_init_seats;
/

CREATE OR REPLACE TRIGGER trg_booking_seat_count
AFTER INSERT OR UPDATE OF booking_status ON booking
FOR EACH ROW
BEGIN
  IF INSERTING AND :NEW.booking_status = 'Confirmed' THEN
    UPDATE schedule
       SET available_seats = available_seats - 1
     WHERE schedule_id = :NEW.schedule_id
       AND available_seats > 0;
    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20012, 'The trip is full or does not exist');
    END IF;
  ELSIF UPDATING
    AND :OLD.booking_status = 'Confirmed'
    AND :NEW.booking_status = 'Cancelled' THEN
    UPDATE schedule
       SET available_seats = LEAST(available_seats + 1,
                                   (SELECT total_seats
                                      FROM bus
                                     WHERE bus_id = schedule.bus_id))
     WHERE schedule_id = :NEW.schedule_id;
  END IF;
END trg_booking_seat_count;
/

CREATE OR REPLACE TRIGGER trg_ticket_reserved_seat
BEFORE INSERT ON ticket
FOR EACH ROW
DECLARE
  v_schedule_id booking.schedule_id%TYPE;
  v_bus_id schedule.bus_id%TYPE;
  v_seat_bus_id seat.bus_id%TYPE;
  v_category seat.seat_category%TYPE;
BEGIN
  SELECT schedule_id
    INTO v_schedule_id
    FROM booking
   WHERE booking_id = :NEW.booking_id
     AND booking_status = 'Confirmed';

  SELECT bus_id
    INTO v_bus_id
    FROM schedule
   WHERE schedule_id = v_schedule_id
     FOR UPDATE;

  SELECT bus_id, seat_category
    INTO v_seat_bus_id, v_category
    FROM seat
   WHERE seat_id = :NEW.seat_id;

  IF v_seat_bus_id <> v_bus_id THEN
    RAISE_APPLICATION_ERROR(-20013, 'The selected seat does not belong to this trip''s bus');
  ELSIF v_category = 'Ladies' AND :NEW.passenger_gender <> 'F' THEN
    RAISE_APPLICATION_ERROR(-20040, 'This seat is reserved for women passengers');
  ELSIF v_category = 'Senior' AND :NEW.passenger_age < 60 THEN
    RAISE_APPLICATION_ERROR(-20041, 'This seat is reserved for senior citizens (age 60 and above)');
  END IF;
END trg_ticket_reserved_seat;
/

CREATE OR REPLACE FUNCTION get_available_seats (p_schedule_id IN NUMBER)
RETURN NUMBER
IS
  v_available schedule.available_seats%TYPE;
BEGIN
  SELECT available_seats
    INTO v_available
    FROM schedule
   WHERE schedule_id = p_schedule_id;
  RETURN v_available;
END get_available_seats;
/

CREATE OR REPLACE FUNCTION is_seat_available (
  p_schedule_id IN NUMBER,
  p_seat_id IN NUMBER
)
RETURN CHAR
IS
  v_bus_id schedule.bus_id%TYPE;
  v_seat_bus_id seat.bus_id%TYPE;
  v_count NUMBER;
BEGIN
  SELECT bus_id
    INTO v_bus_id
    FROM schedule
   WHERE schedule_id = p_schedule_id;

  SELECT bus_id
    INTO v_seat_bus_id
    FROM seat
   WHERE seat_id = p_seat_id;

  IF v_bus_id <> v_seat_bus_id THEN
    RETURN 'N';
  END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM booking b
    JOIN ticket t ON t.booking_id = b.booking_id
   WHERE b.schedule_id = p_schedule_id
     AND b.booking_status = 'Confirmed'
     AND t.seat_id = p_seat_id;

  RETURN CASE WHEN v_count = 0 THEN 'Y' ELSE 'N' END;
END is_seat_available;
/

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

CREATE OR REPLACE PROCEDURE cancel_booking (p_booking_id IN NUMBER)
IS
  v_status booking.booking_status%TYPE;
BEGIN
  SELECT booking_status
    INTO v_status
    FROM booking
   WHERE booking_id = p_booking_id
     FOR UPDATE;

  IF v_status = 'Confirmed' THEN
    UPDATE booking
       SET booking_status = 'Cancelled'
     WHERE booking_id = p_booking_id;
    COMMIT;
  END IF;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
    RAISE_APPLICATION_ERROR(-20050, 'Booking was not found');
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END cancel_booking;
/

@@admin_package.sql

DECLARE
  v_errors NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO v_errors
    FROM all_errors
   WHERE owner = 'BUSRES_OWNER'
     AND name IN ('TRG_SCHEDULE_INIT_SEATS', 'TRG_BOOKING_SEAT_COUNT',
                  'TRG_TICKET_RESERVED_SEAT', 'GET_AVAILABLE_SEATS',
                  'IS_SEAT_AVAILABLE', 'BOOK_TICKET',
                  'BOOK_TICKET_WITH_CONTACT', 'CANCEL_BOOKING', 'SAARTHI_ADMIN');
  IF v_errors > 0 THEN
    FOR item IN (
      SELECT name, type, line, text
        FROM all_errors
       WHERE owner = 'BUSRES_OWNER'
         AND name IN ('TRG_SCHEDULE_INIT_SEATS', 'TRG_BOOKING_SEAT_COUNT',
                      'TRG_TICKET_RESERVED_SEAT', 'GET_AVAILABLE_SEATS',
                      'IS_SEAT_AVAILABLE', 'BOOK_TICKET',
                      'BOOK_TICKET_WITH_CONTACT', 'CANCEL_BOOKING', 'SAARTHI_ADMIN')
       ORDER BY name, sequence
    ) LOOP
      DBMS_OUTPUT.PUT_LINE(item.name || ' ' || item.type || ' line ' || item.line || ': ' || item.text);
    END LOOP;
    RAISE_APPLICATION_ERROR(-20003, 'One or more schema procedures or triggers failed to compile');
  END IF;
END;
/

GRANT SELECT ON passenger TO BUSRES_WEB;
GRANT SELECT ON bus TO BUSRES_WEB;
GRANT SELECT ON seat TO BUSRES_WEB;
GRANT SELECT ON route TO BUSRES_WEB;
GRANT SELECT ON schedule TO BUSRES_WEB;
GRANT SELECT ON booking TO BUSRES_WEB;
GRANT SELECT ON ticket TO BUSRES_WEB;
GRANT SELECT ON payment TO BUSRES_WEB;
GRANT EXECUTE ON get_available_seats TO BUSRES_WEB;
GRANT EXECUTE ON is_seat_available TO BUSRES_WEB;
GRANT EXECUTE ON book_ticket TO BUSRES_WEB;
GRANT EXECUTE ON book_ticket_with_contact TO BUSRES_WEB;
GRANT EXECUTE ON cancel_booking TO BUSRES_WEB;
GRANT EXECUTE ON saarthi_admin TO BUSRES_WEB;

CREATE SYNONYM BUSRES_WEB.PASSENGER FOR BUSRES_OWNER.PASSENGER;
CREATE SYNONYM BUSRES_WEB.BUS FOR BUSRES_OWNER.BUS;
CREATE SYNONYM BUSRES_WEB.SEAT FOR BUSRES_OWNER.SEAT;
CREATE SYNONYM BUSRES_WEB.ROUTE FOR BUSRES_OWNER.ROUTE;
CREATE SYNONYM BUSRES_WEB.SCHEDULE FOR BUSRES_OWNER.SCHEDULE;
CREATE SYNONYM BUSRES_WEB.BOOKING FOR BUSRES_OWNER.BOOKING;
CREATE SYNONYM BUSRES_WEB.TICKET FOR BUSRES_OWNER.TICKET;
CREATE SYNONYM BUSRES_WEB.PAYMENT FOR BUSRES_OWNER.PAYMENT;
CREATE SYNONYM BUSRES_WEB.GET_AVAILABLE_SEATS FOR BUSRES_OWNER.GET_AVAILABLE_SEATS;
CREATE SYNONYM BUSRES_WEB.IS_SEAT_AVAILABLE FOR BUSRES_OWNER.IS_SEAT_AVAILABLE;
CREATE SYNONYM BUSRES_WEB.BOOK_TICKET FOR BUSRES_OWNER.BOOK_TICKET;
CREATE SYNONYM BUSRES_WEB.BOOK_TICKET_WITH_CONTACT FOR BUSRES_OWNER.BOOK_TICKET_WITH_CONTACT;
CREATE SYNONYM BUSRES_WEB.CANCEL_BOOKING FOR BUSRES_OWNER.CANCEL_BOOKING;
CREATE SYNONYM BUSRES_WEB.SAARTHI_ADMIN FOR BUSRES_OWNER.SAARTHI_ADMIN;

ALTER SESSION SET CURRENT_SCHEMA = SYS;

PROMPT
PROMPT Schema created. BUSRES_OWNER cannot log in; BUSRES_WEB has SELECT and procedure execution only.
PROMPT No passenger, trip, or payment rows were inserted.
PROMPT Configure ORACLE_USER=BUSRES_WEB and the password entered at the hidden prompt in the local .env.
