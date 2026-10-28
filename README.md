# Saarthi Bus Reservation System

A responsive bus-reservation interface with a separate Express API and a local Oracle connection. It supports Oracle 19c Enterprise Edition as shown by the user's SQL*Plus output, and Oracle Database 21c XE. The UI does not use mock trips or pretend bookings are real.

## What works now

- Trip search by source city, destination city, and travel date using the `ROUTE`, `SCHEDULE`, and `BUS` fields shown in the ER diagram.
- Oracle-backed seat availability for a selected schedule, including the Ladies and Senior seat categories.
- Booking submission through `book_ticket_with_contact`, which creates the passenger record and calls `book_ticket` in the same transaction. The database procedure performs the seat check while locking the schedule row, preventing two requests from booking the same last seat.
- Ticket details, passenger booking history, cancellation, and payment/refund status using fields shown in the ER diagram and reserved-seat SQL.
- Admin creation, editing, and deletion for buses, routes, and schedules through restricted owner-schema procedures; new buses receive seat rows automatically, and new schedules inherit availability from their selected bus.
- A streaming ZIP export with a CSV for every row in `PASSENGER`, `BUS`, `SEAT`, `ROUTE`, `SCHEDULE`, `BOOKING`, `TICKET`, and `PAYMENT`.
- Oracle health status and clear database/schema-not-ready messages.
- A SQL*Plus installer for a fresh Oracle 19c schema, with a non-login object owner and a restricted website account.

The installer creates the eight ERD entities and the `SEAT.SEAT_CATEGORY` enhancement from `bus_reservation_reserved_seats.sql`. It implements seat-category checks, serialized one-seat bookings, seat-count updates, and cancellation. The enhancement file's demo booking section is not run, and the installer inserts no sample records.

The web/API joins mirror the diagram: `PASSENGER` to `BOOKING`; `ROUTE` and `BUS` to `SCHEDULE`; `SCHEDULE` to `BOOKING`; `BOOKING` to `TICKET` and `PAYMENT`; and `TICKET` to `SEAT`. Search results use `ROUTE.SOURCE_CITY`, `DESTINATION_CITY`, `DISTANCE_KM`, and `EST_DURATION_HRS`, plus `SCHEDULE.TRAVEL_DATE`, times, fare, and available seats. Bus cards use operator, number, type, and total seats. Payment details include the diagram's `REFUND_AMOUNT`.

The original base SQL scripts were not available, so this fresh schema uses the ERD fields visible in the project notes and the supplied reserved-seat procedure as its contract. `SCHEDULE.DEPARTURE_TIME` and `ARRIVAL_TIME` are Oracle `DATE` values containing the full date and time; `TRAVEL_DATE` is stored separately for date searches. The website requires passenger email and phone and stores them in `PASSENGER` as part of each booking. Review these assumptions against the original diagram before importing production records.

## Requirements

- Node.js 18 or later and npm.
- Oracle Database reachable locally from this machine (the provided SQL*Plus output reports Oracle Database 19c Enterprise Edition).
- The Oracle schema containing the project tables and PL/SQL objects.
- SQL*Plus, to inspect the installed database and discover the active service and schema objects.

## Local SQL*Plus schema inspection

The database diagnostic is read-only. It prints the active database service, connected user/schema, reservation table owners and columns, constraints/relationships, existing reservation procedures/functions and their arguments, triggers, and sequences. It writes the results to `bus_reservation_schema_report.txt` in the current directory; that local report is ignored by Git.

From the project root, start SQL*Plus without putting a password on the command line:

```powershell
sqlplus /nolog
```

At the SQL*Plus prompt, connect using your local listener service. SQL*Plus asks for the password interactively:

```sql
CONNECT your_sqlplus_user@//localhost:1521/your_verified_service
@database\inspect_schema.sql
EXIT
```

The local Oracle 19c listener advertises `orclpdb`, and a SQL*Plus check confirmed that service maps to the `ORCLPDB` pluggable database. It was mounted initially, so it has been opened read-write and configured to save its open state. A read-only inspection found the PDB empty; `database/install_bus_reservation.sql` now installs the schema there.

Your SQL*Plus output identifies Oracle 19c Enterprise Edition, not 21c XE. SQL*Plus 19c can connect to an appropriate Oracle database listener, but the service and database edition must be verified on the machine that runs the backend.

