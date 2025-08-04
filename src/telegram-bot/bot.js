/ src/telegram-bot/bot.js
const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');

const token = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

if (token) {
  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 Telegram bot started');
  
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, 'Welcome to MediRemind! Use /link to connect your account.');
  });
} else {
  console.log('⚠️ Telegram bot token not provided');
}

const sendMedicationReminder = async (telegramId, medication) => {
  if (!bot) return false;
  
  try {
    const message = `💊 Medication Reminder\n\n` +
      `Medication: ${medication.name}\n` +
      `Dosage: ${medication.dosage}\n` +
      `Instructions: ${medication.instructions || 'None'}`;
    
    await bot.sendMessage(telegramId, message);
    return true;
  } catch (error) {
    console.error('Error sending medication reminder:', error);
    return false;
  }
};

const sendAppointmentReminder = async (telegramId, appointment) => {
  if (!bot) return false;
  
  try {
    const message = `📅 Appointment Reminder\n\n` +
      `Date: ${appointment.date.toDateString()}\n` +
      `Time: ${appointment.time}\n` +
      `Location: ${appointment.location}\n` +
      `Doctor: ${appointment.doctorId.name}`;
    
    await bot.sendMessage(telegramId, message);
    return true;
  } catch (error) {
    console.error('Error sending appointment reminder:', error);
    return false;
  }
};

module.exports = {
  bot,
  sendMedicationReminder,
  sendAppointmentReminder
};