# WhatsApp & Email Messenger API

A comprehensive Node.js REST API for sending WhatsApp messages and emails. Built with Express, Baileys (WhatsApp Web API), and Nodemailer, this application provides a unified interface for messaging across multiple platforms.

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage & API Documentation](#-usage--api-documentation)
- [Project Structure](#-project-structure)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

## ✨ Features

- **WhatsApp Messaging**
  - Send text messages via WhatsApp Web API
  - QR code authentication for easy setup
  - Session management for multiple WhatsApp accounts
  - **Intelligent auto-reconnection** on network issues (handles 515, 428, 503 errors)
  - **QR code preservation** - QR codes remain stable during connection attempts
  - **Connection lifecycle management** - Handles all disconnect scenarios gracefully
  - Rate limiting (30 messages per minute per session)
  - **Connection status tracking** - Real-time status updates (connecting, qr_pending, connected, disconnected)

- **Email Sending**
  - Send emails via SMTP (supports Gmail, Outlook, and other providers)
  - Support for plain text and HTML emails
  - CC and BCC recipients
  - Rate limiting (50 emails per hour per recipient)
  - Test email endpoint for configuration verification

- **Additional Features**
  - RESTful API design
  - Comprehensive error handling
  - Structured logging with timestamps
  - Health check endpoint
  - CORS enabled for development

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **WhatsApp**: [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)
- **Email**: [Nodemailer](https://nodemailer.com/)
- **Logging**: Custom logger utility
- **Other**: dotenv, CORS, qrcode-terminal, pino

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 20.0.0 or higher) ⚠️ **Required**
  - Check your version: `node --version`
  - **Current requirement**: Node.js >= 20.0.0 (Baileys requires Node.js 20+)
  - Download from [nodejs.org](https://nodejs.org/) if needed
  - **Note**: Node.js 18.x is not supported due to Baileys dependencies
- **npm** (version 9.0.0 or higher, comes with Node.js)
  - Check your version: `npm --version`
- A Gmail account (or other SMTP provider) for email functionality
- A WhatsApp account for WhatsApp messaging

### ⚠️ Node.js Version Issue?

If you see errors about Node.js version:
- **Upgrade Node.js**: Download and install Node.js 20.x or higher from [nodejs.org](https://nodejs.org/)
- **Using nvm?**: Run `nvm install 20` then `nvm use 20`
- **Verify installation**: Run `node --version` to confirm you have Node.js 20+

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd whatsapp-email-messenger
```

### 2. Install Dependencies

   ```bash
   cd backend
   npm install
   ```

### 3. Configure Environment Variables

Create a `.env` file in the `backend` directory:

   ```bash
   cp .env.example .env
   ```
   
Edit the `.env` file with your configuration (see [Configuration](#-configuration) section below).

### 4. Start the Server

   ```bash
   npm start
   ```

The server will start on port 3001 (or the port specified in your `.env` file).

You should see:
```
[timestamp] [INFO] Server running on port 3001
[timestamp] [INFO] WhatsApp API: http://localhost:3001/api/whatsapp
[timestamp] [INFO] Email API: http://localhost:3001/api/email
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# SMTP Configuration (for Email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# WhatsApp Session Path (optional, defaults to ./auth_sessions)
WHATSAPP_SESSION_PATH=./auth_sessions
```

### Getting a Gmail App Password

To use Gmail for sending emails, you need to create an App Password:

1. **Enable 2-Step Verification** on your Google Account
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification if not already enabled

2. **Generate App Password**
   - Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" and "Other (Custom name)"
   - Enter "WhatsApp-Email Messenger" as the name
   - Click "Generate"
   - Copy the 16-character password (no spaces)

3. **Add to .env**
   ```env
   SMTP_PASS=your-16-character-app-password
   ```

**Note**: Use the App Password, NOT your regular Gmail password.

### Setting Up WhatsApp Session

1. **Start the server** (if not already running)

2. **Initialize a WhatsApp session** by calling the connect endpoint:
   ```bash
   curl -X POST http://localhost:3001/api/whatsapp/connect/my-session-id
   ```

3. **Get the QR code** using the dedicated QR endpoint:
   ```bash
   curl http://localhost:3001/api/whatsapp/qr/my-session-id
   ```
   
   Or use the frontend at `http://localhost:3001` - the QR code will appear automatically.

4. **Scan the QR code** with your WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices
   - Tap "Link a Device"
   - Scan the QR code displayed in the terminal or frontend

5. **Wait for connection** - After scanning:
   - The system detects the QR scan automatically
   - Reconnects in 2 seconds to complete authentication
   - Connection status changes to `connected`

6. **Verify connection** by checking status:
   ```bash
   curl http://localhost:3001/api/whatsapp/status/my-session-id
   ```
   Response should show `"connected": true`

**Important Notes**:
- QR codes are valid for 3 minutes
- QR codes remain stable during connection attempts (won't change while you're scanning)
- The session will be saved automatically and you won't need to scan the QR code again unless you log out
- If connection fails after scanning, the system will automatically attempt to reconnect

## 📚 Usage & API Documentation

### Base URL

All API endpoints are prefixed with `/api`:

- **WhatsApp API**: `http://localhost:3001/api/whatsapp`
- **Email API**: `http://localhost:3001/api/email`
- **Health Check**: `http://localhost:3001/api/health`

### Health Check

Check if the server is running.

**Endpoint**: `GET /api/health`

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**cURL Example**:
```bash
curl http://localhost:3001/api/health
```

---

### WhatsApp API

#### 1. Connect WhatsApp Session

Initialize a WhatsApp connection for a session. This will generate a QR code for authentication.

**Endpoint**: `POST /api/whatsapp/connect/:sessionId`

**Parameters**:
- `sessionId` (path parameter): Unique identifier for the session (e.g., "user-123", "bot-1")

**Response**:
```json
{
  "success": true,
  "message": "Initializing WhatsApp connection",
  "sessionId": "user-123"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3001/api/whatsapp/connect/user-123
```

#### 2. Get Session Status

Check the connection status and get basic session information.

**Endpoint**: `GET /api/whatsapp/status/:sessionId`

**Parameters**:
- `sessionId` (path parameter): Session identifier

**Response (Connected)**:
```json
{
  "connected": true,
  "status": "connected",
  "phoneNumber": "1234567890",
  "qrCode": null
}
```

**Response (Not Connected)**:
```json
{
  "connected": false,
  "status": "qr_pending",
  "phoneNumber": null,
  "qrCode": null
}
```

**cURL Example**:
```bash
curl http://localhost:3001/api/whatsapp/status/user-123
```

#### 2a. Get QR Code (Dedicated Endpoint)

Get the QR code for a session. This endpoint is optimized for QR code retrieval and includes expiration information.

**Endpoint**: `GET /api/whatsapp/qr/:sessionId`

**Parameters**:
- `sessionId` (path parameter): Session identifier

**Response (QR Available)**:
```json
{
  "success": true,
  "qrCode": "2@e7VnNAijMlBefgUFxAvQQmnc5/iVscnjKemuKrhHQwrSEHbk...",
  "status": "qr_pending",
  "isConnected": false,
  "expiresIn": 180
}
```

**Response (No QR)**:
```json
{
  "success": false,
  "qrCode": null,
  "status": "connecting",
  "message": "QR code not available yet"
}
```

**cURL Example**:
```bash
curl http://localhost:3001/api/whatsapp/qr/user-123
```

**Note**: Use this endpoint for frontend QR code display. It includes expiration information and handles QR code lifecycle.

#### 3. Send WhatsApp Message

Send a text message via WhatsApp.

**Endpoint**: `POST /api/whatsapp/send/:sessionId`

**Parameters**:
- `sessionId` (path parameter): Session identifier

**Request Body**:
```json
{
  "phoneNumber": "1234567890",
  "message": "Hello, this is a test message!"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "messageId": "3EB0123456789ABCDEF",
  "jid": "1234567890@s.whatsapp.net"
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "WhatsApp not connected for this session"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3001/api/whatsapp/send/user-123 \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "1234567890",
    "message": "Hello from WhatsApp API!"
  }'
```

**Note**: 
- Phone numbers should include country code without the `+` sign
- Rate limit: 30 messages per minute per session
- Returns 429 status if rate limit exceeded

#### 4. Disconnect Session

Logout and remove a WhatsApp session.

**Endpoint**: `DELETE /api/whatsapp/disconnect/:sessionId`

**Parameters**:
- `sessionId` (path parameter): Session identifier

**Response**:
```json
{
  "success": true,
  "message": "Session disconnected"
}
```

**cURL Example**:
```bash
curl -X DELETE http://localhost:3001/api/whatsapp/disconnect/user-123
```

---

### Email API

#### 1. Send Email

Send an email via SMTP.

**Endpoint**: `POST /api/email/send`

**Request Body**:
```json
{
  "to": "recipient@example.com",
  "subject": "Test Email",
  "text": "This is a plain text email",
  "html": "<h1>This is an HTML email</h1>",
  "cc": "cc@example.com",
  "bcc": "bcc@example.com"
}
```

**Fields**:
- `to` (required): Recipient email address
- `subject` (required): Email subject
- `text` (optional): Plain text email body
- `html` (optional): HTML email body (falls back to `text` if not provided)
- `cc` (optional): CC recipient(s)
- `bcc` (optional): BCC recipient(s)

**Response (Success)**:
```json
{
  "success": true,
  "messageId": "<message-id@mail.gmail.com>",
  "response": "250 2.0.0 OK"
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "SMTP credentials are missing"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3001/api/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "subject": "Hello from API",
    "text": "This is a test email sent from the WhatsApp-Email Messenger API",
    "html": "<h1>Hello!</h1><p>This is a test email.</p>"
  }'
```

**Note**: 
- Rate limit: 50 emails per hour per recipient
- Returns 429 status if rate limit exceeded

#### 2. Send Test Email

Send a test email to your configured SMTP_USER address.

**Endpoint**: `POST /api/email/test`

**Response (Success)**:
```json
{
  "success": true,
  "message": "Test email sent successfully",
  "messageId": "<message-id@mail.gmail.com>"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3001/api/email/test
```

---

## 🔄 Connection Lifecycle & Disconnection Scenarios

### Connection States

The WhatsApp connection goes through these states:

1. **`connecting`** - Initial connection attempt, waiting for QR code
2. **`qr_pending`** - QR code generated, waiting for user to scan
3. **`authenticating`** - QR code scanned, credentials saved, reconnecting to complete auth
4. **`connected`** - Successfully connected and ready to send messages
5. **`reconnecting`** - Connection lost, attempting to reconnect
6. **`disconnected`** - User logged out (401), requires new QR scan
7. **`failed`** - Fatal error, cannot reconnect automatically

### Disconnection Scenarios

The system handles various disconnection scenarios:

#### ✅ Auto-Reconnect (Recoverable Errors)
- **Status 515** (Stream Error) - Most common, auto-reconnects in 2-3 seconds
- **Status 428** (Precondition Required) - Auto-reconnects in 3 seconds
- **Status 503** (Restart Required) - Normal after QR scan, auto-reconnects

#### ❌ No Auto-Reconnect (Fatal Errors)
- **Status 401** (Logged Out) - User logged out from phone, requires new QR scan
- **Status 403** (Forbidden) - Account banned/restricted
- **Status 404** (Not Found) - Session not found, requires new QR scan
- **Status 408** (Timeout) - Network timeout, may need manual reconnect
- **Status 500** (Bad Session) - Credentials corrupted, requires new QR scan

### How It Works

1. **QR Code Generation**: 
   - QR code is generated and stored
   - QR code remains stable even if connection errors occur (515 errors)
   - QR code expires after 3 minutes

2. **After QR Scan**:
   - System detects credentials saved (`creds.update` event)
   - Connection may close temporarily (normal behavior)
   - System automatically reconnects in 2 seconds using saved credentials
   - Connection completes and status becomes `connected`

3. **During Normal Operation**:
   - If connection drops with recoverable error (515, 428, 503), auto-reconnects
   - Credentials are preserved
   - No user action required

4. **On Logout (401)**:
   - Session is deleted
   - Credentials are cleared
   - User must scan QR code again

For detailed information about all disconnect scenarios, see [DISCONNECTION_SCENARIOS.md](./DISCONNECTION_SCENARIOS.md).

## 📁 Project Structure

```
whatsapp-email-messenger/
├── backend/
│   ├── src/
│   │   ├── routes/           # API route handlers
│   │   │   ├── whatsapp.js   # WhatsApp endpoints
│   │   │   └── email.js      # Email endpoints
│   │   ├── services/         # Business logic
│   │   │   ├── whatsappService.js  # WhatsApp service
│   │   │   └── emailService.js     # Email service
│   │   ├── utils/            # Utility functions
│   │   │   ├── logger.js     # Logging utility
│   │   │   └── rateLimiter.js # Rate limiting
│   │   ├── middleware/       # Express middleware
│   │   │   ├── errorHandler.js    # Error handling
│   │   │   └── validation.js      # Request validation
│   │   └── config/           # Configuration files
│   ├── auth_sessions/        # WhatsApp authentication sessions
│   ├── .env                  # Environment variables (create this)
│   ├── .env.example          # Environment variables template
│   ├── package.json          # Dependencies and scripts
│   └── server.js             # Application entry point
├── frontend/                  # Frontend testing interface
│   ├── index.html            # Main interface
│   ├── app.js                # Frontend JavaScript
│   └── styles.css           # Styling
├── DISCONNECTION_SCENARIOS.md  # Detailed disconnect scenarios
└── README.md                 # This file
```

## 🔧 Troubleshooting

### WhatsApp Issues

**Problem**: QR code not appearing
- **Solution**: 
  - Check the terminal output for QR code (it's displayed in ASCII art)
  - Use the dedicated QR endpoint: `GET /api/whatsapp/qr/:sessionId`
  - Use the frontend at `http://localhost:3001` - QR code appears automatically
  - Ensure the server is running and the session ID is correct
  - Wait a few seconds after connecting - QR code generation takes 5-10 seconds

**Problem**: QR code keeps changing before I can scan it
- **Solution**: 
  - This has been fixed! QR codes now remain stable during connection attempts
  - If you see a 515 error, the QR code will be preserved
  - QR codes are valid for 3 minutes
  - If the QR expires, a new one will be generated automatically

**Problem**: "WhatsApp not connected for this session"
- **Solution**: 
  1. Check session status: `GET /api/whatsapp/status/:sessionId`
  2. If status is `qr_pending`, scan the QR code using `GET /api/whatsapp/qr/:sessionId`
  3. After scanning, wait 2-3 seconds for automatic reconnection
  4. Check status again - should show `connected: true`

**Problem**: Connection disconnects after scanning QR code
- **Solution**: 
  - This is normal! After scanning, the connection closes temporarily
  - The system automatically detects the QR scan and reconnects in 2 seconds
  - Wait a few seconds and check status again
  - If it doesn't reconnect, check the backend logs for error details

**Problem**: Session keeps disconnecting
- **Solution**: 
  - Check your internet connection
  - Ensure WhatsApp is not logged out on your phone
  - The app automatically attempts to reconnect for recoverable errors (515, 428, 503)
  - Check the disconnect reason in backend logs
  - See [Disconnection Scenarios](#connection-lifecycle--disconnection-scenarios) below

**Problem**: "Rate limit exceeded"
- **Solution**: Wait for the specified time (shown in error message) before sending more messages
- Current limit: 30 messages per minute per session

**Problem**: "crypto is not defined" error
- **Solution**: 
  - This has been fixed with a crypto polyfill
  - Ensure you're using Node.js 18.19.1+ (or Node.js 20+ recommended)
  - The system automatically handles crypto module initialization
  - If you still see this error, restart the server

**Problem**: Connection status shows "connecting" but never connects
- **Solution**:
  - Check network connectivity to WhatsApp servers
  - Verify firewall/proxy settings aren't blocking WhatsApp
  - Check backend logs for detailed error messages
  - Try deleting the session folder and reconnecting: `rm -rf backend/auth_sessions/your-session-id`

### Email Issues

**Problem**: "SMTP credentials are missing"
- **Solution**: 
  - Ensure `.env` file exists in the `backend` directory
  - Check that `SMTP_USER` and `SMTP_PASS` are set
  - For Gmail, use an App Password, not your regular password

**Problem**: "Authentication failed"
- **Solution**: 
  - Verify your Gmail App Password is correct
  - Ensure 2-Step Verification is enabled
  - Check that `SMTP_HOST` is set to `smtp.gmail.com` and `SMTP_PORT` is `587`

**Problem**: "Connection timeout"
- **Solution**: 
  - Check your internet connection
  - Verify SMTP host and port are correct
  - Some networks block SMTP ports - try a different network or use a VPN

**Problem**: "Rate limit exceeded"
- **Solution**: Wait before sending more emails
- Current limit: 50 emails per hour per recipient

### General Issues

**Problem**: "This package requires Node.js 20+ to run reliably" or "Unsupported engine"
- **Solution**: 
  - **You need Node.js 20.0.0 or higher** (Baileys requires Node.js 20+)
  - Check your current version: `node --version`
  - **Upgrade Node.js**:
    - Download Node.js 20.x LTS from [nodejs.org](https://nodejs.org/)
    - Install the new version (it will replace the old one)
    - Restart your terminal/command prompt
    - Verify: `node --version` should show v20.x.x or higher
  - **Using nvm (Node Version Manager)?**
    - Run: `nvm install 20` then `nvm use 20`
  - After upgrading, delete `node_modules` and run `npm install` again

**Problem**: Server won't start
- **Solution**: 
  - Check if port 3001 is already in use
  - Verify Node.js version: `node --version` (should be 20.0.0 or higher)
  - Ensure all dependencies are installed: `npm install`

**Problem**: "Module not found" errors
- **Solution**: 
  - Run `npm install` in the `backend` directory
  - Check that you're running commands from the correct directory

**Problem**: CORS errors
- **Solution**: 
  - CORS is configured to allow all origins in development
  - For production, update CORS configuration in `server.js`

**Problem**: Connection shows "qr_pending" but QR code is not visible
- **Solution**:
  - Use the frontend at `http://localhost:3001` for automatic QR display
  - Or use `GET /api/whatsapp/qr/:sessionId` endpoint
  - Check browser console for errors
  - Ensure QR code library is loaded (qrcode.min.js)

**Problem**: "Cannot reach server" error in frontend
- **Solution**:
  - This error only appears after 3 consecutive failed requests
  - Check if backend server is running: `npm start` in backend directory
  - Verify server is on port 3001
  - Check browser console for network errors
  - Ensure CORS is enabled (it is by default)

## 📄 License

ISC License

Copyright (c) 2024

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📚 Additional Documentation

- **[DISCONNECTION_SCENARIOS.md](./DISCONNECTION_SCENARIOS.md)** - Comprehensive guide to all WhatsApp disconnection scenarios, status codes, and handling logic

## 🔍 Understanding Connection Behavior

### QR Code Lifecycle

1. **Generation**: QR code is generated when you call `/connect/:sessionId`
2. **Preservation**: QR code remains stable even during connection errors (515)
3. **Expiration**: QR codes expire after 3 minutes
4. **After Scan**: System detects scan and automatically reconnects

### Automatic Reconnection

The system automatically reconnects for:
- **Stream Errors (515)**: Most common, happens during normal operation
- **Precondition Errors (428)**: Temporary connection issues
- **Restart Required (503)**: Normal after QR scan

Reconnection preserves your credentials, so you don't need to scan QR again.

### Manual Reconnection Required

You must manually reconnect (scan QR again) for:
- **Logged Out (401)**: You logged out from your phone
- **Account Banned (403)**: Account restricted by WhatsApp
- **Session Not Found (404)**: Session invalidated
- **Bad Session (500)**: Credentials corrupted

## 📞 Support

For issues and questions:
- Check the [Troubleshooting](#-troubleshooting) section above
- Review [DISCONNECTION_SCENARIOS.md](./DISCONNECTION_SCENARIOS.md) for connection issues
- Check backend logs for detailed error messages
- Open an issue on the repository

---

**Happy Messaging! 🚀**