**Security:** the password shared in chat should be treated as exposed. Change it promptly. Do not save it in source control or provide it in chat again. Use SQL*Plus with local OS authentication for database setup; the website connects as `BUSRES_WEB`, not `SYSTEM`. `BUSRES_OWNER` is a schema-only account that cannot log in. `BUSRES_WEB` receives only `SELECT` and execution grants for the booking routines. Do not put an administrative password in the app's `.env`.

While connected to SQL*Plus as `SYSTEM`, the `PASSWORD` command prompts for the current and replacement passwords without placing either one in the command text:

```sql
PASSWORD
```

The hero photo is stored under `frontend/assets`, so the website's interface and image are served locally. The app does not need a third-party service.

## Setup

### Install the Oracle schema (one time)

The local installation has already been created in `ORCLPDB`. For a fresh install, run SQL*Plus from the project root using local administrator authentication (the website password is not used here):

```sql
CONNECT / AS SYSDBA
@database\install_bus_reservation.sql
```

At the hidden prompt, enter a strong `BUSRES_WEB` password of up to 30 characters. Save it only in the local `.env`. The installer refuses to overwrite an existing `BUSRES_OWNER` or `BUSRES_WEB`, creates no demo rows, and should not be rerun over an existing installation.

The installer creates empty tables. Before searching or booking, add verified data through SQL*Plus or run the optional demo seed below. The website creates a passenger record from the contact details submitted with each booking; the restricted app account has no direct table-write grants.

### Upgrade an existing installation for contact-capturing bookings and admin management

The local website schema was installed before passenger contact capture was added. Do **not** rerun `install_bus_reservation.sql` on it. Apply this non-destructive migration instead; it creates/replaces `BOOK_TICKET` and `BOOK_TICKET_WITH_CONTACT`, sets the default payment state to `Pending` for new rows, grants the app account permission to execute the wrapper, and creates its synonym. It does not recreate tables, change existing payment rows, or delete data.

```sql
CONNECT / AS SYSDBA
@database\enable_passenger_booking.sql
@database\enable_admin_management.sql
```

New website bookings now create a `PASSENGER` row containing name, email, and phone, then book the selected seat. The returned passenger ID appears on the ticket and can be used in booking history. The booking procedure leaves payment `Pending` because the website has no payment provider.

The admin migration installs `SAARTHI_ADMIN` and grants `BUSRES_WEB` only `EXECUTE` on that package; it does not grant direct table write privileges. It is safe to rerun and does not change or remove table data. The admin dashboard can add buses, routes, and schedules. A new bus creates its generated seat inventory, and a new schedule requires an existing bus and route; Oracle rejects overlapping departures on the same bus. Passengers are added through bookings, while booking, ticket, and payment rows remain protected.

### Add fictional Indian demo trips

The optional seed script adds five fictional Indian intercity routes and operators, five dedicated 30-seat buses, six clearly labelled demo passengers, and six demo seat reservations. Four routes run once daily for 30 upcoming days; Delhi–Jaipur runs once weekly for 12 weeks. Each departure is a dated `SCHEDULE` row, so normal search and seat availability use the same Oracle-backed flow. Rerunning the merge-based script updates matching bus/route/date rows without duplicating schedules, demo buses, seats, passengers, bookings, tickets, or payments; it leaves older schedule rows and booking history intact.

Three demo UPI payment rows are marked `Paid` so payment totals and statuses can be demonstrated; those statuses are simulated, and no money was received. The ticket and admin screens label those records as simulated. New website bookings are `Pending` until a real payment integration confirms them.

Run it locally from the project root:

```sql
CONNECT / AS SYSDBA
@database\seed_indian_demo_data.sql
```

The script prints the generated passenger and booking IDs for the booking-history form. Schedule dates are calculated from the Oracle server's current date.

### Start the website

1. Install the Node dependencies:

   ```powershell
   npm install
   ```

2. The local `.env` has already been created for this installation. On another machine, copy the example and enter the `BUSRES_WEB` password locally:

   ```powershell
   Copy-Item .env.example .env
   ```

3. If needed, edit `.env` on your machine:

   ```dotenv
   PORT=3001
   ORACLE_USER=BUSRES_WEB
   ORACLE_PASSWORD=YOUR_ORACLE_PASSWORD
   ORACLE_CONNECT_STRING=localhost:1521/orclpdb
   ```

   `ORACLE_CONNECT_STRING` is configurable; `localhost:1521/orclpdb` is the service verified on this machine. Do not commit `.env` or send the password in chat. Do not use the `SYSTEM` account for the website.

