const API_BASE = 'http://localhost:3001/api';

// Polling interval for QR codes
let qrPollingInterval = null;

// Tab switching
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        // Update buttons
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // Auto-refresh health when switching to health tab
        if (tabName === 'health') {
            checkHealth();
        }
        
        // Stop QR polling when switching away from WhatsApp tab
        if (tabName !== 'whatsapp') {
            stopQRPolling();
        }
    });
});

// Clean up polling when page is closed
window.addEventListener('beforeunload', () => {
    stopQRPolling();
});

// Check server status on load
checkServerStatus();
setInterval(checkServerStatus, 30000); // Check every 30 seconds

async function checkServerStatus() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        
        document.getElementById('serverStatus').textContent = 'Online';
        document.getElementById('serverStatus').className = 'status-value online';
        
        if (data.uptime) {
            const hours = Math.floor(data.uptime / 3600);
            const minutes = Math.floor((data.uptime % 3600) / 60);
            const seconds = Math.floor(data.uptime % 60);
            document.getElementById('serverUptime').textContent = `${hours}h ${minutes}m ${seconds}s`;
        }
    } catch (error) {
        document.getElementById('serverStatus').textContent = 'Offline';
        document.getElementById('serverStatus').className = 'status-value offline';
        document.getElementById('serverUptime').textContent = '-';
    }
}

async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        document.getElementById('health-data').textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        document.getElementById('health-data').textContent = `Error: ${error.message}`;
    }
}

