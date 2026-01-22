/**
 * Test Script for WhatsApp & Email Messenger API
 * 
 * This script tests all API endpoints to verify functionality.
 * 
 * USAGE:
 * 1. Make sure the server is running: npm start
 * 2. Configure your .env file with SMTP credentials
 * 3. Run this script: node test.js
 * 4. Follow the prompts to test different endpoints
 * 
 * PREREQUISITES:
 * - Server must be running on the port specified in .env (default: 3001)
 * - For WhatsApp tests: You'll need to scan QR code when prompted
 * - For Email tests: SMTP credentials must be configured in .env
 */

require('dotenv').config();
const axios = require('axios');
const readline = require('readline');

// Base URL for API
const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Helper function to wait for user input
 */
function waitForInput(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Test health endpoint
 */
async function testHealth() {
  console.log('\n=== Testing Health Endpoint ===');
  try {
    const response = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    return false;
  }
}

/**
 * Test WhatsApp connection
 */
async function testWhatsAppConnection(sessionId) {
  console.log('\n=== Testing WhatsApp Connection ===');
  try {
    const response = await axios.post(`${BASE_URL}/api/whatsapp/connect/${sessionId}`);
    console.log('✅ WhatsApp connection initiated:', response.data);
    return true;
  } catch (error) {
    console.error('❌ WhatsApp connection failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    return false;
  }
}

/**
 * Test WhatsApp status
 */
async function testWhatsAppStatus(sessionId) {
  console.log('\n=== Testing WhatsApp Status ===');
  try {
    const response = await axios.get(`${BASE_URL}/api/whatsapp/status/${sessionId}`);
    console.log('✅ Status retrieved:', response.data);
    
    if (response.data.qrCode) {
      console.log('\n📱 QR Code available! Scan it with WhatsApp to connect.');
      console.log('   Go to WhatsApp → Settings → Linked Devices → Link a Device');
    }
    
    if (response.data.connected) {
      console.log('✅ WhatsApp is connected!');
    } else {
      console.log('⚠️  WhatsApp is not connected. Please scan the QR code.');
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Status check failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    return null;
  }
}

/**
 * Test sending WhatsApp message
 */
async function testSendWhatsApp(sessionId, phone, message) {
  console.log('\n=== Testing WhatsApp Message Send ===');
  try {
    const response = await axios.post(
      `${BASE_URL}/api/whatsapp/send/${sessionId}`,
      {
        phoneNumber: phone,
        message: message
      }
    );
    console.log('✅ Message sent successfully:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Message send failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
      if (error.response.status === 429) {
        console.error('⚠️  Rate limit exceeded. Please wait before trying again.');
      }
    }
    return false;
  }
}

/**
 * Test sending email
 */
async function testSendEmail(to, subject, text) {
  console.log('\n=== Testing Email Send ===');
  try {
    const response = await axios.post(
      `${BASE_URL}/api/email/send`,
      {
        to: to,
        subject: subject,
        text: text
      }
    );
    console.log('✅ Email sent successfully:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Email send failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
      if (error.response.status === 429) {
        console.error('⚠️  Rate limit exceeded. Please wait before trying again.');
      }
    }
    return false;
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('\n🚀 Starting API Tests...');
  console.log('='.repeat(50));
  
  // Test 1: Health Check
  const healthOk = await testHealth();
  if (!healthOk) {
    console.log('\n❌ Server is not running or not accessible.');
    console.log('   Please start the server with: npm start');
    rl.close();
    return;
  }
  
  await waitForInput('\nPress Enter to continue to WhatsApp tests...');
  
  // Test 2: WhatsApp Connection
  const sessionId = 'test-session-' + Date.now();
  console.log(`\nUsing session ID: ${sessionId}`);
  
  await testWhatsAppConnection(sessionId);
  await waitForInput('\nPress Enter to check WhatsApp status...');
  
  // Test 3: WhatsApp Status
  const status = await testWhatsAppStatus(sessionId);
  
  if (status && status.connected) {
    await waitForInput('\nPress Enter to test sending a WhatsApp message (or Ctrl+C to skip)...');
    
    // Test 4: Send WhatsApp Message
    const phone = await waitForInput('Enter phone number (with country code, no +): ');
    const message = await waitForInput('Enter message to send: ');
    await testSendWhatsApp(sessionId, phone, message);
  } else {
    console.log('\n⚠️  Skipping WhatsApp message test - session not connected.');
    console.log('   Please scan the QR code first, then run the status test again.');
  }
  
  await waitForInput('\nPress Enter to test email sending...');
  
  // Test 5: Send Email
  const emailTo = await waitForInput('Enter recipient email address: ') || process.env.SMTP_USER;
  const emailSubject = await waitForInput('Enter email subject (or press Enter for default): ') || 'Test Email from API';
  const emailText = await waitForInput('Enter email text (or press Enter for default): ') || 'This is a test email sent from the WhatsApp-Email Messenger API test script.';
  
  await testSendEmail(emailTo, emailSubject, emailText);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ All tests completed!');
  console.log('='.repeat(50));
  
  rl.close();
}

// Run tests
runTests().catch((error) => {
  console.error('\n❌ Test script error:', error.message);
  rl.close();
  process.exit(1);
});
