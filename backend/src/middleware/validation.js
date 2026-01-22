/**
 * Helper function to validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if email is valid, false otherwise
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validation middleware for WhatsApp messages
 * Validates phoneNumber and message fields
 */
function validateWhatsAppMessage(req, res, next) {
  const { phoneNumber, message } = req.body;
  
  // Check phoneNumber exists and is not empty
  if (!phoneNumber || phoneNumber.trim() === '') {
    return res.status(400).json({
      error: 'phoneNumber is required and cannot be empty'
    });
  }
  
  // Check message exists and is not empty
  if (!message || message.trim() === '') {
    return res.status(400).json({
      error: 'message is required and cannot be empty'
    });
  }
  
  // Validate phoneNumber format (digits only, 10-15 characters)
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return res.status(400).json({
      error: 'phoneNumber must contain 10-15 digits'
    });
  }
  
  // If validation passes, continue to next middleware
  next();
}

/**
 * Validation middleware for email requests
 * Validates to, subject, and ensures at least one of text or html is provided
 */
function validateEmail(req, res, next) {
  const { to, subject, text, html } = req.body;
  
  // Check to exists
  if (!to || to.trim() === '') {
    return res.status(400).json({
      error: 'Recipient email address (to) is required'
    });
  }
  
  // Check subject exists
  if (!subject || subject.trim() === '') {
    return res.status(400).json({
      error: 'Email subject is required'
    });
  }
  
  // Validate email format
  if (!isValidEmail(to)) {
    return res.status(400).json({
      error: 'Invalid email format for recipient (to)'
    });
  }
  
  // Check at least one of text or html is provided
  if ((!text || text.trim() === '') && (!html || html.trim() === '')) {
    return res.status(400).json({
      error: 'At least one of text or html email body is required'
    });
  }
  
  // If validation passes, continue to next middleware
  next();
}

module.exports = {
  isValidEmail,
  validateWhatsAppMessage,
  validateEmail
};
