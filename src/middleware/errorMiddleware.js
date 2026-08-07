function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  const databaseStatus = error.code === "22P02" ? 400 : error.code === "23505" ? 409 : undefined;
  const statusCode = error.statusCode || databaseStatus || (error.type === "entity.parse.failed" ? 400 : 500);

  if (statusCode >= 500) {
    console.error(JSON.stringify({
      level: "error",
      requestId: req.requestId,
      message: error.message,
      stack: error.stack,
    }));
  }

  res.status(statusCode).json({
    message: statusCode >= 500 ? "Internal server error" : (error.message || "Request failed"),
    requestId: req.requestId,
  });
}

module.exports = {
  notFound,
  errorHandler,
};
