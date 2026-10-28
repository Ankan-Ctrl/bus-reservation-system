-- =====================================================================
-- BUS RESERVATION SYSTEM  |  BCSE302L Database Systems
-- ENHANCEMENT: Reserved seats for women and senior citizens
--
-- RULES
--   Ladies seats (S21 - S26 of every bus) : only a woman traveller (gender F)
--   Senior seats (S27 - S30 of every bus) : only a traveller aged 60 or above
--   General seats (all other seats)       : anyone
--   Women and senior citizens may ALSO use general seats.
--
-- RUN AFTER bus_reservation_setup.sql and bus_reservation_review2.sql:
--     SQL> @"C:\path\to\bus_reservation_reserved_seats.sql"
-- Running it a second time is safe: the ALTER statements will show
-- harmless "already exists" errors and everything else repeats cleanly.
-- Demo trip used: trip 10 (Madurai -> Kanyakumari, 24-Oct-2026 22:00)
-- =====================================================================
SET ECHO ON
SET DEFINE OFF
SET SQLBLANKLINES ON
SET SERVEROUTPUT ON SIZE UNLIMITED
SET LINESIZE 180
SET PAGESIZE 60
SET TRIMSPOOL ON
SET TAB OFF
SET FEEDBACK ON

COLUMN seat_category   FORMAT A13
COLUMN seat_type       FORMAT A10
COLUMN seat_number     FORMAT A11
COLUMN passenger_name  FORMAT A16
COLUMN full_name       FORMAT A20
COLUMN constraint_name FORMAT A20
COLUMN search_condition FORMAT A55
COLUMN trigger_name    FORMAT A28
COLUMN triggering_event FORMAT A12
COLUMN integrity       FORMAT A10

SPOOL reserved_seats_output.txt

PROMPT ######################################################################
PROMPT #  PART 1 : DATABASE CHANGE (DDL)
PROMPT ######################################################################

PROMPT
PROMPT === R1. DDL: add the seat_category column to SEAT (default General) ===
ALTER TABLE seat ADD (seat_category VARCHAR2(10) DEFAULT 'General' NOT NULL);

PROMPT
PROMPT === R2. DDL: CHECK constraint allows only General, Ladies or Senior ===
ALTER TABLE seat ADD CONSTRAINT ck_seat_category CHECK (seat_category IN ('General','Ladies','Senior'));

PROMPT
PROMPT === R3. New structure of SEAT ===
DESC seat

PROMPT ######################################################################
PROMPT #  PART 2 : MARKING THE RESERVED SEATS (DML)
PROMPT ######################################################################

PROMPT
PROMPT === R4. UPDATE: S21-S26 become Ladies seats, S27-S30 become Senior seats on every bus ===
UPDATE seat SET seat_category = 'General';
UPDATE seat SET seat_category = 'Ladies' WHERE TO_NUMBER(SUBSTR(seat_number, 2)) BETWEEN 21 AND 26;
UPDATE seat SET seat_category = 'Senior' WHERE TO_NUMBER(SUBSTR(seat_number, 2)) BETWEEN 27 AND 30;
COMMIT;

PROMPT
PROMPT === R5. Seats of each category across all buses (GROUP BY) ===
SELECT seat_category, COUNT(*) AS seats
  FROM seat
 GROUP BY seat_category
 ORDER BY seat_category;

PROMPT
PROMPT === R6. Reserved seats of bus 10 ===
SELECT seat_number, seat_type, seat_category
  FROM seat
 WHERE bus_id = 10
   AND seat_category <> 'General'
 ORDER BY TO_NUMBER(SUBSTR(seat_number, 2));

PROMPT
PROMPT === R7. Safety check: no existing confirmed ticket sits on a reserved seat it should not hold ===
SELECT COUNT(*) AS rule_violations
  FROM ticket t
  JOIN seat    st ON st.seat_id   = t.seat_id
  JOIN booking k  ON k.booking_id = t.booking_id
 WHERE k.booking_status = 'Confirmed'
   AND ((st.seat_category = 'Ladies' AND t.passenger_gender <> 'F')
     OR (st.seat_category = 'Senior' AND t.passenger_age < 60));

