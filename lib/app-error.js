export class AppError extends Error {
  constructor(type, message, details) {
    super(message || type);
    this.error = type;
    this.reason = message;
    this.details = details;
    this.name = 'AppError';
  }

  get statusCode() {
    return 400;
  }
}
