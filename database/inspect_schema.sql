SET ECHO OFF
SET VERIFY OFF
SET FEEDBACK ON
SET PAGESIZE 100
SET LINESIZE 220
SET LONG 4000
SET LONGCHUNKSIZE 4000
SET TRIMSPOOL ON
SET TAB OFF

COLUMN database_name FORMAT A24
COLUMN database_version FORMAT A40
COLUMN service_name FORMAT A32
COLUMN session_user FORMAT A24
COLUMN current_schema FORMAT A24
COLUMN owner FORMAT A24
COLUMN table_name FORMAT A24
COLUMN column_name FORMAT A32
COLUMN data_type FORMAT A20
COLUMN nullable FORMAT A8
COLUMN constraint_name FORMAT A32
COLUMN constraint_type FORMAT A5
COLUMN column_list FORMAT A64
COLUMN referenced_owner FORMAT A24
COLUMN referenced_table FORMAT A24
COLUMN object_name FORMAT A32
COLUMN object_type FORMAT A20
COLUMN status FORMAT A10
COLUMN argument_name FORMAT A28
COLUMN in_out FORMAT A10
COLUMN defaulted FORMAT A8
COLUMN trigger_name FORMAT A32
COLUMN triggering_event FORMAT A32
COLUMN table_owner FORMAT A24
COLUMN sequence_name FORMAT A32
COLUMN text FORMAT A160
COLUMN min_value FORMAT 99999999999999999999
COLUMN max_value FORMAT 99999999999999999999

SPOOL bus_reservation_schema_report.txt

PROMPT
PROMPT === Database and current SQL*Plus session ===
SELECT SYS_CONTEXT('USERENV', 'DB_NAME') AS database_name,
       SYS_CONTEXT('USERENV', 'SERVICE_NAME') AS service_name,
       SYS_CONTEXT('USERENV', 'SESSION_USER') AS session_user,
       SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS current_schema
  FROM dual;

SELECT banner AS database_version
  FROM v$version
 WHERE banner LIKE 'Oracle Database%';

PROMPT
PROMPT === Owners of the existing reservation tables ===
SELECT owner, table_name
  FROM all_tables
 WHERE table_name IN ('PASSENGER', 'BUS', 'SEAT', 'ROUTE',
                      'SCHEDULE', 'BOOKING', 'TICKET', 'PAYMENT')
 ORDER BY owner, table_name;

PROMPT
PROMPT === Columns of the existing reservation tables ===
SELECT owner, table_name, column_id, column_name, data_type,
       data_length, data_precision, data_scale, nullable
  FROM all_tab_columns
 WHERE table_name IN ('PASSENGER', 'BUS', 'SEAT', 'ROUTE',
                      'SCHEDULE', 'BOOKING', 'TICKET', 'PAYMENT')
 ORDER BY owner, table_name, column_id;

PROMPT
PROMPT === Primary, unique, check, and foreign-key constraints ===
SELECT c.owner,
       c.table_name,
       c.constraint_name,
       c.constraint_type,
       cc.column_list,
       c.r_owner AS referenced_owner,
       parent.table_name AS referenced_table
  FROM all_constraints c
  LEFT JOIN (
       SELECT owner, table_name, constraint_name,
              LISTAGG(column_name, ', ') WITHIN GROUP (ORDER BY position) AS column_list
         FROM all_cons_columns
        WHERE table_name IN ('PASSENGER', 'BUS', 'SEAT', 'ROUTE',
                             'SCHEDULE', 'BOOKING', 'TICKET', 'PAYMENT')
        GROUP BY owner, table_name, constraint_name
  ) cc
    ON cc.owner = c.owner
   AND cc.table_name = c.table_name
   AND cc.constraint_name = c.constraint_name
  LEFT JOIN all_constraints parent
    ON parent.owner = c.r_owner
   AND parent.constraint_name = c.r_constraint_name
 WHERE c.table_name IN ('PASSENGER', 'BUS', 'SEAT', 'ROUTE',
                        'SCHEDULE', 'BOOKING', 'TICKET', 'PAYMENT')
 ORDER BY c.owner, c.table_name, c.constraint_type, c.constraint_name;

PROMPT
PROMPT === Reservation procedures, functions, package routines, and object status ===
SELECT owner, object_name, object_type, status
  FROM all_objects
 WHERE object_name IN ('BOOK_TICKET', 'CANCEL_BOOKING', 'IS_SEAT_AVAILABLE',
                       'GET_AVAILABLE_SEATS', 'GET_FREE_SEATS_BY_CATEGORY')
 ORDER BY owner, object_type, object_name;

PROMPT
PROMPT === Parameters for existing reservation procedures and functions ===
SELECT owner, package_name, object_name, overload, sequence, argument_name,
       in_out, data_type, data_length, defaulted
  FROM all_arguments
 WHERE object_name IN ('BOOK_TICKET', 'CANCEL_BOOKING', 'IS_SEAT_AVAILABLE',
                       'GET_AVAILABLE_SEATS', 'GET_FREE_SEATS_BY_CATEGORY')
 ORDER BY owner, package_name, object_name, overload, sequence;

PROMPT
PROMPT === Source for existing standalone reservation procedures and functions ===
SELECT owner, name AS object_name, type AS object_type, line, text
  FROM all_source
 WHERE name IN ('BOOK_TICKET', 'CANCEL_BOOKING', 'IS_SEAT_AVAILABLE',
                'GET_AVAILABLE_SEATS', 'GET_FREE_SEATS_BY_CATEGORY')
   AND type IN ('PROCEDURE', 'FUNCTION')
 ORDER BY owner, name, type, line;

PROMPT
PROMPT === Triggers on reservation tables ===
SELECT owner, trigger_name, table_owner, table_name, status,
       triggering_event, trigger_type
  FROM all_triggers
 WHERE table_name IN ('PASSENGER', 'BUS', 'SEAT', 'ROUTE',
                      'SCHEDULE', 'BOOKING', 'TICKET', 'PAYMENT')
 ORDER BY owner, table_name, trigger_name;

PROMPT
PROMPT === Reservation-related sequences ===
SELECT sequence_owner AS owner, sequence_name, min_value, max_value,
       increment_by, cycle_flag, order_flag
  FROM all_sequences
 WHERE sequence_name LIKE 'SEQ\_%' ESCAPE '\'
   AND sequence_owner IN (
       SELECT DISTINCT owner
         FROM all_tables
        WHERE table_name IN ('PASSENGER', 'BUS', 'SEAT', 'ROUTE',
                             'SCHEDULE', 'BOOKING', 'TICKET', 'PAYMENT')
   )
 ORDER BY sequence_owner, sequence_name;

SPOOL OFF
PROMPT
PROMPT Read-only schema report written to bus_reservation_schema_report.txt
