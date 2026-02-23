"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../config");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Create logs directory if it doesn't exist
const logsDir = path_1.default.dirname(config_1.config.logFile);
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
// Define log format
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json());
// Create console format for better readability in development
const consoleFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
        msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
}));
// Create logger instance
const logger = winston_1.default.createLogger({
    level: config_1.config.logLevel,
    format: logFormat,
    transports: [
        // File transport for errors
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // File transport for all logs
        new winston_1.default.transports.File({
            filename: config_1.config.logFile,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
    // Handle exceptions and rejections
    exceptionHandlers: [
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'exceptions.log'),
        }),
    ],
    rejectionHandlers: [
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'rejections.log'),
        }),
    ],
});
// Add console transport in development
if (config_1.config.nodeEnv !== 'production') {
    logger.add(new winston_1.default.transports.Console({
        format: consoleFormat,
    }));
}
exports.default = logger;
