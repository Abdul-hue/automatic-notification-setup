require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');
const { activeSessions } = require('./src/services/whatsappService');

// Import routers
const whatsappRoutes = require('./src/routes/whatsapp.js');
const emailRoutes = require('./src/routes/email.js');

// Initialize express app
const app = express();

// Configure CORS to allow all origins (for development)
app.use(cors({
  origin: '*'
}));

// Add express.json() middleware for parsing JSON requests
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      whatsapp: {
        activeSessions: activeSessions.size,
        sessions: Array.from(activeSessions.keys()).map(sessionId => ({
          sessionId,
          connected: activeSessions.get(sessionId)?.isConnected || false
        }))
      },
      email: {
        configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
        provider: process.env.SMTP_HOST
      }
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  });
});

// Register routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/email', emailRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server on PORT from .env (default 3001)
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  logger.info('Server running on port', PORT);
  logger.info('WhatsApp API: http://localhost:' + PORT + '/api/whatsapp');
  logger.info('Email API: http://localhost:' + PORT + '/api/email');
});

/**
 * Cleanup function for graceful shutdown
 */
async function cleanup() {
  logger.info('Shutting down gracefully...');

  // Close all active WhatsApp sessions
  for (const [sessionId, session] of activeSessions.entries()) {
    try {
      if (session.socket) {
        await session.socket.logout();
        logger.info(`Logged out session: ${sessionId}`);
      }
    } catch (err) {
      logger.error(`Error closing session ${sessionId}:`, err);
    }
  }
  
  // Close server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  cleanup();
});
