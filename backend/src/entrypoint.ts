/**
 * Entrypoint wrapper — registers crash handlers BEFORE loading server.ts
 * so that ANY synchronous throw during module loading is captured and logged.
 */

process.on('uncaughtException', (err: Error) => {
  console.error('========================================');
  console.error('FATAL UNCAUGHT EXCEPTION:', err.message);
  console.error('Stack:', err.stack);
  console.error('========================================');
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('========================================');
  console.error('FATAL UNHANDLED REJECTION:', reason);
  console.error('========================================');
  process.exit(1);
});

console.log('Entrypoint: crash handlers registered, loading server...');

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./server');
