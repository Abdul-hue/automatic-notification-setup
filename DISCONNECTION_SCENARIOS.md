# WhatsApp Connection Disconnect Scenarios

This document explains all scenarios where a WhatsApp connection can disconnect after being successfully established, and how the system handles each scenario.

## 📋 Table of Contents
1. [Disconnect Status Codes](#disconnect-status-codes)
2. [Disconnection Scenarios](#disconnection-scenarios)
3. [Current Handling Logic](#current-handling-logic)
4. [Reconnection Behavior](#reconnection-behavior)

---

## 🔢 Disconnect Status Codes

### Baileys DisconnectReason Constants:
- **401 (DisconnectReason.loggedOut)**: User logged out from phone
- **403 (DisconnectReason.forbidden)**: Account banned or restricted
- **404 (DisconnectReason.notFound)**: Session not found
- **408 (DisconnectReason.timedOut)**: Connection timeout
- **428 (DisconnectReason.preconditionRequired)**: Precondition failed, can retry
- **500 (DisconnectReason.badSession)**: Bad session data
- **503 (DisconnectReason.restartRequired)**: Restart required (normal during auth)
- **515 (Stream Error)**: Stream errored, restart required (recoverable)

---

## 🔌 Disconnection Scenarios

### 1. **User Logs Out from Phone** (Status: 401)
**Scenario**: User manually logs out WhatsApp from their phone.

**What Happens**:
- Connection closes with status code `401`
- Credentials are invalidated
- Session is permanently disconnected

**Current Handling**:
```javascript
if (statusCode === DisconnectReason.loggedOut) {
  // Session deleted from activeSessions
  // Credentials folder deleted
  // Status: 'disconnected'
  // NO auto-reconnect
}
```

**Action Required**: User must scan QR code again to reconnect.

---

### 2. **Account Banned/Restricted** (Status: 403)
**Scenario**: WhatsApp has banned or restricted the account.

**What Happens**:
- Connection closes with status code `403`
- Account cannot be used
- All sessions invalidated

**Current Handling**:
- Treated as fatal error
- Status: 'failed'
- NO auto-reconnect

**Action Required**: Contact WhatsApp support or use different account.

---

### 3. **Session Not Found** (Status: 404)
**Scenario**: WhatsApp servers cannot find the session.

**What Happens**:
- Connection closes with status code `404`
- Session credentials may be invalid
- May need to re-authenticate

**Current Handling**:
- Treated as fatal error
- Status: 'failed'
- NO auto-reconnect

**Action Required**: Delete session and scan QR code again.

---

### 4. **Connection Timeout** (Status: 408)
**Scenario**: Network timeout or server didn't respond in time.

**What Happens**:
- Connection closes with status code `408`
- Usually temporary network issue
- Connection may be recoverable

**Current Handling**:
- Treated as fatal error (not in recoverable list)
- Status: 'failed'
- NO auto-reconnect

**Action Required**: Check network connection, may need manual reconnect.

---

### 5. **Precondition Required** (Status: 428)
**Scenario**: Connection closed but can be retried (recoverable).

**What Happens**:
- Connection closes with status code `428`
- Usually temporary issue
- Connection can be restored

**Current Handling**:
```javascript
if (statusCode === 428) {
  // Auto-reconnect after 3 seconds
  // Preserves credentials
  // Status: 'reconnecting'
}
```

**Action Required**: Automatic reconnection (no user action needed).

---

### 6. **Bad Session Data** (Status: 500)
**Scenario**: Session credentials are corrupted or invalid.

**What Happens**:
- Connection closes with status code `500`
- Credentials may need to be regenerated
- Session data is invalid

**Current Handling**:
- Treated as fatal error
- Status: 'failed'
- NO auto-reconnect

**Action Required**: Delete session folder and scan QR code again.

---

### 7. **Restart Required** (Status: 503)
**Scenario**: Normal part of authentication flow, especially after QR scan.

**What Happens**:
- Connection closes with status code `503`
- This is EXPECTED after scanning QR code
- Connection should reconnect automatically

**Current Handling**:
- Should be treated as recoverable
- Currently NOT in recoverable list (needs fix)

**Action Required**: Should auto-reconnect (may need code update).

---

### 8. **Stream Error** (Status: 515)
**Scenario**: Stream errored, restart required (most common recoverable error).

**What Happens**:
- Connection closes with status code `515`
- Very common during normal operation
- Usually temporary network/server issue
- Connection can be restored

**Current Handling**:
```javascript
if (statusCode === 515) {
  if (qrScanned) {
    // Reconnect to complete authentication
    // Status: 'reconnecting'
    // Auto-reconnect after 2 seconds
  } else if (qrCode exists) {
    // Keep QR code, wait for user to scan
    // Status: 'qr_pending'
    // NO auto-reconnect
  } else {
    // Normal reconnect
    // Status: 'reconnecting'
    // Auto-reconnect after 3 seconds
  }
}
```

**Action Required**: Automatic reconnection (no user action needed).

---

### 9. **Network Issues** (Various)
**Scenario**: Internet connection lost, firewall blocking, proxy issues.

**What Happens**:
- Connection closes (may have various status codes)
- Usually temporary
- May reconnect when network restored

**Current Handling**:
- Depends on status code
- 515/428: Auto-reconnect
- Others: Manual reconnect required

**Action Required**: Fix network issues, may auto-reconnect.

---

### 10. **Server Shutdown/Restart**
**Scenario**: Your server is shut down or restarted.

**What Happens**:
- All connections closed
- Sessions remain in memory (if server restarts)
- Credentials preserved on disk

**Current Handling**:
- Graceful shutdown logs out all sessions
- Credentials preserved for next startup
- Sessions need to be reinitialized

**Action Required**: Restart server, sessions will reconnect automatically if credentials exist.

---

### 11. **WhatsApp Server Maintenance**
**Scenario**: WhatsApp servers are down or under maintenance.

**What Happens**:
- Connection closes
- May have various error codes
- Usually temporary

**Current Handling**:
- Depends on error code
- May auto-reconnect when servers are back

**Action Required**: Wait for WhatsApp servers to recover.

---

### 12. **Multi-Device Conflicts**
**Scenario**: WhatsApp account is connected on multiple devices, causing conflicts.

**What Happens**:
- Connection may close unexpectedly
- May get logged out (401)
- Session conflicts

**Current Handling**:
- Treated as logged out (401)
- Session deleted
- Requires new QR scan

**Action Required**: Disconnect other devices or scan QR code again.

---

## 🔄 Current Handling Logic

### Recoverable Errors (Auto-Reconnect):
- **515** (Stream Error) - Reconnects after 2-3 seconds
- **428** (Precondition Required) - Reconnects after 3 seconds

### Fatal Errors (No Auto-Reconnect):
- **401** (Logged Out) - Session deleted, requires new QR scan
- **403** (Forbidden) - Account banned, cannot reconnect
- **404** (Not Found) - Session invalid, requires new QR scan
- **408** (Timeout) - Network issue, may need manual reconnect
- **500** (Bad Session) - Credentials corrupted, requires new QR scan

### Special Cases:
- **QR Code Exists**: Prevents auto-reconnect to preserve QR for scanning
- **QR Code Scanned**: Allows auto-reconnect to complete authentication
- **Connected State**: No reconnect needed, connection is active

---

## 🔁 Reconnection Behavior

### Automatic Reconnection:
1. **After QR Scan**: Reconnects in 2 seconds to complete authentication
2. **Stream Errors (515)**: Reconnects in 2-3 seconds if no QR code exists
3. **Precondition Errors (428)**: Reconnects in 3 seconds

### Manual Reconnection:
1. **Logged Out (401)**: User must scan QR code again
2. **Fatal Errors**: User must delete session and reconnect
3. **Network Issues**: Fix network, then reconnect

### Reconnection Process:
1. Check if credentials exist
2. If valid credentials exist, use them to reconnect
3. If no credentials, generate new QR code
4. Update session status accordingly

---

## 📊 Status Flow Diagram

```
[Connected] 
    ↓
[Disconnect Event]
    ↓
[Check Status Code]
    ↓
    ├─ 401 (Logged Out) → [Delete Session] → [Requires QR Scan]
    ├─ 403 (Forbidden) → [Mark Failed] → [Cannot Reconnect]
    ├─ 404 (Not Found) → [Mark Failed] → [Requires QR Scan]
    ├─ 408 (Timeout) → [Mark Failed] → [Manual Reconnect]
    ├─ 428 (Precondition) → [Auto-Reconnect in 3s] → [Reconnecting]
    ├─ 500 (Bad Session) → [Mark Failed] → [Requires QR Scan]
    ├─ 503 (Restart) → [Should Auto-Reconnect] → [Reconnecting]
    └─ 515 (Stream Error) → [Check QR State] → [Reconnect or Wait]
```

---

## 🛠️ Recommendations

### Current Issues:
1. **Status 503** not handled as recoverable (should be added)
2. **Status 408** could be recoverable (network timeout)
3. **Reconnection delays** could be configurable
4. **Max retry attempts** should be limited

### Improvements Needed:
1. Add 503 to recoverable errors list
2. Add exponential backoff for reconnection
3. Add max retry limit (e.g., 5 attempts)
4. Add connection health monitoring
5. Add user notification for fatal errors

---

## 📝 Notes

- **QR Code Preservation**: QR codes are preserved for 3 minutes before expiring
- **Credential Persistence**: Credentials are saved to disk and persist across server restarts
- **Session Cleanup**: Sessions are automatically cleaned up on logout
- **Graceful Shutdown**: Server shutdown logs out all sessions cleanly

---

## 🔗 Related Files

- `backend/src/services/whatsappService.js` - Main connection handling logic
- `backend/src/routes/whatsapp.js` - API endpoints for connection management
- `backend/server.js` - Graceful shutdown handling

---

**Last Updated**: 2026-01-22
**Version**: 1.0.0