PROMPT ######################################################################
PROMPT #  PART 3 : NEW FUNCTION, TRIGGER AND UPDATED PROCEDURE
PROMPT ######################################################################

PROMPT
PROMPT === R8. FUNCTION get_free_seats_by_category : free seats of one category on a trip ===
CREATE OR REPLACE FUNCTION get_free_seats_by_category (p_schedule_id IN NUMBER, p_category IN VARCHAR2)
RETURN NUMBER
IS
    v_total NUMBER;
    v_sold  NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_total
      FROM seat st JOIN schedule s ON s.bus_id = st.bus_id
     WHERE s.schedule_id = p_schedule_id
       AND st.seat_category = p_category;

    SELECT COUNT(*) INTO v_sold
      FROM ticket t
      JOIN booking k ON k.booking_id = t.booking_id
      JOIN seat   st ON st.seat_id   = t.seat_id
     WHERE k.schedule_id    = p_schedule_id
       AND k.booking_status = 'Confirmed'
       AND st.seat_category = p_category;

    RETURN v_total - v_sold;
END get_free_seats_by_category;
/
SHOW ERRORS

PROMPT
PROMPT === R9. TRIGGER trg_ticket_reserved_seat : database-level guard for reserved seats ===
CREATE OR REPLACE TRIGGER trg_ticket_reserved_seat
BEFORE INSERT ON ticket
FOR EACH ROW
DECLARE
    v_category seat.seat_category%TYPE;
BEGIN
    SELECT seat_category INTO v_category
      FROM seat
     WHERE seat_id = :NEW.seat_id;

    IF v_category = 'Ladies' AND :NEW.passenger_gender <> 'F' THEN
        RAISE_APPLICATION_ERROR(-20040, 'This seat is reserved for women passengers');
    ELSIF v_category = 'Senior' AND :NEW.passenger_age < 60 THEN
        RAISE_APPLICATION_ERROR(-20041, 'This seat is reserved for senior citizens (age 60 and above)');
    END IF;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        NULL;   -- unknown seat: the foreign key reports the error
END trg_ticket_reserved_seat;
/
SHOW ERRORS

PROMPT
PROMPT === R10. PROCEDURE book_ticket (updated): now checks the reserved-seat rule before booking ===
CREATE OR REPLACE PROCEDURE book_ticket (
    p_passenger_id IN  NUMBER,
    p_schedule_id  IN  NUMBER,
    p_seat_number  IN  VARCHAR2,
    p_trav_name    IN  VARCHAR2,
    p_trav_age     IN  NUMBER,
    p_trav_gender  IN  CHAR,
    p_pay_mode     IN  VARCHAR2,
    p_booking_id   OUT NUMBER
)
IS
    v_bus_id     schedule.bus_id%TYPE;
    v_fare       schedule.base_fare%TYPE;
    v_avail      schedule.available_seats%TYPE;
    v_dep        schedule.departure_time%TYPE;
    v_seat_id    seat.seat_id%TYPE;
    v_category   seat.seat_category%TYPE;
    v_booking_id booking.booking_id%TYPE;
    v_cnt        NUMBER;
