const view = document.querySelector("#view");
const announcer = document.querySelector("#announcer");
const apiBase = "/api";
const appState = {
  trips: [],
  search: null,
  activeTrip: null,
  seats: [],
  selectedSeat: null,
  activeBooking: null
};
const adminState = {
  section: "overview",
  items: [],
  editingId: null,
  creating: false
};

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || "The request could not be completed.", response.status, body.code);
  return body;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function announce(message) {
  announcer.textContent = "";
  window.requestAnimationFrame(() => { announcer.textContent = message; });
}

function setActiveNav(name) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === name;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function showView(content, navName) {
  view.innerHTML = content;
  setActiveNav(navName);
  view.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not available";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? escapeHtml(value)
    : new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatTime(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function apiNotice(error, action) {
  if (error instanceof ApiError) {
    if (error.code === "SCHEMA_REQUIRED") {
      return `<div class="notice notice-warn"><strong>Database schema details needed</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
    if (error.code === "ORACLE_NOT_CONFIGURED" || error.code === "ORACLE_UNAVAILABLE") {
      return `<div class="notice notice-warn"><strong>Oracle is not connected</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
  }
  return `<div class="notice notice-error"><strong>${escapeHtml(action)} failed</strong><p>${escapeHtml(error.message)}</p></div>`;
}

function pageHeader(kicker, title, description = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(kicker)}</p><h1>${escapeHtml(title)}</h1>${description ? `<p class="page-description">${escapeHtml(description)}</p>` : ""}</div></div>`;
}

function renderHome() {
  showView(`
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow"><span class="eyebrow-line"></span> GOOD JOURNEYS START HERE</p>
        <h1>Go further.<br><span>Feel at home.</span></h1>
        <p class="hero-description">Find a seat that feels right, then enjoy the miles between.</p>
        <a class="text-link" href="#trip-search">Find your bus <span aria-hidden="true">↓</span></a>
      </div>
      <div class="hero-image" role="img" aria-label="A bus travelling along a green country road">
        <div class="image-note"><span class="note-icon" aria-hidden="true">↗</span><span>Room for the road ahead</span></div>
      </div>
    </section>

    <section class="booking-section" id="trip-search" aria-labelledby="search-title">
      <div class="section-heading">
        <div><p class="section-kicker">YOUR NEXT JOURNEY</p><h2 id="search-title">Where to next?</h2></div>
        <p class="data-note">Trips and fares load from Oracle</p>
      </div>
      <form class="search-form" id="search-form">
        <label class="field"><span class="field-label">Leaving from</span><input name="source" list="route-cities" required maxlength="100" autocomplete="address-level2" placeholder="City or station"></label>
        <span class="route-arrow" aria-hidden="true">→</span>
        <label class="field"><span class="field-label">Going to</span><input name="destination" list="route-cities" required maxlength="100" autocomplete="address-level2" placeholder="City or station"></label>
        <label class="field"><span class="field-label">Travel date</span><input name="travelDate" type="date" required></label>
        <button class="primary-button" type="submit">Search buses <span aria-hidden="true">↗</span></button>
      </form>
      <datalist id="route-cities"></datalist>
      <div id="search-feedback" aria-live="polite"></div>
    </section>

    <section class="journey-note">
      <div class="journey-copy"><p class="section-kicker">A SEAT FOR EVERYONE</p><h2>Travel should feel considered.</h2><p>Choose an open seat, add your passenger details, and review your ticket before you book.</p></div>
      <div class="seat-guide" aria-label="Seat categories">
        <div class="guide-row"><span class="seat-key general" aria-hidden="true"></span><span><strong>General</strong><small>Open to all passengers</small></span></div>
        <div class="guide-row"><span class="seat-key ladies" aria-hidden="true"></span><span><strong>Ladies</strong><small>Reserved for women passengers</small></span></div>
        <div class="guide-row"><span class="seat-key senior" aria-hidden="true"></span><span><strong>Senior</strong><small>Reserved for passengers aged 60+</small></span></div>
      </div>
    </section>`, "book");

  const dateField = view.querySelector('input[name="travelDate"]');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const localTomorrow = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  dateField.min = localTomorrow;
  dateField.value = dateField.min;
  view.querySelector("#search-form").addEventListener("submit", searchTrips);
  if (document.querySelector("#connection-status").classList.contains("connected")) loadRouteCities();
}

async function loadRouteCities() {
  const list = view.querySelector("#route-cities");
  if (!list) return;
  try {
    const result = await request("/routes");
    const cities = new Set();
    result.items.forEach((route) => {
      if (route.sourceCity) cities.add(route.sourceCity);
      if (route.destinationCity) cities.add(route.destinationCity);
    });
    list.replaceChildren(...[...cities].sort().map((city) => {
      const option = document.createElement("option");
      option.value = city;
      return option;
    }));
  } catch (error) {
    const feedback = view.querySelector("#search-feedback");
    if (feedback) feedback.innerHTML = apiNotice(error, "Route list");
  }
}

async function searchTrips(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const source = String(values.get("source")).trim();
  const destination = String(values.get("destination")).trim();
  const travelDate = String(values.get("travelDate"));
  const feedback = view.querySelector("#search-feedback");
  if (source.toLocaleLowerCase() === destination.toLocaleLowerCase()) {
    feedback.innerHTML = `<div class="notice notice-error"><p>Choose different departure and arrival cities.</p></div>`;
    return;
  }
  feedback.innerHTML = `<div class="loading-row"><span class="skeleton-line"></span><span>Searching available trips in Oracle</span></div>`;
  try {
    const query = new URLSearchParams({ source, destination, travelDate });
    const result = await request(`/schedules?${query}`);
    appState.trips = Array.isArray(result.items) ? result.items : [];
    appState.search = { source, destination, travelDate };
    renderResults();
  } catch (error) {
    feedback.innerHTML = apiNotice(error, "Trip search");
    announce("Trip search is not available.");
  }
}

function renderResults() {
  const { source, destination, travelDate } = appState.search;
  const cards = appState.trips.map((trip, index) => `
    <article class="trip-card">
      <div class="operator-cell"><p class="operator-name">${escapeHtml(trip.busName)}</p><span class="operator-type">${escapeHtml(trip.busNumber)} · ${escapeHtml(trip.busType || "Bus")}</span></div>
      <div class="trip-times"><span class="time-block"><strong>${escapeHtml(formatTime(trip.departureTime))}</strong><small>${escapeHtml(trip.source || source)}</small></span><span class="time-line" aria-hidden="true"></span><span class="time-block"><strong>${escapeHtml(formatTime(trip.arrivalTime))}</strong><small>${escapeHtml(trip.destination || destination)}</small></span><span class="trip-duration">${escapeHtml(trip.durationHours ?? "Not set")} hrs · ${escapeHtml(trip.distanceKm ?? "Not set")} km</span></div>
      <div class="trip-price"><strong>${escapeHtml(formatCurrency(trip.fare))}</strong><span>per passenger</span></div>
      <div class="trip-actions"><span class="trip-seats">${escapeHtml(trip.availableSeats)} seats available</span><button class="primary-button choose-trip" type="button" data-trip-index="${index}">Choose seat <span aria-hidden="true">↗</span></button></div>
    </article>`).join("");
  showView(`
    ${pageHeader("AVAILABLE RIDES", `${source} to ${destination}`, formatDate(travelDate))}
    <div class="page-toolbar"><button class="secondary-button" id="edit-search" type="button">← Edit search</button><span class="data-note">Live results from Oracle</span></div>
    <section class="trip-list" aria-label="Bus search results">${cards || `<div class="empty-state"><span class="empty-icon" aria-hidden="true">↗</span><h2>No trips found</h2><p>Try another route or travel date.</p></div>`}</section>`, "book");
  view.querySelector("#edit-search").addEventListener("click", renderHome);
  view.querySelectorAll(".choose-trip").forEach((button) => button.addEventListener("click", () => {
    appState.activeTrip = appState.trips[Number(button.dataset.tripIndex)];
    renderSeatSelection();
  }));
}

async function renderSeatSelection() {
  const trip = appState.activeTrip;
  appState.seats = [];
  appState.selectedSeat = null;
  showView(`
    ${pageHeader("SEAT SELECTION", "Choose your seat", `${escapeHtml(trip.busName || "Bus")} · ${escapeHtml(appState.search.source)} to ${escapeHtml(appState.search.destination)}`)}
    <div class="page-toolbar"><button class="secondary-button" id="back-results" type="button">← Back to buses</button></div>
    <div id="seat-feedback"><div class="loading-row"><span class="skeleton-line"></span><span>Checking live seat availability</span></div></div>`, "book");
  view.querySelector("#back-results").addEventListener("click", renderResults);
  try {
    const result = await request(`/schedules/${encodeURIComponent(trip.scheduleId)}/seats`);
    appState.seats = Array.isArray(result.items) ? result.items : [];
    renderSeatGrid(trip);
  } catch (error) {
    view.querySelector("#seat-feedback").innerHTML = apiNotice(error, "Seat availability");
  }
}

function renderSeatGrid(trip) {
  const seatButtons = appState.seats.map((seat) => {
    const category = String(seat.category || "General").toLowerCase();
    const status = String(seat.status || "booked").toLowerCase();
    const selected = appState.selectedSeat?.seatId === seat.seatId;
    const disabled = status !== "available";
    return `<button type="button" class="seat ${escapeHtml(category)} ${selected ? "selected" : ""} ${disabled ? "booked" : ""}" data-seat-id="${escapeHtml(seat.seatId)}" ${disabled ? "disabled" : ""} aria-pressed="${selected}" aria-label="${escapeHtml(seat.seatNumber)}, ${escapeHtml(seat.category)} seat, ${disabled ? "booked" : "available"}">${escapeHtml(seat.seatNumber)}</button>`;
  });
  const seatRows = [];
  for (let index = 0; index < seatButtons.length; index += 4) {
    const row = seatButtons.slice(index, index + 4);
    seatRows.push(...row.slice(0, 2));
    if (row.length > 2) {
      seatRows.push('<span class="seat-aisle" aria-hidden="true"></span>');
      seatRows.push(...row.slice(2));
    }
  }
  view.querySelector("#seat-feedback").innerHTML = `
    <div class="booking-layout">
      <section class="seat-column">
        <div class="seat-map-heading"><span class="driver-label">FRONT OF BUS</span><div class="seat-legend"><span><i class="legend-seat open"></i>Available</span><span><i class="legend-seat occupied"></i>Booked</span><span><i class="legend-seat reserved-ladies"></i>Ladies</span><span><i class="legend-seat reserved-senior"></i>Senior</span></div></div>
        <div class="seat-map">${seatRows.length ? seatRows.join("") : `<p>No seat records were returned.</p>`}</div>
        <p class="seat-help">Ladies seats are for women passengers. Senior seats are for passengers aged 60 or above.</p>
      </section>
      <aside class="booking-sidebar">
        <div class="selection-summary"><span class="summary-label">YOUR SELECTION</span><p id="chosen-seat">Choose one available seat</p><div class="summary-total"><span>Fare</span><strong>${escapeHtml(formatCurrency(trip.fare))}</strong></div></div>
        <button class="primary-button" id="continue-booking" type="button" disabled>Passenger details <span aria-hidden="true">↗</span></button>
      </aside>
    </div>`;
  view.querySelectorAll(".seat:not(:disabled)").forEach((button) => button.addEventListener("click", () => {
    appState.selectedSeat = appState.seats.find((seat) => String(seat.seatId) === button.dataset.seatId);
    renderSeatGrid(trip);
  }));
  view.querySelector("#chosen-seat").textContent = appState.selectedSeat
    ? `${appState.selectedSeat.seatNumber} · ${appState.selectedSeat.category}`
    : "Choose one available seat";
  view.querySelector("#continue-booking").disabled = !appState.selectedSeat;
  view.querySelector("#continue-booking").addEventListener("click", renderPassengerDetails);
}

function renderPassengerDetails() {
  const trip = appState.activeTrip;
  const seat = appState.selectedSeat;
  showView(`
    ${pageHeader("PASSENGER DETAILS", "Who is travelling?", `Seat ${escapeHtml(seat.seatNumber)} · ${escapeHtml(appState.search.source)} to ${escapeHtml(appState.search.destination)}`)}
    <div class="page-toolbar"><button class="secondary-button" id="back-seats" type="button">← Change seat</button></div>
    <div class="form-layout">
      <form id="booking-form" class="panel form-panel">
        <div id="booking-feedback"></div>
        <p class="form-intro">Your contact details are saved to the passenger record created with this booking.</p>
        <label class="field"><span class="field-label">Full name</span><input name="travellerName" maxlength="100" autocomplete="name" required></label>
        <div class="field-pair">
          <label class="field"><span class="field-label">Email</span><input name="email" type="email" maxlength="254" autocomplete="email" required></label>
          <label class="field"><span class="field-label">Phone</span><input name="phone" type="tel" maxlength="20" inputmode="tel" autocomplete="tel" pattern="[+0-9(). -]{7,20}" title="Use 7 to 20 characters: digits, spaces, +, parentheses, dots, or hyphens." required></label>
        </div>
        <div class="field-pair">
          <label class="field"><span class="field-label">Age</span><input name="travellerAge" type="number" min="1" max="120" required></label>
          <label class="field"><span class="field-label">Gender</span><select name="travellerGender" required><option value="">Select</option><option value="F">Woman (F)</option><option value="M">Man (M)</option></select></label>
        </div>
        <label class="field"><span class="field-label">Payment method</span><select name="paymentMode" required><option value="UPI">UPI</option></select></label>
        <p class="form-error" id="booking-error" role="alert"></p>
        <button class="primary-button" type="submit">Confirm booking <span aria-hidden="true">↗</span></button>
        <p class="small-note">The database procedure saves your passenger details and checks seat availability. Payment remains pending; this website does not collect money.</p>
      </form>
      <aside class="panel order-summary">
        <p class="section-kicker">TRIP SUMMARY</p><h2>${escapeHtml(appState.search.source)} to ${escapeHtml(appState.search.destination)}</h2>
        <dl><div><dt>Travel date</dt><dd>${escapeHtml(formatDate(appState.search.travelDate))}</dd></div><div><dt>Departure</dt><dd>${escapeHtml(formatTime(trip.departureTime))}</dd></div><div><dt>Bus</dt><dd>${escapeHtml(trip.busName)}</dd></div><div><dt>Seat</dt><dd>${escapeHtml(seat.seatNumber)} · ${escapeHtml(seat.category)}</dd></div><div class="summary-total"><dt>Total fare</dt><dd>${escapeHtml(formatCurrency(trip.fare))}</dd></div></dl>
      </aside>
    </div>`, "book");
  view.querySelector("#back-seats").addEventListener("click", renderSeatSelection);
  view.querySelector("#booking-form").addEventListener("submit", submitBooking);
}

async function submitBooking(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = {
    scheduleId: Number(appState.activeTrip.scheduleId),
    seatNumber: appState.selectedSeat.seatNumber,
    travellerName: String(form.get("travellerName")).trim(),
    email: String(form.get("email")).trim(),
    phone: String(form.get("phone")).trim(),
    travellerAge: Number(form.get("travellerAge")),
    travellerGender: String(form.get("travellerGender")),
    paymentMode: String(form.get("paymentMode"))
  };
  const feedback = view.querySelector("#booking-feedback");
  const error = view.querySelector("#booking-error");
  if (!Number.isSafeInteger(body.scheduleId)) {
    error.textContent = "Select a valid trip.";
    return;
  }
  if (!body.travellerName || !body.email || !body.phone || body.travellerAge < 1 || body.travellerAge > 120 || !body.travellerGender) {
    error.textContent = "Enter your name, email, phone, age, and gender.";
    return;
  }
  if (appState.selectedSeat.category === "Ladies" && body.travellerGender !== "F") {
    error.textContent = "This Ladies seat is reserved for women passengers.";
    return;
  }
  if (appState.selectedSeat.category === "Senior" && body.travellerAge < 60) {
    error.textContent = "This Senior seat is reserved for passengers aged 60 or above.";
    return;
  }
  error.textContent = "";
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  feedback.innerHTML = `<div class="loading-row"><span class="skeleton-line"></span><span>Submitting booking to Oracle</span></div>`;
  try {
    const result = await request("/bookings", { method: "POST", body: JSON.stringify(body) });
    const detail = await request(`/bookings/${encodeURIComponent(result.bookingId)}`);
    detail.passengerId = result.passengerId;
    appState.activeBooking = detail;
    renderTicket(detail, true);
  } catch (requestError) {
    submitButton.disabled = false;
    feedback.innerHTML = apiNotice(requestError, "Booking");
  }
}

function ticketMarkup(booking) {
  const tickets = Array.isArray(booking.tickets) ? booking.tickets : [];
  const payments = Array.isArray(booking.payments) ? booking.payments : [];
  const isDemoBooking = String(booking.busNumber || "").startsWith("DEMO-") ||
    tickets.some((ticket) => String(ticket.passengerName || "").startsWith("DEMO - "));
  return `<article class="ticket-card">
    <div class="ticket-brand"><span class="brand-mark" aria-hidden="true">s</span><span>SAARTHI</span><span class="ticket-status">${escapeHtml(booking.bookingStatus)}</span></div>
    <div class="ticket-route"><div><small>FROM</small><strong>${escapeHtml(booking.source || `Schedule ${booking.scheduleId}`)}</strong></div><span aria-hidden="true">→</span><div><small>TO</small><strong>${escapeHtml(booking.destination || "Route details unavailable")}</strong></div></div>
    <div class="ticket-facts"><div><small>BOOKING ID</small><strong>${escapeHtml(booking.bookingId)}</strong></div><div><small>PASSENGER ID</small><strong>${escapeHtml(booking.passengerId ?? "Not available")}</strong></div><div><small>BOOKED ON</small><strong>${escapeHtml(formatDate(booking.bookingDate))}</strong></div><div><small>TRAVEL DATE</small><strong>${escapeHtml(formatDate(booking.travelDate))}</strong></div><div><small>DEPARTURE</small><strong>${escapeHtml(formatTime(booking.departureTime))}</strong></div><div><small>BUS</small><strong>${escapeHtml(booking.operatorName)} ${escapeHtml(booking.busNumber)} · ${escapeHtml(booking.busType)}</strong></div><div><small>PASSENGERS</small><strong>${tickets.map((ticket) => escapeHtml(ticket.passengerName)).join(", ") || "Ticket details unavailable"}</strong></div><div><small>SEATS</small><strong>${tickets.map((ticket) => `${escapeHtml(ticket.seatNumber)} (${escapeHtml(ticket.seatCategory)} · ${escapeHtml(ticket.seatType)})`).join(", ") || "Not available"}</strong></div><div><small>FARE</small><strong>${escapeHtml(formatCurrency(booking.totalAmount))}</strong></div><div><small>PAYMENT AND REFUND</small><strong>${payments.map((payment) => `${escapeHtml(payment.paymentMode)} · ${escapeHtml(payment.paymentStatus)}${isDemoBooking && payment.paymentStatus === "Paid" ? " · DEMO SIMULATED (no money received)" : ""} · refund ${payment.refundAmount === null || payment.refundAmount === undefined ? "Not recorded" : escapeHtml(formatCurrency(payment.refundAmount))}`).join(", ") || "No payment record"}</strong></div></div>
    <p class="ticket-footnote">${isDemoBooking ? "Demo payment statuses are simulated for display only; no money was received. " : ""}Carry your booking details when you travel. Refund status is shown only when recorded by the existing database.</p>
  </article>`;
}

function renderTicket(booking, newlyBooked = false) {
  showView(`
    ${pageHeader(newlyBooked ? "BOOKING CONFIRMED" : "TICKET DETAILS", newlyBooked ? "Your seat is reserved." : `Booking ${booking.bookingId}`, newlyBooked ? "Your passenger record and reservation were saved in Oracle. Payment remains pending." : "Ticket and payment details from your Oracle database.")}
    ${newlyBooked ? `<div class="notice notice-success"><strong>Reservation confirmed</strong><p>Your passenger ID is shown on the ticket so you can look up booking history. No payment has been collected.</p></div>` : ""}
    ${ticketMarkup(booking)}
    <div class="page-toolbar"><a class="secondary-button button-link" href="#history">View booking history</a><a class="text-link" href="#cancellation">Cancellation and refunds ↗</a></div>`, "history");
}

function renderHistory() {
  showView(`
    ${pageHeader("YOUR TRAVEL", "Booking history", "Find existing reservations using the passenger ID stored in Oracle.")}
    <form class="lookup-form" id="history-form"><label class="field"><span class="field-label">Passenger ID</span><input name="passengerId" type="number" min="1" step="1" required></label><button class="primary-button" type="submit">Find bookings <span aria-hidden="true">↗</span></button></form>
    <div id="history-feedback"></div><section id="history-results" class="booking-list" aria-live="polite"></section>`, "history");
  view.querySelector("#history-form").addEventListener("submit", loadHistory);
}

async function loadHistory(event) {
  event.preventDefault();
  const passengerId = Number(new FormData(event.currentTarget).get("passengerId"));
  const feedback = view.querySelector("#history-feedback");
  const results = view.querySelector("#history-results");
  feedback.innerHTML = `<div class="loading-row"><span class="skeleton-line"></span><span>Loading bookings from Oracle</span></div>`;
  results.replaceChildren();
  try {
    const result = await request(`/passengers/${encodeURIComponent(passengerId)}/bookings`);
    feedback.replaceChildren();
    if (!result.items.length) {
      results.innerHTML = `<div class="empty-state"><h2>No bookings found</h2><p>No booking records were returned for this passenger ID.</p></div>`;
      return;
    }
    result.items.forEach((booking) => {
      const card = document.createElement("article");
      card.className = "history-row";
      card.innerHTML = `<div><p class="operator-name">Booking ${escapeHtml(booking.bookingId)}</p><span class="operator-type">Schedule ${escapeHtml(booking.scheduleId)} · ${escapeHtml(booking.bookingStatus)}</span></div><div><small>PASSENGER</small><strong>${escapeHtml(booking.passengerName || "Ticket details unavailable")}</strong></div><div><small>SEAT</small><strong>${escapeHtml(booking.seatNumber || "Not available")}</strong></div><div><small>AMOUNT</small><strong>${escapeHtml(formatCurrency(booking.totalAmount))}</strong></div><button class="secondary-button ticket-link" type="button" data-booking-id="${escapeHtml(booking.bookingId)}">Ticket details</button>`;
      results.append(card);
    });
    results.querySelectorAll(".ticket-link").forEach((button) => button.addEventListener("click", () => loadTicket(button.dataset.bookingId)));
  } catch (error) {
    feedback.innerHTML = apiNotice(error, "Booking history");
  }
}

async function loadTicket(bookingId) {
  try {
    const booking = await request(`/bookings/${encodeURIComponent(bookingId)}`);
    appState.activeBooking = booking;
    renderTicket(booking);
  } catch (error) {
    const feedback = view.querySelector("#history-feedback");
    if (feedback) feedback.innerHTML = apiNotice(error, "Ticket lookup");
  }
}

function renderCancellation() {
  showView(`
    ${pageHeader("AFTER YOU BOOK", "Cancellation and refunds", "Review a reservation before asking the existing Oracle procedure to cancel it.")}
    <form class="lookup-form" id="cancellation-form"><label class="field"><span class="field-label">Booking ID</span><input name="bookingId" type="number" min="1" step="1" required></label><button class="primary-button" type="submit">Find booking <span aria-hidden="true">↗</span></button></form>
    <div id="cancellation-feedback"></div><section id="cancellation-details"></section>`, "cancellation");
  view.querySelector("#cancellation-form").addEventListener("submit", lookupCancellation);
}

async function lookupCancellation(event) {
  event.preventDefault();
  const bookingId = Number(new FormData(event.currentTarget).get("bookingId"));
  const feedback = view.querySelector("#cancellation-feedback");
  feedback.innerHTML = `<div class="loading-row"><span class="skeleton-line"></span><span>Loading booking and payment details</span></div>`;
  view.querySelector("#cancellation-details").replaceChildren();
  try {
    const booking = await request(`/bookings/${encodeURIComponent(bookingId)}`);
    feedback.replaceChildren();
    const details = view.querySelector("#cancellation-details");
    details.innerHTML = `${ticketMarkup(booking)}<div class="cancel-panel"><div><h2>Cancel this booking?</h2><p>The configured Oracle procedure controls cancellation and any payment-state updates. Check your refund result after cancellation.</p></div><button class="danger-button" id="cancel-booking" type="button" ${booking.bookingStatus === "Cancelled" ? "disabled" : ""}>${booking.bookingStatus === "Cancelled" ? "Already cancelled" : "Cancel booking"}</button></div>`;
    if (booking.bookingStatus !== "Cancelled") details.querySelector("#cancel-booking").addEventListener("click", () => cancelBooking(bookingId));
  } catch (error) {
    feedback.innerHTML = apiNotice(error, "Booking lookup");
  }
}

async function cancelBooking(bookingId) {
  const feedback = view.querySelector("#cancellation-feedback");
  feedback.innerHTML = `<div class="loading-row"><span class="skeleton-line"></span><span>Submitting cancellation to Oracle</span></div>`;
  try {
    const result = await request(`/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: "POST", body: "{}" });
    feedback.innerHTML = `<div class="notice notice-success"><strong>Cancellation processed</strong><p>Current booking and payment status are shown below.</p></div>`;
    view.querySelector("#cancellation-details").innerHTML = ticketMarkup(result.booking);
  } catch (error) {
    feedback.innerHTML = apiNotice(error, "Cancellation");
  }
}

