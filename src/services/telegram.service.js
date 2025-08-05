const TelegramBot = require('node-telegram-bot-api');
const logger = require('../config/logger');
const User = require('../models/user.model');
const Medication = require('../models/medication.model');
const cron = require('node-cron');

// Initialize Telegram bot
const token = process.env.TELEGRAM_BOT_TOKEN;
let bot;

// Store active reminders
const activeReminders = new Map();

// Initialize the bot
const initBot = () => {
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN not found. Telegram bot will not be started.');
    return null;
  }

  try {
    // Use polling for development, webhook for production
    const options = process.env.NODE_ENV === 'production' 
      ? { webHook: { autoOpen: false } } 
      : { polling: true };
    
    bot = new TelegramBot(token, options);
    
    if (process.env.NODE_ENV === 'production') {
      const webhookUrl = `${process.env.APP_URL}/api/telegram/webhook`;
      bot.setWebHook(`${webhookUrl}/${token}`);
      logger.info(`Telegram webhook set to: ${webhookUrl}`);
    }
    
    setupBotCommands();
    logger.info('Telegram bot initialized successfully');
    return bot;
  } catch (error) {
    logger.error(`Error initializing Telegram bot: ${error.message}`);
    return null;
  }
};

// Set up bot commands and handlers
const setupBotCommands = () => {
  // Start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      // Check if user exists in our system
      const user = await User.findOne({ telegramId: userId.toString() });
      
      if (!user) {
        // Ask for verification code
        return bot.sendMessage(
          chatId,
          'Welcome to MedReminder! 🔔\n\n' +
          'Please enter the verification code from your account settings to link your Telegram account.'
        );
      }
      
      // User is already linked
      bot.sendMessage(
        chatId,
        `👋 Welcome back, ${user.name}!\n\n` +
        'I\'ll send you medication reminders based on your schedule. ' +
        'You can also use these commands:\n\n' +
        '/medications - View your current medications\n' +
        '/appointments - View your upcoming appointments\n' +
        '/help - Show available commands'
      );
    } catch (error) {
      logger.error(`Error in /start command: ${error.message}`);
      bot.sendMessage(chatId, '❌ An error occurred. Please try again later.');
    }
  });
  
  // Handle verification code
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Skip if it's a command
    if (text.startsWith('/')) return;
    
    try {
      // Check if this is a verification code (6-digit number)
      const verificationCode = text.trim();
      if (!/^\d{6}$/.test(verificationCode)) {
        return bot.sendMessage(
          chatId,
          'Please enter a valid 6-digit verification code from your account settings.'
        );
      }
      
      // Find user by verification code
      const user = await User.findOne({ 
        telegramVerificationCode: verificationCode,
        telegramVerificationExpires: { $gt: Date.now() }
      });
      
      if (!user) {
        return bot.sendMessage(
          chatId,
          '❌ Invalid or expired verification code. Please generate a new one from your account settings.'
        );
      }
      
      // Link Telegram account
      user.telegramId = userId.toString();
      user.telegramVerificationCode = undefined;
      user.telegramVerificationExpires = undefined;
      await user.save();
      
      bot.sendMessage(
        chatId,
        `✅ Success! Your Telegram account has been linked to ${user.email}.\n\n` +
        'You will now receive medication reminders and appointment notifications here.'
      );
      
      // Schedule existing medication reminders
      await scheduleUserMedicationReminders(user);
      
    } catch (error) {
      logger.error(`Error verifying Telegram user: ${error.message}`);
      bot.sendMessage(chatId, '❌ An error occurred. Please try again later.');
    }
  });
  
  // Medications command
  bot.onText(/\/medications/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const user = await User.findOne({ telegramId: userId.toString() });
      if (!user) {
        return bot.sendMessage(
          chatId,
          'Please link your account first using the /start command.'
        );
      }
      
      const medications = await Medication.find({
        patient: user._id,
        status: 'active'
      }).sort({ name: 1 });
      
      if (medications.length === 0) {
        return bot.sendMessage(
          chatId,
          'You currently have no active medications.'
        );
      }
      
      let message = '💊 *Your Active Medications*\n\n';
      medications.forEach((med, index) => {
        message += `*${index + 1}. ${med.name}*\n`;
        message += `   - Dosage: ${med.dosage.value} ${med.dosage.unit} (${med.dosage.form})\n`;
        if (med.frequency) {
          message += `   - Frequency: ${med.frequency.timesPerDay} time(s) per day\n`;
          if (med.frequency.specificTimes && med.frequency.specificTimes.length > 0) {
            message += `   - Times: ${med.frequency.specificTimes.join(', ')}\n`;
          }
        }
        if (med.instructions) {
          message += `   - Instructions: ${med.instructions}\n`;
        }
        message += '\n';
      });
      
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error(`Error in /medications command: ${error.message}`);
      bot.sendMessage(chatId, '❌ An error occurred while fetching your medications.');
    }
  });
  
  // Appointments command
  bot.onText(/\/appointments/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const user = await User.findOne({ telegramId: userId.toString() });
      if (!user) {
        return bot.sendMessage(
          chatId,
          'Please link your account first using the /start command.'
        );
      }
      
      const now = new Date();
      const appointments = await Appointment.find({
        patient: user._id,
        date: { $gte: now },
        status: { $in: ['scheduled', 'confirmed'] }
      })
      .sort({ date: 1, startTime: 1 })
      .populate('doctor', 'name specialization');
      
      if (appointments.length === 0) {
        return bot.sendMessage(
          chatId,
          'You have no upcoming appointments.'
        );
      }
      
      let message = '📅 *Your Upcoming Appointments*\n\n';
      appointments.forEach((appt, index) => {
        const apptDate = new Date(appt.date).toLocaleDateString();
        message += `*${index + 1}. ${apptDate} at ${appt.startTime}*\n`;
        message += `   - Doctor: Dr. ${appt.doctor.name} (${appt.doctor.specialization})\n`;
        message += `   - Reason: ${appt.reason}\n`;
        if (appt.isVirtual) {
          message += `   - Type: Virtual\n`;
          if (appt.meetingLink) {
            message += `   - [Join Meeting](${appt.meetingLink})\n`;
          }
        } else {
          message += `   - Type: In-person\n`;
        }
        message += '\n';
      });
      
      bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true 
      });
      
    } catch (error) {
      logger.error(`Error in /appointments command: ${error.message}`);
      bot.sendMessage(chatId, '❌ An error occurred while fetching your appointments.');
    }
  });
  
  // Help command
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = 
      '🤖 *MedReminder Bot Help*\n\n' +
      'Available commands:\n\n' +
      '*/start* - Link your account and get started\n' +
      '*/medications* - View your current medications\n' +
      '*/appointments* - View your upcoming appointments\n' +
      '*/help* - Show this help message\n\n' +
      'Need assistance? Contact support@medreminder.com';
    
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  });
};

