function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.path} — ${err.message}`);

  const status = err.status || 500;
  const message = status === 500
    ? 'An unexpected error occurred'
    : err.message;

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
