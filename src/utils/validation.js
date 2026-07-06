const VALID_BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const VALID_URGENCY_LEVELS = ["normal", "urgent", "critical"];
const VALID_REQUEST_STATUSES = ["open", "matched", "fulfilled", "cancelled"];

function requireFields(body, fields) {
  const missingFields = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === "";
  });

  if (missingFields.length > 0) {
    const error = new Error(`Missing required fields: ${missingFields.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
}

function assertAllowedValue(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    const error = new Error(
      `${fieldName} must be one of: ${allowedValues.join(", ")}`,
    );
    error.statusCode = 400;
    throw error;
  }
}

function assertNumber(value, fieldName) {
  if (Number.isNaN(Number(value))) {
    const error = new Error(`${fieldName} must be a number`);
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  VALID_BLOOD_TYPES,
  VALID_URGENCY_LEVELS,
  VALID_REQUEST_STATUSES,
  requireFields,
  assertAllowedValue,
  assertNumber,
};
