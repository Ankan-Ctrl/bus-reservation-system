SET ECHO OFF
SET VERIFY OFF
SET FEEDBACK ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

ALTER SESSION SET CONTAINER = ORCLPDB;
ALTER SESSION SET CURRENT_SCHEMA = BUSRES_OWNER;

@@admin_package.sql

DECLARE
  v_errors NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO v_errors
    FROM all_errors
   WHERE owner = 'BUSRES_OWNER'
     AND name = 'SAARTHI_ADMIN';
  IF v_errors > 0 THEN
    FOR item IN (
      SELECT type, line, text
        FROM all_errors
       WHERE owner = 'BUSRES_OWNER'
         AND name = 'SAARTHI_ADMIN'
       ORDER BY type, sequence
    ) LOOP
      DBMS_OUTPUT.PUT_LINE(item.type || ' line ' || item.line || ': ' || item.text);
    END LOOP;
    RAISE_APPLICATION_ERROR(-20004, 'SAARTHI_ADMIN did not compile');
  END IF;
END;
/

GRANT EXECUTE ON saarthi_admin TO BUSRES_WEB;
CREATE OR REPLACE SYNONYM BUSRES_WEB.SAARTHI_ADMIN FOR BUSRES_OWNER.SAARTHI_ADMIN;

ALTER SESSION SET CURRENT_SCHEMA = SYS;
PROMPT Admin management procedures are installed; BUSRES_WEB has EXECUTE only.