const adminSections = [
  ["overview", "Overview"], ["buses", "Buses"], ["routes", "Routes"], ["schedules", "Schedules"], ["bookings", "Bookings"], ["reports", "Reports"]
];
const adminEditors = {
  buses: {
    idField: "busId",
    fields: [
      ["busNumber", "Bus number", "text", 20],
      ["operatorName", "Operator", "text", 100],
      ["busType", "Bus type", "text", 30],
      ["totalSeats", "Total seats", "number", 300]
    ]
  },
  routes: {
    idField: "routeId",
    fields: [
      ["sourceCity", "From city", "text", 100],
      ["destinationCity", "To city", "text", 100],
      ["distanceKm", "Distance in kilometres", "number", 999999, "0.01"],
      ["estimatedDurationHours", "Estimated hours", "number", 9999, "0.01"]
    ]
  },
  schedules: {
    idField: "scheduleId",
    fields: [
      ["travelDate", "Travel date", "date"],
      ["departureTime", "Departure time", "time"],
      ["arrivalTime", "Arrival time", "time"],
      ["baseFare", "Fare in rupees", "number", 99999999, "0.01"]
    ]
  }
};
const adminSingular = { buses: "bus", routes: "route", schedules: "schedule" };
const adminCreateFields = {
  buses: adminEditors.buses.fields,
  routes: adminEditors.routes.fields,
  schedules: [
    ["busId", "Bus", "select"],
    ["routeId", "Route", "select"],
    ...adminEditors.schedules.fields
  ]
};