BEGIN
    -- 1. passenger must exist
    SELECT COUNT(*) INTO v_cnt FROM passenger WHERE passenger_id = p_passenger_id;
    IF v_cnt = 0 THEN
        RAISE_APPLICATION_ERROR(-20010, 'Passenger ' || p_passenger_id || ' not found');
    END IF;

    -- 2. trip must exist (row is locked so two users cannot take the last seat together)
    BEGIN
        SELECT bus_id, base_fare, available_seats, departure_time
          INTO v_bus_id, v_fare, v_avail, v_dep
          FROM schedule
         WHERE schedule_id = p_schedule_id
           FOR UPDATE;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20011, 'Trip ' || p_schedule_id || ' not found');
    END;

    -- 3. trip must have seats and must not have departed
    IF v_avail <= 0 THEN
        RAISE_APPLICATION_ERROR(-20012, 'Trip ' || p_schedule_id || ' is full');
    END IF;
    IF CAST(v_dep AS DATE) <= SYSDATE THEN
        RAISE_APPLICATION_ERROR(-20015, 'Trip ' || p_schedule_id || ' has already departed');
    END IF;

    -- 4. seat must belong to the bus of this trip (also read its category)
    BEGIN
        SELECT seat_id, seat_category INTO v_seat_id, v_category
          FROM seat
         WHERE bus_id = v_bus_id
           AND seat_number = UPPER(p_seat_number);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20013, 'Seat ' || p_seat_number || ' does not exist on this bus');
    END;

    -- 5. reserved seat rule: Ladies seats for women, Senior seats for age 60+
    IF v_category = 'Ladies' AND UPPER(p_trav_gender) <> 'F' THEN
        RAISE_APPLICATION_ERROR(-20040, 'Seat ' || UPPER(p_seat_number) || ' is reserved for women passengers');
    ELSIF v_category = 'Senior' AND p_trav_age < 60 THEN
        RAISE_APPLICATION_ERROR(-20041, 'Seat ' || UPPER(p_seat_number) || ' is reserved for senior citizens (age 60 and above)');
    END IF;

    -- 6. seat must be free on this trip
    IF is_seat_available(p_schedule_id, v_seat_id) = 'N' THEN
        RAISE_APPLICATION_ERROR(-20014, 'Seat ' || UPPER(p_seat_number) || ' is already booked on trip ' || p_schedule_id);
    END IF;

    -- 7. create booking, ticket and payment (triggers update available_seats)
    INSERT INTO booking (booking_id, passenger_id, schedule_id, total_amount, booking_status)
    VALUES (seq_booking.NEXTVAL, p_passenger_id, p_schedule_id, v_fare, 'Confirmed')
    RETURNING booking_id INTO v_booking_id;

    INSERT INTO ticket (ticket_id, booking_id, seat_id, passenger_name, passenger_age, passenger_gender, ticket_fare)
    VALUES (seq_ticket.NEXTVAL, v_booking_id, v_seat_id, p_trav_name, p_trav_age, p_trav_gender, v_fare);

    INSERT INTO payment (payment_id, booking_id, amount, payment_mode, payment_status)
    VALUES (seq_payment.NEXTVAL, v_booking_id, v_fare, p_pay_mode, 'Paid');

    COMMIT;
    p_booking_id := v_booking_id;
    DBMS_OUTPUT.PUT_LINE('Booking confirmed. Booking ID: ' || v_booking_id ||
                         ', Seat: ' || UPPER(p_seat_number) || ' (' || v_category || ')' ||
                         ', Amount paid: ' || v_fare);
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END book_ticket;
/
SHOW ERRORS

PROMPT
PROMPT === R11. Status of the new and updated objects ===
SELECT object_name, object_type, status
  FROM user_objects
 WHERE object_name IN ('GET_FREE_SEATS_BY_CATEGORY','TRG_TICKET_RESERVED_SEAT','BOOK_TICKET')
 ORDER BY object_type, object_name;

PROMPT ######################################################################
PROMPT #  PART 4 : DEMONSTRATION ON TRIP 10 (Madurai -> Kanyakumari)
PROMPT ######################################################################

VARIABLE g_bk1 NUMBER
VARIABLE g_bk2 NUMBER
VARIABLE g_bk3 NUMBER
VARIABLE g_dummy NUMBER

PROMPT
PROMPT === D1. BEFORE: free seats of each category on trip 10 ===
SELECT get_free_seats_by_category(10, 'General') AS general_free,
       get_free_seats_by_category(10, 'Ladies')  AS ladies_free,
       get_free_seats_by_category(10, 'Senior')  AS senior_free
  FROM dual;

PROMPT
PROMPT === D2. A man tries a LADIES seat (S21) - must be rejected ===
EXEC book_ticket(3, 10, 'S21', 'Rahul Sharma', 31, 'M', 'UPI', :g_dummy)

PROMPT
PROMPT === D3. A woman books the LADIES seat S21 - allowed ===
EXEC book_ticket(2, 10, 'S21', 'Priya Nair', 25, 'F', 'UPI', :g_bk1)