4. Start the website and API:

   ```powershell
   npm start
   ```

5. Open [http://127.0.0.1:3001](http://127.0.0.1:3001). The status in the navigation reports whether the API can connect to Oracle. `GET /api/health` reports connection status without exposing credentials.

The development server binds to `127.0.0.1` only. Admin management and exports also reject non-local connections. As requested, these local admin operations do not require a separate passphrase. **Do not change the bind address, expose the service to a network, or deploy it publicly without adding administrator authentication and authorization first.** The export includes passenger names, email addresses, phone numbers, tickets, and payments; protect the downloaded archive.

Run the syntax checks and route/admin API tests with `npm run check` and `npm test`. The endpoint tests use an in-memory Oracle connection double; no database is contacted and no reservation is written.

## API

- `GET /api/health`: app and Oracle connectivity.
- `GET /api/routes`: route pairs for search suggestions.
- `GET /api/schedules?source=...&destination=...&travelDate=YYYY-MM-DD`: buses and live seat counts on matching scheduled routes.
- `GET /api/schedules/:scheduleId/seats`: seat list, seat type/category, and `is_seat_available` result.
- `POST /api/bookings`: accepts `scheduleId`, `seatNumber`, `travellerName`, `email`, `phone`, `travellerAge`, `travellerGender`, and `paymentMode`; calls `book_ticket_with_contact` and returns `bookingId` and the newly created `passengerId`.
- `GET /api/bookings/:bookingId`: booking, ticket, seat, payment, and schedule departure details.
- `GET /api/passengers/:passengerId/bookings`: booking history.
- `POST /api/bookings/:bookingId/cancel`: calls the existing `cancel_booking` procedure and returns current payment status.
- `GET /api/admin/overview|buses|routes|schedules|bookings|reports`: dashboard and entity data (table views are limited to 200 rows per entity).
- `POST /api/admin/buses`: add a bus and create its generated seat rows in the same Oracle package operation.
- `POST /api/admin/routes`: add a route.
- `POST /api/admin/schedules`: add a trip for an existing bus and route; Oracle initializes available seats from the bus capacity and prevents overlapping trips for that bus.
- `PUT /api/admin/buses/:busId`: update bus number, operator, type, and total seat capacity. Capacity changes keep generated seat rows and future schedule availability in sync; ticketed seats cannot be removed.
- `DELETE /api/admin/buses/:busId`: delete an unreferenced bus and its seat rows.
- `PUT|DELETE /api/admin/routes/:routeId`: edit route attributes or delete a route that has no scheduled/history trips.
- `PUT|DELETE /api/admin/schedules/:scheduleId`: edit date, departure/arrival times, and fare, or delete an unbooked schedule. The server rejects edits where a bus would have overlapping departures.
- `GET /api/admin/export.zip`: download CSV files containing every row from all eight ERD tables. CSV cells that could be interpreted as spreadsheet formulas are prefixed to prevent formula execution.
- Other admin writes, including direct edits/deletes to passengers, bookings, tickets, or payments, are rejected. Passengers are created by the booking flow; use booking cancellation for reservations.

All Oracle binds use parameterized values. Database credentials are read only by the backend process. The booking API accepts one passenger and one seat per call because that is the signature of `book_ticket` in the supplied SQL. It creates a passenger row with required name, email, and phone in the same transaction as the booking. `F`, `M`, and `UPI` are the only enabled passenger-gender/payment values because these are the values demonstrated in the supplied SQL. Online payment processing and refund initiation are not implemented; new booking payments remain `Pending`, while the interface displays `PAYMENT.PAYMENT_STATUS` and `PAYMENT.REFUND_AMOUNT`.

## Schema and feature boundaries

The installer provisions the Oracle object names currently used by the API, but the original base DDL should still be compared with the installer assumptions before importing real data. Demo seed rows are fictional and identifiable by their `DEMO` labels and `example.invalid` emails; their `Paid` statuses are simulated and their other payments are `Pending`. Cancellation updates the booking status and restores the seat count; payment/refund processing is not connected to a payment provider, and cancellation does not claim that a refund was issued. Admin writes use specific PL/SQL procedures, validate allowed fields, preserve referenced booking history, and remain local-only until authentication is added.
