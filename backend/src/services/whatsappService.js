const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // Explicitly require crypto module
const logger = require('../utils/logger');

// CRITICAL FIX: Ensure crypto is available globally and in all contexts
// This fixes "crypto is not defined" errors in Baileys
// Node.js 18+ has webcrypto, but Baileys might need it in global scope
if (typeof globalThis.crypto === 'undefined') {
  // Use Node.js built-in webcrypto if available (Node 18+)
  if (crypto.webcrypto) {
    globalThis.crypto = crypto.webcrypto;
  } else {
    // Fallback polyfill
    globalThis.crypto = {
      getRandomValues: (arr) => {
        const bytes = crypto.randomBytes(arr.length);
        for (let i = 0; i < arr.length; i++) {
          arr[i] = bytes[i];
        }
        return arr;
      },
      subtle: null,
      randomUUID: crypto.randomUUID || (() => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = crypto.randomBytes(1)[0] % 16;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      })
    };
  }
}

// Also ensure it's available in global scope (for older code)
if (typeof global.crypto === 'undefined') {
  global.crypto = globalThis.crypto;
}

// Verify crypto is available
console.log('[BAILEYS] Crypto module loaded:', typeof crypto !== 'undefined');
console.log('[BAILEYS] Global crypto available:', typeof globalThis.crypto !== 'undefined');
console.log('[BAILEYS] WebCrypto available:', typeof crypto.webcrypto !== 'undefined');

const activeSessions = new Map();

/**
 * Initialize WhatsApp connection for a session
 */