PROMPT
PROMPT === D4. A 25-year-old woman tries a SENIOR seat (S27) - must be rejected ===
EXEC book_ticket(2, 10, 'S27', 'Priya Nair', 25, 'F', 'UPI', :g_dummy)

PROMPT
PROMPT === D5. A 65-year-old man books the SENIOR seat S27 - allowed ===
EXEC book_ticket(9, 10, 'S27', 'Gopal Singh', 65, 'M', 'UPI', :g_bk2)

PROMPT
PROMPT === D6. A man books a GENERAL seat (S5) - allowed (general seats are open to everyone) ===
EXEC book_ticket(3, 10, 'S5', 'Rahul Sharma', 31, 'M', 'UPI', :g_bk3)

PROMPT
PROMPT === D7. Direct INSERT of a man on Ladies seat S22, bypassing the procedure (trigger must block it) ===
DECLARE
    v_bk NUMBER;
BEGIN
    INSERT INTO booking (booking_id, passenger_id, schedule_id, total_amount)
    VALUES (seq_booking.NEXTVAL, 3, 10, 500)
    RETURNING booking_id INTO v_bk;

    INSERT INTO ticket (ticket_id, booking_id, seat_id, passenger_name, passenger_age, passenger_gender, ticket_fare)
    VALUES (seq_ticket.NEXTVAL, v_bk,
            (SELECT seat_id FROM seat WHERE bus_id = 10 AND seat_number = 'S22'),
            'Rahul Sharma', 31, 'M', 500);

    DBMS_OUTPUT.PUT_LINE('Ticket inserted - this line should NOT appear');
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Blocked by trigger: ' || SQLERRM);
        ROLLBACK;
END;
/

PROMPT
PROMPT === D8. The tickets that were accepted ===
SELECT t.ticket_id, t.passenger_name, t.passenger_age, t.passenger_gender,
       st.seat_number, st.seat_category
  FROM ticket t
  JOIN seat st ON st.seat_id = t.seat_id
 WHERE t.booking_id IN (:g_bk1, :g_bk2, :g_bk3)
 ORDER BY t.ticket_id;

PROMPT
PROMPT === D9. AFTER: free seats of each category on trip 10 ===
SELECT get_free_seats_by_category(10, 'General') AS general_free,
       get_free_seats_by_category(10, 'Ladies')  AS ladies_free,
       get_free_seats_by_category(10, 'Senior')  AS senior_free
  FROM dual;

PROMPT
PROMPT === D10. Report query: tickets sold per seat category in confirmed bookings ===
SELECT st.seat_category, COUNT(*) AS tickets
  FROM ticket t
  JOIN seat    st ON st.seat_id   = t.seat_id
  JOIN booking k  ON k.booking_id = t.booking_id
 WHERE k.booking_status = 'Confirmed'
 GROUP BY st.seat_category
 ORDER BY st.seat_category;

PROMPT
PROMPT === D11. Integrity check for trip 10: stored seats equal live count ===
SELECT schedule_id, available_seats, get_available_seats(schedule_id) AS live_count,
       CASE WHEN available_seats = get_available_seats(schedule_id) THEN 'OK' ELSE 'MISMATCH' END AS integrity
  FROM schedule
 WHERE schedule_id = 10;

PROMPT
PROMPT === D12. Clean-up: cancel the three demo bookings so the seats are free again ===
EXEC cancel_booking(:g_bk1)
EXEC cancel_booking(:g_bk2)
EXEC cancel_booking(:g_bk3)

PROMPT
PROMPT === D13. After clean-up: trip 10 seat counts back to normal ===
SELECT get_free_seats_by_category(10, 'General') AS general_free,
       get_free_seats_by_category(10, 'Ladies')  AS ladies_free,
       get_free_seats_by_category(10, 'Senior')  AS senior_free,
       available_seats
  FROM schedule
 WHERE schedule_id = 10;

SPOOL OFF
PROMPT
PROMPT Done. Output saved in reserved_seats_output.txt
