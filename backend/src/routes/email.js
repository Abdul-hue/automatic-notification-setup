const express = require('express');
const router = express.Router();
const { sendEmail, getDefaultAccount } = require('../services/emailService');
const { emailLimiter } = require('../utils/rateLimiter');
const { validateEmail } = require('../middleware/validation');
require('dotenv').config();

/**
 * GET /
 * Get email API information
 */
router.get('/', (req, res) => {
  res.json({
    service: 'Email API',
    version: '1.0.0',
    endpoints: {
      'POST /send': 'Send an email',
      'POST /test': 'Send a test email to configured SMTP user'
    },
    status: 'active'
  });
});

/**
 * POST /send
 * Send email
 * Request body can include optional accountConfig:
 * {
 *   accountConfig: {
 *     host: 'smtp.gmail.com',
 *     port: 587,
 *     user: 'email@gmail.com',
 *     pass: 'password'
 *   },
 *   to: 'recipient@example.com',
 *   subject: 'Subject',
 *   text: 'Body text',
 *   ...
 * }
 */
router.post('/send', validateEmail, async (req, res) => {
  try {
    const { accountConfig, to, subject, text, html, cc, bcc } = req.body;
    
    // Check rate limit BEFORE sending email
    try {
      await emailLimiter.checkLimit(to);
    } catch (rateLimitError) {
      return res.status(429).json({
        error: rateLimitError.message
      });
    }
    
    // Use provided accountConfig or fallback to default account
    const emailAccount = accountConfig || getDefaultAccount();
    
    // Prepare email options
    const emailOptions = {
      to,
      subject,
      text,
      html,
      cc,
      bcc
    };
    
    // Call sendEmail with account config and options
    const result = await sendEmail(emailAccount, emailOptions);
    
    // Return success/error response
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send email'
    });
  }
});

/**
 * POST /test
 * Send a test email
 * Request body can include optional accountConfig to test a specific account
 */
router.post('/test', async (req, res) => {
  try {
    const { accountConfig } = req.body;
    
    // Use provided accountConfig or fallback to default account
    const emailAccount = accountConfig || getDefaultAccount();
    
    // Send a test email to the account's user email
    const testEmailOptions = {
      to: emailAccount.user,
      subject: 'Test Email from WhatsApp-Email Messenger',
      text: `This is a test email sent at ${new Date().toISOString()}`
    };
    
    // Call sendEmail with account config
    const result = await sendEmail(emailAccount, testEmailOptions);
    
    // Return success/error response
    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send test email'
    });
  }
});

// Export router
module.exports = router;
