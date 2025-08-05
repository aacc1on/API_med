const winston = require('winston');
const { combine, timestamp, printf, colorize, align } = winston.format;
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Define log format
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message} `;
  if (Object.keys(metadata).length > 0) {
    msg += JSON.stringify(metadata, null, 2);
  }
  return msg;
});

// Create a console transport for development
const consoleTransport = new winston.transports.Console({
  format: combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    align(),
    logFormat
  ),
  level: 'debug'
});

// Create a file transport for errors
const errorFileTransport = new winston.transports.File({
  filename: path.join(logDir, 'error.log'),
  level: 'error',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  )
});

// Create a file transport for combined logs
const combinedFileTransport = new winston.transports.File({
  filename: path.join(logDir, 'combined.log'),
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  )
});

// Create the logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'medreminder-api' },
  transports: [
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    errorFileTransport,
    combinedFileTransport
  ]
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(consoleTransport);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // In production, you might want to restart the process
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to restart the process
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

module.exports = logger;
