const express = require('express');
const router = express.Router();
const {
  initializeWhatsApp,
  sendWhatsAppMessage,
  getQRCode,
  getSessionStatus,
  activeSessions
} = require('../services/whatsappService');
const { whatsappLimiter } = require('../utils/rateLimiter');
const { validateWhatsAppMessage } = require('../middleware/validation');
const logger = require('../utils/logger');

/**
 * POST /api/whatsapp/connect/:sessionId
 * Initialize WhatsApp connection
 */
router.post('/connect/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    logger.info(`Initializing WhatsApp for session: ${sessionId}`);
    
    await initializeWhatsApp(sessionId);
    
    res.json({
      success: true,
      message: 'WhatsApp connection initiated. Please wait for QR code.',
      sessionId,
      instructions: `Check QR code at: GET /api/whatsapp/qr/${sessionId}`
    });
  } catch (error) {
    logger.error('Error connecting WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initialize WhatsApp connection'
    });
  }
});

/**
 * GET /api/whatsapp/qr/:sessionId
 * Get QR code for scanning (CRITICAL FOR FRONTEND)
 */
router.get('/qr/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log('[QR-ENDPOINT] 📞 QR request received for session:', sessionId);
    console.log('[QR-ENDPOINT] Active sessions count:', activeSessions.size);
    console.log('[QR-ENDPOINT] Active session IDs:', Array.from(activeSessions.keys()));
    
    const qrData = getQRCode(sessionId);
    
    console.log('[QR-ENDPOINT] QR data retrieved:', {
      exists: !!qrData,
      hasQR: qrData?.qrCode ? true : false,
      qrLength: qrData?.qrCode?.length || 0,
      status: qrData?.status,
      isConnected: qrData?.isConnected
    });
    
    if (!qrData) {
      console.log('[QR-ENDPOINT] ❌ Session not found');
      return res.status(404).json({
        success: false,
        error: 'Session not found. Please initialize first.',
        sessionId,
        debug: {
          activeSessions: activeSessions.size,
          activeSessionIds: Array.from(activeSessions.keys())
        }
      });
    }
    
    // Check if QR code exists and is not expired (3 minutes)
    if (qrData.qrCode && qrData.qrGeneratedAt) {
      const qrAge = Date.now() - new Date(qrData.qrGeneratedAt).getTime();
      const isExpired = qrAge > 180000; // 3 minutes
      
      if (isExpired) {
        console.log(`[QR-ENDPOINT] ⚠️ QR code is expired (age: ${Math.round(qrAge/1000)}s)`);
        return res.json({
          success: true,
          sessionId,
          qrCode: null,
          status: 'qr_expired',
          isConnected: qrData.isConnected,
          message: 'QR code expired. Please reconnect.',
          qrGeneratedAt: qrData.qrGeneratedAt
        });
      } else {
        console.log(`[QR-ENDPOINT] ✅ Returning valid QR code (age: ${Math.round(qrAge/1000)}s, status: ${qrData.status})`);
        // IMPORTANT: Return QR code even if status is 'failed' - it might still be scannable
        // The frontend will handle displaying it with appropriate messaging
      }
    }
    
    console.log('[QR-ENDPOINT] 📤 Sending response');
    
    res.json({
      success: true,
      sessionId,
      ...qrData
    });
  } catch (error) {
    console.error('[QR-ENDPOINT] ❌ Error:', error);
    logger.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/whatsapp/status/:sessionId
 * Get detailed session status
 */
router.get('/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const status = getSessionStatus(sessionId);
    
    res.json({
      success: true,
      sessionId,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/whatsapp/send/:sessionId
 * Send WhatsApp message
 */
router.post('/send/:sessionId', validateWhatsAppMessage, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { phoneNumber, message } = req.body;
    
    // Check rate limit
    try {
      await whatsappLimiter.checkLimit(sessionId);
    } catch (rateLimitError) {
      return res.status(429).json({
        success: false,
        error: rateLimitError.message
      });
    }
    
    const result = await sendWhatsAppMessage(sessionId, phoneNumber, message);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/whatsapp/disconnect/:sessionId
 * Disconnect and logout
 */
router.delete('/disconnect/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return res.json({
        success: true,
        message: 'Session not found or already disconnected',
        sessionId
      });
    }
    
    // Clear reconnect timer if exists
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    
    // Logout if connected
    if (session.socket) {
      try {
        if (session.isConnected) {
          await session.socket.logout();
        } else {
          session.socket.end();
        }
        logger.info(`Session ${sessionId} disconnected successfully`);
      } catch (err) {
        logger.warn(`Error during socket cleanup for ${sessionId}:`, err.message);
      }
    }
    
    // Remove from active sessions
    activeSessions.delete(sessionId);
    
    res.json({
      success: true,
      message: 'Session disconnected and cleaned up',
      sessionId
    });
  } catch (error) {
    logger.error('Error disconnecting:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/whatsapp/sessions
 * List all active sessions
 */
router.get('/sessions', (req, res) => {
  try {
    const sessions = Array.from(activeSessions.entries()).map(([id, data]) => ({
      sessionId: id,
      status: data.status,
      isConnected: data.isConnected,
      phoneNumber: data.phoneNumber,
      hasQRCode: !!data.qrCode
    }));
    
    res.json({
      success: true,
      count: sessions.length,
      sessions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
