function asyncRoute(handler) {
  return function wrappedRoute(request, response, next) {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function mapDatabaseError(error) {
  if (error.code === "ORACLE_NOT_CONFIGURED") return error;
  if (error.errorNum === 20040 || error.errorNum === 20041) {
    error.status = 409;
    error.code = "SEAT_RESTRICTION";
    return error;
  }
  if (error.errorNum === 20010 || error.errorNum === 20011 || error.errorNum === 20012 ||
      error.errorNum === 20013 || error.errorNum === 20014 || error.errorNum === 20015) {
    error.status = 409;
    error.code = "BOOKING_REJECTED";
    return error;
  }
  if ([20110, 20111, 20112, 20113, 20114].includes(error.errorNum) ||
      /ORA-00001|ORA-02291|ORA-02292/.test(error.message || "")) {
    error.status = 409;
    error.code = error.errorNum === 20111 ? "ADMIN_RECORD_NOT_FOUND" : "ADMIN_CHANGE_REJECTED";
    if (error.errorNum === 20111) error.message = "That record no longer exists. Refresh the table and try again.";
    if (/ORA-00001/.test(error.message || "")) error.message = "That value conflicts with an existing unique record.";
    if (/ORA-02291|ORA-02292/.test(error.message || "")) {
      error.message = "This record is still referenced by related database records and cannot be changed or deleted.";
    }
    return error;
  }
  if (/ORA-28001/.test(error.message || "")) {
    error.status = 503;
    error.code = "ORACLE_PASSWORD_EXPIRED";
    error.message = "The Oracle password has expired. Update it interactively in SQL*Plus, then configure the application's least-privilege account in the local .env file.";
    return error;
  }
  if (/ORA-01017|ORA-12154|ORA-12514|ORA-12541|ORA-12545/.test(error.message || "")) {
    error.status = 503;
    error.code = "ORACLE_UNAVAILABLE";
    error.message = "Oracle could not be reached with the configured connection details. Verify the service name, listener, username, and local .env values.";
    return error;
  }
  if (/ORA-00904|ORA-00942|ORA-06550|PLS-00201|PLS-00306|ORA-04063/.test(error.message || "")) {
    error.status = 501;
    error.code = "SCHEMA_REQUIRED";
    error.message = "An Oracle table, column, function, or procedure required by this feature is missing or has a different definition. Provide the base schema and PL/SQL scripts so this query can be matched to the actual database.";
    return error;
  }
  return error;
}

function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  const mapped = mapDatabaseError(error);
  const status = Number.isInteger(mapped.status) ? mapped.status : 500;
  if (status >= 500) console.error(`[${request.method} ${request.originalUrl}]`, mapped);
  response.status(status).json({
    error: true,
    code: mapped.code || "REQUEST_FAILED",
    message: status === 500 ? "The request failed. Check the backend log for details." : mapped.message
  });
}

function schemaRequired(message) {
  const error = new Error(message);
  error.status = 501;
  error.code = "SCHEMA_REQUIRED";
  return error;
}

module.exports = { asyncRoute, errorHandler, schemaRequired };