async function initializeWhatsApp(sessionId) {
  try {
    // Check if session already exists
    if (activeSessions.has(sessionId)) {
      const existingSession = activeSessions.get(sessionId);
      if (existingSession.isConnected) {
        logger.info(`Session ${sessionId} already connected`);
        return existingSession;
      }
      
      // CRITICAL: If session has a valid QR code that hasn't been scanned, DON'T delete it!
      // BUT: If QR was scanned, we MUST reconnect to complete authentication
      if (existingSession.qrCode && existingSession.qrGeneratedAt && !existingSession.qrScanned) {
        const qrAge = Date.now() - new Date(existingSession.qrGeneratedAt).getTime();
        const isExpired = qrAge > 180000; // 3 minutes
        
        if (!isExpired) {
          console.log(`[BAILEYS] ⚠️ Session has valid QR code (${Math.round(qrAge/1000)}s old) - NOT scanned yet`);
          console.log('[BAILEYS] ⏸️ NOT reinitializing - keeping existing QR code for user to scan');
          console.log('[BAILEYS] ✅ Returning existing session with QR code');
          return existingSession;
        } else {
          console.log(`[BAILEYS] ⚠️ QR code expired (${Math.round(qrAge/1000)}s old) - will reinitialize`);
        }
      } else if (existingSession.qrScanned) {
        console.log('[BAILEYS] ✅ QR code was scanned - will reconnect to complete authentication');
        // Continue with reinitialization to complete authentication
      }
      
      // If session exists but not connected and no valid QR, clean it up first
      if (existingSession.socket) {
        try {
          existingSession.socket.end();
        } catch (e) {
          // Ignore errors when ending socket
        }
      }
      activeSessions.delete(sessionId);
    }

    // TASK 1: Check if we should delete credentials
    // DON'T delete if we're reconnecting after QR scan (credentials are valid)
    const sessionPath = path.join(__dirname, '../../auth_sessions', sessionId);
    
    console.log('[BAILEYS] 🗑️ Checking for old credentials...');
    console.log('[BAILEYS] Session path:', sessionPath);
    
    // Check if credentials exist and are valid (reconnecting after QR scan)
    const hasValidCredentials = fs.existsSync(sessionPath) && 
                                 fs.existsSync(path.join(sessionPath, 'creds.json'));
    
    if (hasValidCredentials) {
      console.log('[BAILEYS] ✅ Found existing credentials - will use them (reconnecting after QR scan)');
      // Don't delete - these are valid credentials from QR scan
    } else if (fs.existsSync(sessionPath)) {
      // Old/invalid credentials - delete to force fresh QR
      console.log('[BAILEYS] ⚠️ Found old/invalid credentials - DELETING to force fresh QR');
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('[BAILEYS] ✅ Old credentials deleted successfully');
      } catch (deleteError) {
        console.error('[BAILEYS] ❌ Error deleting old credentials:', deleteError);
        // Try to continue anyway
      }
    } else {
      console.log('[BAILEYS] ✅ No old credentials found - clean start');
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
      console.log('[BAILEYS] 📁 Created auth_sessions directory');
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    
    const pinoLogger = pino({ level: 'silent' });

    // Initialize session data BEFORE creating socket
    const sessionData = {
      socket: null, // Will be set after socket creation
      state,
      saveCreds,
      isConnected: false,
      qrCode: null,
      qrGeneratedAt: null,
      qrScanned: false,  // Track if QR code has been scanned
      phoneNumber: null,
      status: 'connecting',  // connecting | qr_pending | connected | disconnected
      reconnectTimer: null
    };

    // TASK 4: Check Network/Firewall connectivity to WhatsApp
    console.log('[BAILEYS] 🌐 Testing network connectivity to WhatsApp servers...');
    try {
      const https = require('https');
      await new Promise((resolve, reject) => {
        const req = https.get('https://web.whatsapp.com', { timeout: 5000 }, (res) => {
          console.log('[BAILEYS] ✅ WhatsApp servers reachable (status:', res.statusCode, ')');
          resolve();
        });
        req.on('error', (err) => {
          console.error('[BAILEYS] ❌ Cannot reach WhatsApp servers:', err.message);
          reject(err);
        });
        req.on('timeout', () => {
          console.error('[BAILEYS] ❌ Timeout connecting to WhatsApp servers');
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
    } catch (netError) {
      console.error('[BAILEYS] ❌ Network check failed:', netError.message);
      throw new Error('Cannot reach WhatsApp servers. Check firewall/proxy/network.');
    }

    // Create socket with error handling and crypto verification
    console.log('[BAILEYS] 🔧 Creating socket with Baileys...');
    console.log('[BAILEYS] Crypto module available:', typeof crypto !== 'undefined');
    console.log('[BAILEYS] Global crypto available:', typeof globalThis.crypto !== 'undefined');
    console.log('[BAILEYS] Node.js version:', process.version);
    
    let socket;
    try {
      socket = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pinoLogger)
        },
        printQRInTerminal: true,  // Keep this for terminal display
        browser: ['WhatsApp Messenger', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        getMessage: async () => undefined,
        logger: pinoLogger,
        version,
        // Add connection options to help with QR generation
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
      });
      
      // ADD THESE LOGS RIGHT AFTER SOCKET CREATION:
      console.log('[BAILEYS] ✅ Socket created successfully');
      console.log('[BAILEYS] Socket exists:', !!socket);
      console.log('[BAILEYS] Socket has event emitter:', !!socket.ev);
      console.log('[BAILEYS] Socket has WebSocket:', !!socket.ws);
    } catch (socketError) {
      console.error('[BAILEYS] ❌ CRITICAL: Error creating socket:', socketError);
      console.error('[BAILEYS] Error name:', socketError.name);
      console.error('[BAILEYS] Error message:', socketError.message);
      console.error('[BAILEYS] Error stack:', socketError.stack);
      throw new Error(`Failed to create WhatsApp socket: ${socketError.message}. This might be a Baileys/Node.js compatibility issue.`);
    }

    // Set socket in session data
    sessionData.socket = socket;

    // Connection update event handler
    console.log('[BAILEYS] 📡 Registering connection.update event listener...');
    
    socket.ev.on('connection.update', async (update) => {
      try {
        // ADD THIS AS THE FIRST LINE IN THE HANDLER:
        console.log('[BAILEYS] 🔔 connection.update event FIRED!', {
          hasConnection: !!update.connection,
          hasQR: !!update.qr,
          hasLastDisconnect: !!update.lastDisconnect,
          connection: update.connection,
          qrLength: update.qr ? update.qr.length : 0
        });
        
        const { connection, lastDisconnect, qr } = update;

      // QR CODE GENERATION - This is the critical part!
      if (qr) {
        console.log('[BAILEYS] 🎯 QR CODE DETECTED!');
        console.log('[BAILEYS] QR string length:', qr.length);
        console.log('[BAILEYS] QR preview (first 50 chars):', qr.substring(0, 50));
        
        sessionData.qrCode = qr;
        sessionData.qrGeneratedAt = new Date();
        sessionData.status = 'qr_pending';
        
        // Display in terminal
        qrcode.generate(qr, { small: true });
        
        console.log('[BAILEYS] ✅ QR Code stored in sessionData');
        console.log('[BAILEYS] Session ID:', sessionId);
        console.log('[BAILEYS] QR available at: GET /api/whatsapp/qr/' + sessionId);
        
        logger.info(`✅ QR Code generated for session: ${sessionId}`);
        logger.info(`QR Code string length: ${qr.length}`);
        logger.info(`QR Code available at GET /api/whatsapp/qr/${sessionId}`);
      }

      // Connection opened
      if (connection === 'open') {
        // Clear any reconnect timer
        if (sessionData.reconnectTimer) {
          clearTimeout(sessionData.reconnectTimer);
          sessionData.reconnectTimer = null;
        }
        
        sessionData.isConnected = true;
        sessionData.status = 'connected';
        sessionData.qrCode = null; // Clear QR code once connected
        sessionData.phoneNumber = socket.user?.id?.split(':')[0] || null;
        
        logger.info(`✅ WhatsApp connected successfully for session: ${sessionId}`);
        logger.info(`📱 Phone number: ${sessionData.phoneNumber}`);
      }

      // Connection closed
      if (connection === 'close') {
        // TASK 2: Add Detailed Disconnect Reason Logging
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message;
        const errorData = lastDisconnect?.error?.data;
        
        // Enhanced error extraction
        let fullErrorInfo = null;
        try {
          // Try to get more error details
          if (lastDisconnect?.error) {
            fullErrorInfo = {
              message: lastDisconnect.error.message,
              name: lastDisconnect.error.name,
              stack: lastDisconnect.error.stack,
              code: lastDisconnect.error.code,
              output: lastDisconnect.error.output,
              data: lastDisconnect.error.data
            };
          }
        } catch (e) {
          // Ignore serialization errors
        }
        
        console.log('[BAILEYS] ❌ Connection CLOSED!');
        console.log('[BAILEYS] Status Code:', statusCode);
        console.log('[BAILEYS] Error Message:', errorMessage);
        console.log('[BAILEYS] Error Name:', lastDisconnect?.error?.name);
        console.log('[BAILEYS] Error Code:', lastDisconnect?.error?.code);
        console.log('[BAILEYS] Error Stack:', lastDisconnect?.error?.stack);
        console.log('[BAILEYS] Error Data:', JSON.stringify(errorData, null, 2));
        console.log('[BAILEYS] DisconnectReason.loggedOut:', DisconnectReason.loggedOut);
        console.log('[BAILEYS] Full Error Info:', JSON.stringify(fullErrorInfo, null, 2));
        console.log('[BAILEYS] Full lastDisconnect:', JSON.stringify(lastDisconnect, null, 2));
        
        sessionData.isConnected = false;
        
        if (statusCode === DisconnectReason.loggedOut) {
          sessionData.status = 'disconnected';
          
          // Clear reconnect timer
          if (sessionData.reconnectTimer) {
            clearTimeout(sessionData.reconnectTimer);
            sessionData.reconnectTimer = null;
          }
          
          activeSessions.delete(sessionId);
          
          // Clean up session files
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
          
          logger.warn(`❌ Session ${sessionId} logged out. Credentials cleared.`);
        } else {
          // Handle different error codes
          // Status 515 = "Stream Errored (restart required)" - This is recoverable!
          // Status 428 = "Precondition Required" - Usually means connection closed, can retry
          // Status 503 = "Restart Required" - Normal after QR scan, recoverable
          // Other codes might be fatal
          
          if (statusCode === 515 || statusCode === 428 || statusCode === DisconnectReason.restartRequired) {
            const errorName = statusCode === 515 ? 'Stream Error' : 
                              statusCode === 428 ? 'Precondition Required' : 
                              statusCode === DisconnectReason.restartRequired ? 'Restart Required' : 
                              'Unknown';
            console.log(`[BAILEYS] ⚠️ Recoverable error (${statusCode} - ${errorName}) detected`);
            
            // CRITICAL LOGIC:
            // 1. If QR was SCANNED (credentials saved), we MUST reconnect to complete authentication
            // 2. If QR exists but NOT scanned, keep it and wait for user to scan
            // 3. If no QR, safe to reconnect
            
            if (sessionData.qrScanned) {
              // QR was scanned! Reconnect to complete authentication
              console.log('[BAILEYS] 🎉 QR code was scanned - reconnecting to complete authentication...');
              sessionData.status = 'reconnecting';
              
              // Clear QR code since it's been used
              sessionData.qrCode = null;
              sessionData.qrScanned = false;
              
              if (!sessionData.reconnectTimer) {
                console.log(`[BAILEYS] 🔄 Reconnecting in 2 seconds to complete authentication...`);
                sessionData.reconnectTimer = setTimeout(() => {
                  sessionData.reconnectTimer = null;
                  console.log(`[BAILEYS] 🔄 Reconnecting session ${sessionId} after QR scan...`);
                  initializeWhatsApp(sessionId).catch(err => {
                    logger.error(`Failed to reconnect session ${sessionId} after QR scan`, err);
                    sessionData.status = 'failed';
                  });
                }, 2000);
              }
            } else if (sessionData.qrCode) {
              // QR exists but NOT scanned yet - keep it for user to scan
              console.log('[BAILEYS] ✅ QR code exists - KEEPING IT for user to scan');
              console.log('[BAILEYS] ⏸️ NOT auto-reconnecting - waiting for QR scan');
              sessionData.status = 'qr_pending';
              
              // Check if QR code is expired (older than 3 minutes)
              if (sessionData.qrGeneratedAt) {
                const qrAge = Date.now() - new Date(sessionData.qrGeneratedAt).getTime();
                const isExpired = qrAge > 180000; // 3 minutes
                
                if (isExpired) {
                  console.log(`[BAILEYS] ⚠️ QR code expired (${Math.round(qrAge/1000)}s old) - will reconnect`);
                  sessionData.status = 'reconnecting';
                  // Only reconnect if QR is expired
                  if (!sessionData.reconnectTimer) {
                    sessionData.reconnectTimer = setTimeout(() => {
                      sessionData.reconnectTimer = null;
                      console.log(`[BAILEYS] 🔄 Reconnecting due to expired QR code...`);
                      initializeWhatsApp(sessionId).catch(err => {
                        logger.error(`Failed to reconnect session ${sessionId}`, err);
                        sessionData.status = 'failed';
                      });
                    }, 2000);
                  }
                } else {
                  console.log(`[BAILEYS] ✅ QR code still valid (${Math.round(qrAge/1000)}s old) - keep it!`);
                  // Don't reconnect - let user scan the existing QR
                }
              }
            } else {
              // No QR code - safe to reconnect
              console.log('[BAILEYS] ⚠️ No QR code - will attempt reconnect');
              sessionData.status = 'reconnecting';
              
              if (!sessionData.reconnectTimer) {
                console.log(`[BAILEYS] 🔄 Will attempt reconnect in 3 seconds...`);
                
                sessionData.reconnectTimer = setTimeout(() => {
                  sessionData.reconnectTimer = null;
                  console.log(`[BAILEYS] 🔄 Attempting to reconnect session ${sessionId}...`);
                  initializeWhatsApp(sessionId).catch(err => {
                    logger.error(`Failed to reconnect session ${sessionId}`, err);
                    sessionData.status = 'failed';
                  });
                }, 3000);
              }
            }
          } else {
            // For other errors, mark as failed but keep QR code if it exists
            sessionData.status = 'failed';
            console.log(`[BAILEYS] ⛔ Connection failed with status ${statusCode}`);
            console.log('[BAILEYS] QR code will remain available if it exists');
            logger.error(`Connection failed for session ${sessionId} with status ${statusCode}`);
          }
        }
      }
      } catch (eventError) {
        console.error('[BAILEYS] ❌ ERROR in connection.update handler:', eventError);
        console.error('[BAILEYS] Error name:', eventError.name);
        console.error('[BAILEYS] Error message:', eventError.message);
        console.error('[BAILEYS] Error stack:', eventError.stack);
        logger.error(`Error in connection.update handler for session ${sessionId}:`, eventError);
      }
    });

    // Credentials update event - This fires when QR code is scanned!
    socket.ev.on('creds.update', async () => {
      await saveCreds();
      logger.debug(`Credentials updated for session: ${sessionId}`);
      
      // If QR code exists, this means it was just scanned!
      if (sessionData.qrCode) {
        console.log('[BAILEYS] 🎉 QR CODE SCANNED! Credentials saved.');
        sessionData.qrScanned = true;
        sessionData.status = 'authenticating';  // New status: scanning completed, waiting for connection
        console.log('[BAILEYS] ✅ Marked as QR scanned - will allow reconnect to complete authentication');
      }
    });

    // Store in active sessions IMMEDIATELY so it's available for QR polling
    activeSessions.set(sessionId, sessionData);
    
    // ADD THESE VERIFICATION LOGS:
    console.log('[BAILEYS] 📦 Session stored in activeSessions');
    console.log('[BAILEYS] Active sessions count:', activeSessions.size);
    console.log('[BAILEYS] Can retrieve session:', !!activeSessions.get(sessionId));
    console.log('[BAILEYS] Session status:', sessionData.status);
    console.log('[BAILEYS] Waiting for QR code generation...');
    
    logger.info(`Session ${sessionId} initialized and stored. Waiting for QR code...`);

    return sessionData;
  } catch (error) {
    logger.error(`Error initializing WhatsApp for session ${sessionId}`, error);
    throw error;
  }
}

/**
 * Send WhatsApp message
 */
async function sendWhatsAppMessage(sessionId, phoneNumber, message) {
  try {
    const session = activeSessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found. Please initialize first.`);
    }

    if (!session.isConnected) {
      throw new Error('WhatsApp not connected. Please scan QR code first.');
    }

    const digitsOnly = phoneNumber.replace(/\D/g, '');
    const jid = `${digitsOnly}@s.whatsapp.net`;

    const result = await session.socket.sendMessage(jid, { text: message });

    logger.info(`✅ Message sent to ${phoneNumber} from session ${sessionId}`);

    return {
      success: true,
      messageId: result.key.id,
      to: phoneNumber,
      jid: jid
    };
  } catch (error) {
    logger.error(`Error sending message:`, error);
    throw error;
  }
}

/**
 * Get QR code for a session
 */
function getQRCode(sessionId) {
  console.log('[getQRCode] Called for session:', sessionId);
  console.log('[getQRCode] Active sessions:', activeSessions.size);
  
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    console.log('[getQRCode] ❌ Session not found in activeSessions');
    logger.debug(`QR Code request for ${sessionId}: Session not found`);
    return null;
  }
  
  console.log('[getQRCode] ✅ Session found');
  console.log('[getQRCode] Session data:', {
    hasSocket: !!session.socket,
    isConnected: session.isConnected,
    status: session.status,
    hasQR: !!session.qrCode,
    qrLength: session.qrCode ? session.qrCode.length : 0
  });
  
  const result = {
    qrCode: session.qrCode,
    status: session.status,
    isConnected: session.isConnected,
    phoneNumber: session.phoneNumber,
    qrGeneratedAt: session.qrGeneratedAt ? 
      (session.qrGeneratedAt.toISOString ? 
        session.qrGeneratedAt.toISOString() : 
        new Date(session.qrGeneratedAt).toISOString()) : null
  };
  
  // Log for debugging
  if (result.qrCode) {
    console.log('[getQRCode] 📤 Returning QR code (length: ' + result.qrCode.length + ')');
    logger.info(`QR Code request for ${sessionId}: Returning QR`, {
      hasQR: !!result.qrCode,
      status: result.status,
      isConnected: result.isConnected,
      qrLength: result.qrCode ? result.qrCode.length : 0
    });
  } else {
    console.log('[getQRCode] ⏳ No QR code available yet, status:', result.status);
  }
  
  return result;
}

/**
 * Get session status
 */
function getSessionStatus(sessionId) {
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return {
      exists: false,
      status: 'not_initialized'
    };
  }
  
  return {
    exists: true,
    status: session.status,
    isConnected: session.isConnected,
    phoneNumber: session.phoneNumber,
    hasQRCode: !!session.qrCode
  };
}

module.exports = {
  initializeWhatsApp,
  sendWhatsAppMessage,
  getQRCode,
  getSessionStatus,
  activeSessions
};