// Schedule medication reminders for a user
const scheduleUserMedicationReminders = async (user) => {
  try {
    // Cancel any existing reminders for this user
    cancelUserReminders(user._id);
    
    // Get all active medications for the user
    const medications = await Medication.find({
      patient: user._id,
      status: 'active',
      'frequency.specificTimes': { $exists: true, $not: { $size: 0 } }
    });
    
    if (medications.length === 0) return;
    
    // Schedule reminders for each medication
    for (const med of medications) {
      await scheduleMedicationReminders(med, user);
    }
    
    logger.info(`Scheduled reminders for user ${user._id} (${medications.length} medications)`);
  } catch (error) {
    logger.error(`Error scheduling reminders for user ${user._id}: ${error.message}`);
  }
};

// Schedule reminders for a specific medication
const scheduleMedicationReminders = async (medication, user) => {
  if (!medication.frequency || !medication.frequency.specificTimes) return;
  
  const userId = user._id.toString();
  const medName = medication.name;
  const dosage = `${medication.dosage.value} ${medication.dosage.unit}`;
  const instructions = medication.instructions ? `\n\n💡 *Instructions:* ${medication.instructions}` : '';
  
  // Clear any existing reminders for this medication
  cancelMedicationReminders(medication._id);
  
  // Create a new reminder entry
  const reminder = {
    userId,
    medicationId: medication._id,
    chatId: user.telegramId,
    timers: []
  };
  
  // Schedule reminders for each time of day
  for (const time of medication.frequency.specificTimes) {
    const [hours, minutes] = time.split(':').map(Number);
    
    // Create a cron expression for this time (runs every day at the specified time)
    const cronExpression = `${minutes} ${hours} * * *`;
    
    // Schedule the reminder
    const job = cron.schedule(cronExpression, async () => {
      try {
        // Check if medication is still active
        const currentMed = await Medication.findById(medication._id);
        if (!currentMed || currentMed.status !== 'active') {
          // Medication is no longer active, cancel this reminder
          job.stop();
          return;
        }
        
        // Send reminder message
        const message = `💊 *Time to take your medication!*\n\n` +
          `*${medName}* (${dosage})${instructions}`;
        
        await bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
        
        // Log the reminder
        logger.info(`Sent reminder for medication ${medName} to user ${userId}`);
        
      } catch (error) {
        logger.error(`Error sending medication reminder: ${error.message}`);
      }
    }, {
      scheduled: true,
      timezone: 'UTC' // Adjust timezone as needed
    });
    
    // Store the timer for later cancellation
    reminder.timers.push(job);
  }
  
  // Store the reminder
  activeReminders.set(medication._id.toString(), reminder);
};

// Cancel all reminders for a specific medication
const cancelMedicationReminders = (medicationId) => {
  const reminder = activeReminders.get(medicationId.toString());
  if (!reminder) return;
  
  // Stop all timers
  for (const timer of reminder.timers) {
    timer.stop();
  }
  
  // Remove from active reminders
  activeReminders.delete(medicationId.toString());
};

// Cancel all reminders for a specific user
const cancelUserReminders = (userId) => {
  for (const [medId, reminder] of activeReminders.entries()) {
    if (reminder.userId === userId.toString()) {
      cancelMedicationReminders(medId);
    }
  }
};

// Handle webhook updates (for production)
const handleWebhookUpdate = (req, res) => {
  if (req.params.token !== token) {
    logger.warn('Invalid Telegram webhook token');
    return res.sendStatus(401);
  }
  
  bot.processUpdate(req.body);
  res.sendStatus(200);
};

module.exports = {
  initBot,
  handleWebhookUpdate,
  scheduleMedicationReminders,
  cancelMedicationReminders,
  cancelUserReminders,
  scheduleUserMedicationReminders
};
