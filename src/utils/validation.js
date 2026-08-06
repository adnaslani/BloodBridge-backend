const VALID_BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const VALID_ROLES = ["donor", "patient", "hospital", "admin"];
const VALID_URGENCY_LEVELS = ["normal", "urgent", "critical"];
const VALID_REQUEST_STATUSES = ["open", "matched", "fulfilled", "cancelled"];

function requireFields(body, fields) {
  const missingFields = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
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
  if (typeof value === "string" && value.trim() === "") {
    const error = new Error(`${fieldName} must be a number`);
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(Number(value))) {
    const error = new Error(`${fieldName} must be a number`);
    error.statusCode = 400;
    throw error;
  }
}

function assertStringLength(value, fieldName, maximum, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "") || value.length > maximum) {
    const error = new Error(`${fieldName} must be ${allowEmpty ? "a string up to" : "a non-empty string up to"} ${maximum} characters long`);
    error.statusCode = 400;
    throw error;
  }
}

function assertIntegerInRange(value, fieldName, minimum, maximum) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    const error = new Error(
      `${fieldName} must be an integer between ${minimum} and ${maximum}`,
    );
    error.statusCode = 400;
    throw error;
  }
}

function assertCoordinate(value, fieldName, minimum, maximum) {
  assertNumber(value, fieldName);

  const number = Number(value);

  if (number < minimum || number > maximum) {
    const error = new Error(
      `${fieldName} must be between ${minimum} and ${maximum}`,
    );
    error.statusCode = 400;
    throw error;
  }
}

function assertUuid(value, fieldName = "id") {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const error = new Error(`${fieldName} must be a valid UUID`);
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  VALID_BLOOD_TYPES,
  VALID_ROLES,
  VALID_URGENCY_LEVELS,
  VALID_REQUEST_STATUSES,
  requireFields,
  assertAllowedValue,
  assertNumber,
  assertIntegerInRange,
  assertCoordinate,
  assertStringLength,
  assertUuid,
};