function adminTable(columns, rows, editableResource) {
  if (!rows.length) return `<div class="empty-state"><h2>No records</h2><p>No Oracle rows are available for this section.</p></div>`;
  const actionHeader = editableResource ? "<th scope=\"col\">Actions</th>" : "";
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${columns.map(([, label]) => `<th scope="col">${escapeHtml(label)}</th>`).join("")}${actionHeader}</tr></thead><tbody>${rows.map((row, index) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(row[key] ?? "Not set")}</td>`).join("")}${editableResource ? `<td><div class="admin-row-actions"><button class="secondary-button" type="button" data-admin-edit="${index}" aria-label="Edit ${escapeHtml(editableResource)} row ${escapeHtml(row[adminEditors[editableResource].idField])}">Edit</button><button class="danger-button" type="button" data-admin-delete="${index}" aria-label="Delete ${escapeHtml(editableResource)} row ${escapeHtml(row[adminEditors[editableResource].idField])}">Delete</button></div></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 5);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderAdminData(section, result) {
  const target = view.querySelector("#admin-feedback");
  if (!target) return;
  if (section === "overview") {
    const summary = result.summary;
    const metrics = [
      ["busCount", "Buses"],
      ["routeCount", "Routes"],
      ["scheduleCount", "Schedules"],
      ["bookingCount", "Bookings"],
      ["confirmedBookingCount", "Confirmed"],
      ["paidAmount", "Payments received"]
    ];
    target.innerHTML = `<div class="admin-metrics">${metrics.map(([key, label]) => `<div class="metric-tile"><span>${label}</span><strong>${key === "paidAmount" ? escapeHtml(formatCurrency(summary[key])) : escapeHtml(summary[key])}</strong></div>`).join("")}</div>`;
    return;
  }
  if (section === "reports") {
    const bookingColumns = [["label", "Booking status"], ["bookingCount", "Bookings"], ["totalAmount", "Booked amount"]];
    const paymentColumns = [["label", "Payment status"], ["paymentCount", "Payments"], ["totalAmount", "Payment amount"], ["refundAmount", "Refunds"]];
    target.innerHTML = `<h3 class="report-heading">Bookings</h3>${adminTable(bookingColumns, (result.bookings || []).map((row) => ({ ...row, totalAmount: formatCurrency(row.totalAmount) })))}<h3 class="report-heading">Payments and refunds</h3>${adminTable(paymentColumns, (result.payments || []).map((row) => ({ ...row, totalAmount: formatCurrency(row.totalAmount), refundAmount: formatCurrency(row.refundAmount) })))}`;
    return;
  }
  const columns = {
    buses: [["busId", "Bus ID"], ["busNumber", "Bus number"], ["operatorName", "Operator"], ["busType", "Type"], ["totalSeats", "Seats"]],
    routes: [["routeId", "Route ID"], ["sourceCity", "From"], ["destinationCity", "To"], ["distanceKm", "Distance km"], ["estimatedDurationHours", "Hours"]],
    schedules: [["scheduleId", "Schedule ID"], ["travelDate", "Travel date"], ["departureTime", "Departure"], ["arrivalTime", "Arrival"], ["busNumber", "Bus"], ["sourceCity", "From"], ["destinationCity", "To"], ["baseFare", "Fare"], ["availableSeats", "Available"]],
    bookings: [["bookingId", "Booking ID"], ["accountHolder", "Account holder"], ["scheduleId", "Schedule"], ["sourceCity", "From"], ["destinationCity", "To"], ["bookingDate", "Booked"], ["travelDate", "Travel date"], ["travellers", "Travellers"], ["seats", "Seats"], ["totalAmount", "Amount"], ["bookingStatus", "Status"]]
  }[section];
  const rows = result.items.map((row) => ({
    ...row,
    travelDate: row.travelDate ? formatDate(row.travelDate) : row.travelDate,
    bookingDate: row.bookingDate ? formatDate(row.bookingDate) : row.bookingDate,
    departureTime: row.departureTime ? formatTime(row.departureTime) : row.departureTime,
    arrivalTime: row.arrivalTime ? formatTime(row.arrivalTime) : row.arrivalTime,
    baseFare: row.baseFare === null ? row.baseFare : formatCurrency(row.baseFare),
    totalAmount: row.totalAmount === null ? row.totalAmount : formatCurrency(row.totalAmount)
  }));
  const editableResource = adminEditors[section] ? section : null;
  adminState.section = section;
  adminState.items = result.items;
  adminState.editingId = null;
  adminState.creating = false;
  target.innerHTML = `${adminTable(columns, rows, editableResource)}${editableResource ? `<p class="admin-table-note">${section === "schedules" ? "Trips with booking history cannot be edited or deleted. Available seats are maintained by Oracle." : "Records still referenced by other data cannot be deleted."}</p><div id="admin-editor"></div>` : ""}`;
  if (!editableResource) return;
  target.querySelectorAll("[data-admin-edit]").forEach((button) => button.addEventListener("click", () => {
    renderAdminEditor(section, Number(button.dataset.adminEdit));
  }));
  target.querySelectorAll("[data-admin-delete]").forEach((button) => button.addEventListener("click", () => {
    deleteAdminRecord(section, Number(button.dataset.adminDelete));
  }));
}

function renderAdminEditor(section, index) {
  const record = adminState.items[index];
  const config = adminEditors[section];
  const editor = view.querySelector("#admin-editor");
  if (!record || !config || !editor) return;
  const id = record[config.idField];
  adminState.editingId = id;
  adminState.creating = false;
  const fields = config.fields.map(([name, label, type, maximum, step]) => {
    const rawValue = record[name];
    const value = type === "date" ? dateInputValue(rawValue)
      : type === "time" ? timeInputValue(rawValue)
        : rawValue ?? "";
    const bounds = type === "number"
      ? ` min="${name === "baseFare" ? 0 : 1}" max="${maximum}" step="${step || 1}"`
      : "";
    return `<label class="field"><span class="field-label">${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${type}" value="${escapeHtml(value)}" maxlength="${maximum || ""}"${bounds} required></label>`;
  }).join("");
  const note = section === "schedules"
    ? "Trips with booking history are protected. Arrival times earlier than departure are treated as the following day. Bus, route, and available-seat relationships are maintained by Oracle."
    : section === "buses"
      ? "Changing seat capacity adds or removes generated seats. Capacity cannot be reduced below confirmed bookings or seats with ticket history."
      : "Routes referenced by scheduled or historical trips cannot be deleted.";
  editor.innerHTML = `<form class="panel admin-editor" id="admin-edit-form"><div class="admin-editor-heading"><div><h3>Edit ${adminSingular[section]} ${escapeHtml(id)}</h3><p>${escapeHtml(note)}</p></div><button class="icon-button" id="close-admin-editor" type="button" aria-label="Close edit form">×</button></div><div class="admin-editor-fields">${fields}</div><p class="form-error" id="admin-edit-error" role="alert"></p><div class="admin-editor-actions"><button class="primary-button" type="submit">Save changes</button><button class="secondary-button" id="cancel-admin-edit" type="button">Discard</button></div></form>`;
  const form = editor.querySelector("#admin-edit-form");
  form.addEventListener("submit", (event) => saveAdminRecord(event, section, config.idField, id));
  editor.querySelector("#close-admin-editor").addEventListener("click", () => { editor.replaceChildren(); adminState.editingId = null; });
  editor.querySelector("#cancel-admin-edit").addEventListener("click", () => { editor.replaceChildren(); adminState.editingId = null; });
  form.querySelector("input").focus();
}

async function openAdminCreate(section) {
  const editor = view.querySelector("#admin-editor");
  if (!editor || !adminCreateFields[section]) return;
  adminState.editingId = null;
  adminState.creating = true;
  editor.innerHTML = `<div class="loading-row"><span class="skeleton-line"></span><span>Preparing new ${escapeHtml(adminSingular[section])}</span></div>`;

  try {
    let options = {};
    if (section === "schedules") {
      const [buses, routes] = await Promise.all([request("/admin/buses"), request("/admin/routes")]);
      options = {
        busId: buses.items.map((bus) => ({ value: bus.busId, label: `${bus.busNumber} · ${bus.operatorName}` })),
        routeId: routes.items.map((route) => ({
          value: route.routeId,
          label: `${route.sourceCity} → ${route.destinationCity}`
        }))
      };
    }
    if (!editor.isConnected || !adminState.creating) return;
    renderAdminCreateForm(section, options);
  } catch (error) {
    editor.innerHTML = `<div class="notice notice-error" role="alert"><strong>Could not prepare the form</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderAdminCreateForm(section, options) {
  const editor = view.querySelector("#admin-editor");
  if (!editor) return;
  const fields = adminCreateFields[section].map(([name, label, type, maximum, step]) => {
    if (type === "select") {
      const choices = options[name] || [];
      return `<label class="field"><span class="field-label">${escapeHtml(label)}</span><select name="${escapeHtml(name)}" required ${choices.length ? "" : "disabled"}><option value="">Choose ${escapeHtml(label.toLowerCase())}</option>${choices.map((choice) => `<option value="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}</option>`).join("")}</select></label>`;
    }
    const bounds = type === "number"
      ? ` min="${name === "baseFare" ? 0 : 1}" max="${maximum}" step="${step || 1}"`
      : "";
    return `<label class="field"><span class="field-label">${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${type}" maxlength="${maximum || ""}"${bounds} required></label>`;
  }).join("");
  const missingOptions = section === "schedules" && (!options.busId?.length || !options.routeId?.length)
    ? `<p class="form-error" id="admin-create-error" role="alert">Add at least one bus and one route before scheduling a trip.</p>`
    : `<p class="form-error" id="admin-create-error" role="alert"></p>`;
  const submitDisabled = section === "schedules" && (!options.busId?.length || !options.routeId?.length);
  const note = section === "buses"
    ? "Adding a bus also creates its available seats in Oracle."
    : section === "routes"
      ? "Route names and distances must match your service plan."
      : "Oracle sets available seats from the selected bus. Trips that overlap another departure for the same bus are rejected.";
  editor.innerHTML = `<form class="panel admin-editor" id="admin-create-form"><div class="admin-editor-heading"><div><h3>Add ${escapeHtml(adminSingular[section])}</h3><p>${escapeHtml(note)}</p></div><button class="icon-button" id="close-admin-create" type="button" aria-label="Close add form">×</button></div><div class="admin-editor-fields">${fields}</div>${missingOptions}<div class="admin-editor-actions"><button class="primary-button" type="submit" ${submitDisabled ? "disabled" : ""}>Add ${escapeHtml(adminSingular[section])}</button><button class="secondary-button" id="cancel-admin-create" type="button">Cancel</button></div></form>`;
  const form = editor.querySelector("#admin-create-form");
  form.addEventListener("submit", (event) => createAdminRecord(event, section));
  const closeForm = () => {
    editor.replaceChildren();
    adminState.creating = false;
  };
  editor.querySelector("#close-admin-create").addEventListener("click", closeForm);
  editor.querySelector("#cancel-admin-create").addEventListener("click", closeForm);
  form.querySelector("input, select")?.focus();
}

async function createAdminRecord(event, section) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = form.querySelector("#admin-create-error");
  const fields = adminCreateFields[section];
  const body = {};
  for (const [field, , type] of fields) {
    const value = new FormData(form).get(field);
    body[field] = type === "number" || type === "select" ? Number(value) : String(value).trim();
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  error.textContent = "";
  try {
    const result = await request(`/admin/${encodeURIComponent(section)}`, {
      method: "POST",
      body: JSON.stringify(body)
    });
    renderAdmin(section, `${adminSingular[section]} ${result.id} was added.`);
  } catch (requestError) {
    error.textContent = requestError.message;
    submit.disabled = false;
  }
}

async function saveAdminRecord(event, section, idField, id) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = form.querySelector("#admin-edit-error");
  const config = adminEditors[section];
  const body = { [idField]: id };
  for (const [field, , type] of config.fields) {
    const value = new FormData(form).get(field);
    body[field] = type === "number" ? Number(value) : String(value).trim();
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  error.textContent = "";
  try {
    await request(`/admin/${encodeURIComponent(section)}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body)
    });
    renderAdmin(section, `${section.slice(0, -1)} ${id} was updated.`);
  } catch (requestError) {
    error.textContent = requestError.message;
    submit.disabled = false;
  }
}

async function deleteAdminRecord(section, index) {
  const record = adminState.items[index];
  const config = adminEditors[section];
  if (!record || !config) return;
  const id = record[config.idField];
  if (!window.confirm(`Delete ${adminSingular[section]} ${id}? Records referenced by trips or booking history will be rejected by Oracle.`)) return;
  try {
    await request(`/admin/${encodeURIComponent(section)}/${encodeURIComponent(id)}`, { method: "DELETE" });
    renderAdmin(section, `${adminSingular[section]} ${id} was deleted.`);
  } catch (error) {
    const feedback = view.querySelector("#admin-feedback");
    if (feedback) feedback.insertAdjacentHTML("afterbegin", apiNotice(error, `Delete ${section.slice(0, -1)}`));
  }
}

async function downloadAdminExport(button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Preparing export…";
  try {
    const response = await fetch(`${apiBase}/admin/export.zip`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(body.message || "The database export could not be created.", response.status, body.code);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || "saarthi-database.zip";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    button.textContent = "Export downloaded";
  } catch (error) {
    const feedback = view.querySelector("#admin-feedback");
    if (feedback) feedback.innerHTML = apiNotice(error, "Database export");
    button.textContent = originalLabel;
  } finally {
    button.disabled = false;
  }
}

function renderAdmin(section = "overview", successMessage = "") {
  if (!adminSections.some(([key]) => key === section)) section = "overview";
  showView(`
    ${pageHeader("OPERATIONS", "Admin dashboard", "Review database-backed buses, routes, schedules, bookings, and payment reports.")}
    <div class="admin-layout">
      <nav class="admin-nav" aria-label="Admin sections">${adminSections.map(([key, label]) => `<button class="${section === key ? "active" : ""}" type="button" data-admin-section="${key}">${label}</button>`).join("")}</nav>
      <section class="admin-content">
        <div class="panel admin-panel"><div class="admin-panel-heading"><div><p class="section-kicker">ORACLE DATA</p><h2>${escapeHtml(adminSections.find(([key]) => key === section)?.[1] || "Overview")}</h2></div><div class="admin-panel-actions">${adminCreateFields[section] ? `<button class="primary-button" id="add-admin-record" type="button">Add ${escapeHtml(adminSingular[section])}</button>` : ""}<button class="secondary-button" id="export-database" type="button">Export all table data</button></div></div>
          <div class="notice notice-warn"><strong>Local-only administration</strong><p>Bus, route, and schedule records can be edited. Deletion is blocked when dependent history exists. Passenger, booking, ticket, and payment records are protected; cancel bookings through the cancellation flow.</p></div>
          <div class="notice notice-warn"><strong>Database export contains private records</strong><p>The ZIP includes all rows from all eight tables, including passenger names, email addresses, phone numbers, tickets, and payments. Keep the download private.</p></div>
          <div class="notice notice-warn"><strong>Demo payments are simulated</strong><p>DEMO bookings marked Paid are for display and testing only. No money was received.</p></div>
          ${successMessage ? `<div class="notice notice-success"><strong>Database change complete</strong><p>${escapeHtml(successMessage)}</p></div>` : ""}
          <div id="admin-feedback"><div class="loading-row"><span class="skeleton-line"></span><span>Loading records from Oracle</span></div></div>
        </div>
      </section>
    </div>`, "admin");
  view.querySelector("#export-database").addEventListener("click", (event) => downloadAdminExport(event.currentTarget));
  view.querySelector("#add-admin-record")?.addEventListener("click", () => openAdminCreate(section));
  view.querySelectorAll("[data-admin-section]").forEach((button) => button.addEventListener("click", () => renderAdmin(button.dataset.adminSection)));
  request(`/admin/${encodeURIComponent(section)}`)
    .then((result) => renderAdminData(section, result))
    .catch((error) => {
      const target = view.querySelector("#admin-feedback");
      if (target) target.innerHTML = apiNotice(error, "Admin data");
    });
}

function routeFromHash() {
  const route = window.location.hash.slice(1).split("/")[0];
  if (route === "history") renderHistory();
  else if (route === "cancellation") renderCancellation();
  else if (route === "admin") renderAdmin();
  else renderHome();
}

async function checkConnection() {
  const status = document.querySelector("#connection-status");
  try {
    const result = await request("/health");
    status.classList.toggle("connected", result.oracle === "connected");
    status.classList.toggle("disconnected", result.oracle !== "connected");
    status.querySelector("span:last-child").textContent = result.oracle === "connected" ? "Oracle connected" : "Oracle not configured";
    if (result.oracle === "connected" && window.location.hash === "#book" && view.querySelector("#route-cities")) {
      loadRouteCities();
    }
  } catch {
    status.classList.add("disconnected");
    status.querySelector("span:last-child").textContent = "Oracle unavailable";
  }
}

window.addEventListener("hashchange", routeFromHash);
routeFromHash();
checkConnection();