// WhatsApp Functions
async function connectWhatsApp() {
    const sessionId = document.getElementById('sessionId').value || 'default-session';
    const statusDiv = document.getElementById('whatsapp-status');
    const qrContainer = document.getElementById('qr-code-container');
    
    // Stop any existing polling
    if (qrPollingInterval) {
        clearInterval(qrPollingInterval);
        qrPollingInterval = null;
    }
    
    statusDiv.innerHTML = '<div class="info">⏳ Initializing WhatsApp connection...</div>';
    statusDiv.className = 'status-display info';
    qrContainer.innerHTML = '';
    
    try {
        const response = await fetch(`${API_BASE}/whatsapp/connect/${sessionId}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            statusDiv.innerHTML = '<div class="info">⏳ Waiting for QR code...</div>';
            statusDiv.className = 'status-display info';
            
            // Start continuous polling for QR code
            startQRPolling(sessionId);
        } else {
            statusDiv.innerHTML = `<div class="error">❌ Error: ${data.error}</div>`;
            statusDiv.className = 'status-display error';
        }
    } catch (error) {
        statusDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
        statusDiv.className = 'status-display error';
    }
}

// Start polling for QR code
function startQRPolling(sessionId) {
    // Clear any existing interval
    if (qrPollingInterval) {
        clearInterval(qrPollingInterval);
    }
    
    // Reset error counter when starting new polling
    consecutiveErrors = 0;
    
    // Poll every 2 seconds for QR code (slightly longer to reduce server load)
    qrPollingInterval = setInterval(async () => {
        await checkWhatsAppStatus();
    }, 2000);
    
    // Also check immediately
    checkWhatsAppStatus();
}

// Stop QR polling
function stopQRPolling() {
    if (qrPollingInterval) {
        clearInterval(qrPollingInterval);
        qrPollingInterval = null;
    }
}

// Track consecutive errors to avoid showing error on every failed poll
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

async function checkWhatsAppStatus() {
    const sessionId = document.getElementById('sessionId').value || 'default-session';
    const statusDiv = document.getElementById('whatsapp-status');
    const qrContainer = document.getElementById('qr-code-container');
    
    try {
        // Use the new QR endpoint
        const response = await fetch(`${API_BASE}/whatsapp/qr/${sessionId}`);
        
        // Reset error counter on successful request
        consecutiveErrors = 0;
        
        if (!response.ok) {
            // If 404, session doesn't exist - stop polling
            if (response.status === 404) {
                stopQRPolling();
                statusDiv.innerHTML = '<div class="error">❌ Session not found. Please click "Connect" first.</div>';
                statusDiv.className = 'status-display error';
                qrContainer.innerHTML = '';
            }
            return;
        }
        
        const data = await response.json();
        
        if (!data.success) {
            // If session not found, stop polling
            if (data.error && (data.error.includes('not found') || data.error.includes('not initialized'))) {
                stopQRPolling();
                statusDiv.innerHTML = `<div class="error">❌ Error: ${data.error}</div>`;
                statusDiv.className = 'status-display error';
                qrContainer.innerHTML = '';
            }
            return;
        }
        
        // Check if connected
        if (data.isConnected) {
            // Stop polling when connected
            stopQRPolling();
            statusDiv.innerHTML = '<div class="success">✅ WhatsApp is connected!</div>';
            statusDiv.className = 'status-display success';
            qrContainer.innerHTML = '';
            if (data.phoneNumber) {
                statusDiv.innerHTML += `<div style="margin-top: 10px; font-size: 1.1em;">📱 Phone: <strong>${data.phoneNumber}</strong></div>`;
            }
        } 
        // Check if QR code is available (even if status is 'failed' - QR might still be valid)
        else if (data.qrCode && data.qrCode.length > 0) {
            // Clear any error messages when QR is available
            if (statusDiv.classList.contains('error')) {
                statusDiv.className = 'status-display info';
            }
            
            const statusMsg = data.status === 'failed' 
                ? '⚠️ Connection error, but QR code is still valid. Scan quickly!' 
                : '📱 Scan QR code with WhatsApp to connect';
            
            statusDiv.innerHTML = `<div class="info">${statusMsg}</div>`;
            statusDiv.className = 'status-display info';
            
            // Only update QR code if it's different (to avoid flickering)
            const currentQR = qrContainer.querySelector('img');
            const qrData = data.qrCode;
            
            if (!currentQR || currentQR.dataset.qr !== qrData) {
                console.log('Displaying QR code:', qrData.substring(0, 50) + '...');
                qrContainer.innerHTML = `
                    <p style="font-weight: 600; margin-bottom: 15px; color: #333;">📱 Scan this QR code:</p>
                    <p style="font-size: 0.85em; color: #666; margin-bottom: 15px;">
                        <strong>Instructions:</strong><br>
                        1. Open WhatsApp on your phone<br>
                        2. Go to Settings → Linked Devices<br>
                        3. Tap "Link a Device"<br>
                        4. Scan the QR code below
                    </p>
                    <div style="background: white; padding: 20px; display: inline-block; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}" 
                             alt="QR Code" 
                             data-qr="${qrData}"
                             style="display: block;"
                             onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'300\'%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EQR Code Error%3C/text%3E%3C/svg%3E';">
                    </div>
                    <p style="font-size: 0.75em; color: #999; margin-top: 15px;">
                        Status: ${data.status || 'Waiting for scan'} | 
                        Generated: ${data.qrGeneratedAt ? new Date(data.qrGeneratedAt).toLocaleTimeString() : 'Just now'}
                    </p>
                `;
            }
        } 
        // Still connecting/generating QR
        else {
            const statusMsg = data.status === 'connecting' 
                ? '⏳ Connecting to WhatsApp...' 
                : data.status === 'qr_pending' 
                    ? '⏳ Generating QR code... Please wait...' 
                : data.status === 'reconnecting'
                    ? '⏳ Reconnecting...'
                : data.status === 'failed'
                    ? '⚠️ Connection failed. Retrying...'
                    : '⏳ Waiting for connection...';
            
            statusDiv.innerHTML = `<div class="info">${statusMsg}</div>`;
            statusDiv.className = 'status-display info';
            
            // Show status but don't clear QR if we had one
            if (!qrContainer.querySelector('img')) {
                qrContainer.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('Status check error:', error);
        consecutiveErrors++;
        
        // Only show error after multiple consecutive failures
        // This prevents showing error on transient network issues
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            // Only show error if we don't already have a QR code displayed
            if (!qrContainer.querySelector('img')) {
                stopQRPolling();
                statusDiv.innerHTML = '<div class="error">❌ Cannot reach server. Is it running?</div>';
                statusDiv.className = 'status-display error';
            } else {
                // If QR is already displayed, just log the error but don't show it
                console.warn('Network error but QR code is still displayed. Continuing polling...');
            }
        }
    }
}

async function sendWhatsAppMessage() {
    const sessionId = document.getElementById('sessionId').value || 'default-session';
    const phoneNumber = document.getElementById('phoneNumber').value;
    const message = document.getElementById('whatsappMessage').value;
    const resultDiv = document.getElementById('whatsapp-result');
    
    if (!phoneNumber || !message) {
        resultDiv.innerHTML = '<div class="error">Please fill in phone number and message</div>';
        resultDiv.className = 'result-display error';
        return;
    }
    
    resultDiv.innerHTML = '<div class="info">Sending message...</div>';
    resultDiv.className = 'result-display info';
    
    try {
        const response = await fetch(`${API_BASE}/whatsapp/send/${sessionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phoneNumber,
                message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.innerHTML = `<div class="success">✅ Message sent successfully!<br>Message ID: ${data.messageId}</div>`;
            resultDiv.className = 'result-display success';
            document.getElementById('whatsappMessage').value = '';
        } else {
            resultDiv.innerHTML = `<div class="error">❌ Error: ${data.error || 'Failed to send message'}</div>`;
            resultDiv.className = 'result-display error';
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
        resultDiv.className = 'result-display error';
    }
}

async function disconnectWhatsApp() {
    const sessionId = document.getElementById('sessionId').value || 'default-session';
    const statusDiv = document.getElementById('whatsapp-status');
    
    // Stop polling
    stopQRPolling();
    
    statusDiv.innerHTML = '<div class="info">⏳ Disconnecting...</div>';
    statusDiv.className = 'status-display info';
    
    try {
        const response = await fetch(`${API_BASE}/whatsapp/disconnect/${sessionId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            statusDiv.innerHTML = '<div class="success">✅ Disconnected successfully</div>';
            statusDiv.className = 'status-display success';
            document.getElementById('qr-code-container').innerHTML = '';
        } else {
            statusDiv.innerHTML = `<div class="error">❌ Error: ${data.error}</div>`;
            statusDiv.className = 'status-display error';
        }
    } catch (error) {
        statusDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
        statusDiv.className = 'status-display error';
    }
}

// Email Functions
async function sendEmail() {
    const to = document.getElementById('emailTo').value;
    const subject = document.getElementById('emailSubject').value;
    const text = document.getElementById('emailText').value;
    const html = document.getElementById('emailHtml').value;
    const cc = document.getElementById('emailCc').value;
    const bcc = document.getElementById('emailBcc').value;
    const resultDiv = document.getElementById('email-result');
    
    if (!to || !subject || (!text && !html)) {
        resultDiv.innerHTML = '<div class="error">Please fill in required fields (To, Subject, and at least Text or HTML)</div>';
        resultDiv.className = 'result-display error';
        return;
    }
    
    resultDiv.innerHTML = '<div class="info">Sending email...</div>';
    resultDiv.className = 'result-display info';
    
    try {
        const body = { to, subject };
        if (text) body.text = text;
        if (html) body.html = html;
        if (cc) body.cc = cc;
        if (bcc) body.bcc = bcc;
        
        const response = await fetch(`${API_BASE}/email/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.innerHTML = `<div class="success">✅ Email sent successfully!<br>Message ID: ${data.messageId}</div>`;
            resultDiv.className = 'result-display success';
            // Clear form
            document.getElementById('emailTo').value = '';
            document.getElementById('emailSubject').value = '';
            document.getElementById('emailText').value = '';
            document.getElementById('emailHtml').value = '';
            document.getElementById('emailCc').value = '';
            document.getElementById('emailBcc').value = '';
        } else {
            resultDiv.innerHTML = `<div class="error">❌ Error: ${data.error || 'Failed to send email'}</div>`;
            resultDiv.className = 'result-display error';
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
        resultDiv.className = 'result-display error';
    }
}

async function sendTestEmail() {
    const resultDiv = document.getElementById('email-result');
    
    resultDiv.innerHTML = '<div class="info">Sending test email...</div>';
    resultDiv.className = 'result-display info';
    
    try {
        const response = await fetch(`${API_BASE}/email/test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.innerHTML = `<div class="success">✅ Test email sent successfully!<br>Message ID: ${data.messageId}</div>`;
            resultDiv.className = 'result-display success';
        } else {
            resultDiv.innerHTML = `<div class="error">❌ Error: ${data.error || 'Failed to send test email'}</div>`;
            resultDiv.className = 'result-display error';
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
        resultDiv.className = 'result-display error';
    }
}
