// Import nodemailer
const nodemailer = require('nodemailer');

// Import dotenv (config loaded)
require('dotenv').config();

/**
 * Get default account configuration from environment variables
 * @returns {Object} - Default email account configuration
 */
function getDefaultAccount() {
  return {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  };
}

/**
 * Create nodemailer transporter from account configuration
 * @param {Object} accountConfig - Account configuration
 * @returns {Object} - Nodemailer transporter instance
 */
function createTransporter(accountConfig) {
  try {
    // Add error handling for missing credentials
    if (!accountConfig.user || !accountConfig.pass) {
      throw new Error('SMTP credentials are missing. Please provide user and pass in accountConfig');
    }
    
    if (!accountConfig.host || !accountConfig.port) {
      throw new Error('SMTP host and port are missing. Please provide host and port in accountConfig');
    }
    
    // Prepare email config for nodemailer
    const emailConfig = {
      host: accountConfig.host,
      port: accountConfig.port,
      secure: false, // use STARTTLS
      auth: {
        user: accountConfig.user,
        pass: accountConfig.pass
      }
    };
    
    // Return nodemailer.createTransport(emailConfig)
    return nodemailer.createTransport(emailConfig);
  } catch (error) {
    throw new Error(`Failed to create email transporter: ${error.message}`);
  }
}

/**
 * Send email
 * @param {Object} accountConfig - Account configuration
 * @param {string} accountConfig.host - SMTP host
 * @param {number} accountConfig.port - SMTP port
 * @param {string} accountConfig.user - SMTP user/email
 * @param {string} accountConfig.pass - SMTP password
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text email body
 * @param {string} options.html - HTML email body (optional)
 * @param {string} options.cc - CC recipients (optional)
 * @param {string} options.bcc - BCC recipients (optional)
 * @param {Array} options.attachments - Email attachments (optional)
 * @returns {Promise<Object>} - Returns success response with messageId
 */
async function sendEmail(accountConfig, options) {
  try {
    const { to, subject, text, html, cc, bcc, attachments } = options;
    
    // Validate required fields (to, subject)
    if (!to) {
      throw new Error('Recipient email address (to) is required');
    }
    
    if (!subject) {
      throw new Error('Email subject is required');
    }
    
    // Create transporter with account config
    const transporter = createTransporter(accountConfig);
    
    // Prepare mail options
    const mailOptions = {
      from: accountConfig.user,
      to: to,
      subject: subject,
      text: text,
      html: html || text, // fallback to text if no HTML
      attachments: attachments || []
    };
    
    // Add cc and bcc if provided
    if (cc) {
      mailOptions.cc = cc;
    }
    
    if (bcc) {
      mailOptions.bcc = bcc;
    }
    
    // Send email using transporter.sendMail()
    const info = await transporter.sendMail(mailOptions);
    
    // Return success response
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    // Handle errors with try-catch
    return {
      success: false,
      error: error.message || 'Failed to send email'
    };
  }
}

// Export functions
module.exports = {
  sendEmail,
  createTransporter,
  getDefaultAccount
};
