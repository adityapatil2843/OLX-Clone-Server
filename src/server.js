import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma, connectPrisma } from './db/prisma.js';
import { assertDevIdentityIsSafe } from './middlewares/devCreatorIdentity.js';

// Fail fast if dev identity bypass is enabled in production
assertDevIdentityIsSafe();

const PORT = env.PORT || 5000;

let server = null;

const startServer = async () => {
  try {
    // Verify database connectivity before opening port
    await connectPrisma();

    server = app.listen(PORT, () => {
      logger.info(
        `🚀 Server listening on http://localhost:${PORT} in ${env.NODE_ENV} mode`
      );
      logger.info(
        `🏥 Health endpoints: http://localhost:${PORT}/health/live & http://localhost:${PORT}/health/ready`
      );
    });
  } catch (error) {
    logger.fatal({ err: error }, '❌ Failed to start server');
    process.exit(1);
  }
};

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.info(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('🔒 Closed HTTP server connections.');

      try {
        await prisma.$disconnect();
        logger.info('🔌 Disconnected Prisma database client.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, '❌ Error during database disconnect');
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds if graceful close hangs
    setTimeout(() => {
      logger.error('⚠️ Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, '💥 Unhandled Rejection at promise');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, '💥 Uncaught Exception thrown');
  gracefulShutdown('uncaughtException');
});

startServer();

export { server, startServer, gracefulShutdown };
export default app;
