const nodemailer = require('nodemailer');
const logger = require('./logger');

// Check if email notifications are enabled
const EMAIL_NOTIFICATIONS_ENABLED = process.env.FEATURE_EMAIL_NOTIFICATIONS === 'true';

let transporter = null;

if (EMAIL_NOTIFICATIONS_ENABLED) {
  if (process.env.NODE_ENV === 'development' && (!process.env.EMAIL_HOST || process.env.EMAIL_HOST === 'smtp.example.com')) {
    // Create a test account using ethereal.email for development
    (async () => {
      try {
        const testAccount = await nodemailer.createTestAccount();
        
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false, // true for 465, false for other ports
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
        
        logger.info('Using Ethereal test email service for development');
        logger.info(`Test email account created: ${testAccount.user}`);
        logger.info(`Test email password: ${testAccount.pass}`);
      } catch (error) {
        logger.error('Error creating test email account:', error);
        logger.info('Email notifications will be disabled');
      }
    })();
  } else {
    // Use configured SMTP settings
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT || !process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD) {
      logger.warn('SMTP configuration is incomplete. Email notifications will be disabled.');
      logger.warn('To enable email notifications, please configure EMAIL_HOST, EMAIL_PORT, EMAIL_USERNAME, and EMAIL_PASSWORD in your .env file');
    } else {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: {
          // Do not fail on invalid certs
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
      });

      // Verify connection configuration
      transporter.verify(function(error) {
        if (error) {
          logger.error('SMTP connection error:', error);
          if (process.env.NODE_ENV !== 'production') {
            logger.info('Running in development mode. Emails will be logged to console if possible.');
          }
        } else {
          logger.info('SMTP server is ready to take our messages');
        }
      });
    }
  }
} else {
  logger.info('Email notifications are disabled (FEATURE_EMAIL_NOTIFICATIONS=false)');
}

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text email body
 * @param {string} [options.html] - HTML email body
 * @returns {Promise<boolean>}
 */
const sendEmail = async (options) => {
  if (!EMAIL_NOTIFICATIONS_ENABLED || !transporter) {
    logger.debug(`Email not sent (disabled): ${options.subject} to ${options.to}`);
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@medreminder.com',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);
    
    if (process.env.NODE_ENV === 'development') {
      logger.info(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    
    logger.info(`Email sent to ${options.to}`);
    return true;
  } catch (error) {
    logger.error('Error sending email:', error);
    logger.debug('Email options:', options);
    return false;
  }
};

/**
 * Send password reset email
 * @param {string} to - Recipient email address
 * @param {string} resetToken - Password reset token
 * @returns {Promise}
 */
const sendPasswordResetEmail = async (to, resetToken) => {
  const resetUrl = `${process.env.APP_URL}/reset-password/${resetToken}`;
  const subject = 'Your password reset token (valid for 10 minutes)';
  const text = `You are receiving this email because you (or someone else) has requested a password reset. Please make a PATCH request to: \n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>You are receiving this email because you (or someone else) has requested a password reset.</p>
      <p>Please click the button below to reset your password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p>${resetUrl}</p>
      <p>This link will expire in 10 minutes.</p>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    text,
    html
  });
};

/**
 * Send account verification email
 * @param {string} to - Recipient email address
 * @param {string} verificationToken - Account verification token
 * @returns {Promise}
 */
const sendVerificationEmail = async (to, verificationToken) => {
  const verificationUrl = `${process.env.APP_URL}/verify-email/${verificationToken}`;
  const subject = 'Verify your email address';
  const text = `Please verify your email by clicking the following link: \n\n${verificationUrl}\n\n`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Verify Your Email Address</h2>
      <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email</a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p>${verificationUrl}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you did not create an account, please ignore this email.</p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    text,
    html
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail
};
