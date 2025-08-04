const cron = require('node-cron');
const moment = require('moment');
const Medication = require('../models/Medication');
const Appointment = require('../models/Appointment');
const MedicationHistory = require('../models/MedicationHistory');

// Import Telegram bot functions (will be created)
let sendMedicationReminder, sendAppointmentReminder;
try {
  const telegramBot = require('../telegram-bot/bot');
  sendMedicationReminder = telegramBot.sendMedicationReminder;
  sendAppointmentReminder = telegramBot.sendAppointmentReminder;
} catch (error) {
  console.log('⚠️ Telegram bot not available, reminders will be logged only');
  sendMedicationReminder = async (telegramId, medication) => {
    console.log(`📨 [MOCK] Medication reminder for ${medication.patientId.name}: ${medication.name}`);
    return true;
  };
  sendAppointmentReminder = async (telegramId, appointment) => {
    console.log(`📨 [MOCK] Appointment reminder for ${appointment.patientId.name}`);
    return true;
  };
}

console.log('🕒 Scheduler started - checking for reminders every 5 minutes');

// Check for medication reminders every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    console.log('🔍 Checking for medication reminders...');
    
    const currentTime = moment().format('HH:mm');
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    // Find active medications for today
    const medications = await Medication.findMedicationsForReminders();

    let remindersSent = 0;
    let missedDosesLogged = 0;

    for (const medication of medications) {
      // Skip if patient doesn't have Telegram connected
      if (!medication.patientId.telegramId) continue;

      // Check if any of the scheduled times match current time
      const shouldRemind = medication.timesPerDay.some(scheduledTime => {
        const [schedHour, schedMin] = scheduledTime.split(':').map(Number);
        const [currHour, currMin] = currentTime.split(':').map(Number);
        
        // Check if within 5-minute window
        const schedMinutes = schedHour * 60 + schedMin;
        const currMinutes = currHour * 60 + currMin;
        
        return Math.abs(schedMinutes - currMinutes) <= 2; // 2 minute tolerance
      });

      if (shouldRemind) {
        // Check if reminder was already sent today for this time
        const today = new Date();
        const lastReminded = medication.lastReminded;
        
        if (!lastReminded || !moment(lastReminded).isSame(today, 'day')) {
          const success = await sendMedicationReminder(
            medication.patientId.telegramId, 
            medication
          );
          
          if (success) {
            medication.lastReminded = new Date();
            await medication.save();
            remindersSent++;
            console.log(`📨 Medication reminder sent to ${medication.patientId.name} for ${medication.name}`);
          }
        }
      }

      // Check for missed doses (30 minutes after scheduled time)
      const missedTimes = medication.timesPerDay.filter(scheduledTime => {
        const [schedHour, schedMin] = scheduledTime.split(':').map(Number);
        const [currHour, currMin] = currentTime.split(':').map(Number);
        
        const schedMinutes = schedHour * 60 + schedMin;
        const currMinutes = currHour * 60 + currMin;
        
        return currMinutes - schedMinutes === 30; // Exactly 30 minutes late
      });

      for (const missedTime of missedTimes) {
        // Check if this missed dose was already logged today
        const existingHistory = await MedicationHistory.findOne({
          medicationId: medication._id,
          scheduledTime: missedTime,
          takenAt: {
            $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
            $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
          }
        });

        if (!existingHistory) {
          // Log missed dose
          await MedicationHistory.create({
            medicationId: medication._id,
            patientId: medication.patientId._id,
            scheduledTime: missedTime,
            takenAt: new Date(),
            status: 'missed',
            notes: 'Automatically logged as missed dose'
          });
          
          missedDosesLogged++;
          console.log(`⚠️ Missed dose logged for ${medication.patientId.name}: ${medication.name} at ${missedTime}`);
        }
      }
    }

    if (remindersSent > 0) {
      console.log(`✅ Sent ${remindersSent} medication reminders`);
    }
    
    if (missedDosesLogged > 0) {
      console.log(`📝 Logged ${missedDosesLogged} missed doses`);
    }

  } catch (error) {
    console.error('Error in medication reminder cron:', error);
  }
});

// Check for appointment reminders daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  try {
    console.log('🔍 Checking for appointment reminders...');
    
    // Find appointments for tomorrow that haven't been reminded
    const appointments = await Appointment.findAppointmentsForTomorrow();
    
    let remindersSent = 0;

    for (const appointment of appointments) {
      // Skip if patient doesn't have Telegram connected
      if (!appointment.patientId.telegramId) continue;

      const success = await sendAppointmentReminder(
        appointment.patientId.telegramId,
        appointment
      );

      if (success) {
        appointment.reminderSent = true;
        appointment.reminderSentAt = new Date();
        await appointment.save();
        remindersSent++;
        console.log(`📨 Appointment reminder sent to ${appointment.patientId.name}`);
      }
    }

    if (remindersSent > 0) {
      console.log(`✅ Sent ${remindersSent} appointment reminders`);
    } else {
      console.log('📅 No appointment reminders to send today');
    }

  } catch (error) {
    console.error('Error in appointment reminder cron:', error);
  }
});

// Check for overdue appointments and mark as no-show (runs every hour)
cron.schedule('0 * * * *', async () => {
  try {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));
    
    // Find appointments that are 2+ hours overdue and still scheduled/confirmed
    const overdueAppointments = await Appointment.find({
      status: { $in: ['scheduled', 'confirmed'] },
      date: { $lt: twoHoursAgo }
    });

    let markedAsNoShow = 0;

    for (const appointment of overdueAppointments) {
      const appointmentTime = new Date(appointment.date);
      const [hours, minutes] = appointment.time.split(':').map(Number);
      appointmentTime.setHours(hours, minutes);
      
      if (appointmentTime < twoHoursAgo) {
        appointment.status = 'no-show';
        await appointment.save();
        markedAsNoShow++;
        console.log(`❌ Marked appointment as no-show: ${appointment.patientId.name} on ${appointment.date}`);
      }
    }

    if (markedAsNoShow > 0) {
      console.log(`📝 Marked ${markedAsNoShow} appointments as no-show`);
    }

  } catch (error) {
    console.error('Error in overdue appointment check:', error);
  }
});

// Clean up old medication history (runs daily at midnight)
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🧹 Cleaning up old medication history...');
    
    // Delete medication history older than 1 year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const result = await MedicationHistory.deleteMany({
      takenAt: { $lt: oneYearAgo }
    });

    if (result.deletedCount > 0) {
      console.log(`🗑️ Deleted ${result.deletedCount} old medication history records`);
    }

    // Clean up completed appointments older than 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const appointmentResult = await Appointment.deleteMany({
      status: 'completed',
      completedAt: { $lt: sixMonthsAgo }
    });

    if (appointmentResult.deletedCount > 0) {
      console.log(`🗑️ Deleted ${appointmentResult.deletedCount} old completed appointments`);
    }

  } catch (error) {
    console.error('Error in cleanup task:', error);
  }
});

// Generate daily statistics (runs daily at 11 PM)
cron.schedule('0 23 * * *', async () => {
  try {
    console.log('📊 Generating daily statistics...');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Medication statistics
    const medicationStats = await MedicationHistory.aggregate([
      {
        $match: {
          takenAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Appointment statistics
    const appointmentStats = await Appointment.aggregate([
      {
        $match: {
          date: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('📈 Daily Statistics:');
    console.log('Medications:', medicationStats);
    console.log('Appointments:', appointmentStats);

  } catch (error) {
    console.error('Error generating daily statistics:', error);
  }
});

// Health check - runs every hour
cron.schedule('0 * * * *', () => {
  const now = new Date();
  console.log(`💓 Scheduler health check - ${now.toISOString()}`);
  
  // Log system stats
  const memUsage = process.memoryUsage();
  console.log(`📊 Memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
});

// Weekly medication adherence report (runs every Sunday at 8 AM)
cron.schedule('0 8 * * 0', async () => {
  try {
    console.log('📋 Generating weekly medication adherence reports...');
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    // Get all active patients with medications
    const activeMedications = await Medication.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: oneWeekAgo }
    }).populate('patientId', 'name email telegramId');
    
    const adherenceReports = [];
    
    for (const medication of activeMedications) {
      const adherenceData = await MedicationHistory.getAdherenceRate(
        medication.patientId._id,
        medication._id,
        7
      );
      
      if (adherenceData.totalDoses > 0) {
        adherenceReports.push({
          patient: medication.patientId.name,
          medication: medication.name,
          adherenceRate: Math.round(adherenceData.adherenceRate),
          totalDoses: adherenceData.totalDoses,
          takenDoses: adherenceData.takenDoses,
          missedDoses: adherenceData.missedDoses
        });
      }
    }
    
    // Log patients with low adherence (< 80%)
    const lowAdherence = adherenceReports.filter(report => report.adherenceRate < 80);
    
    if (lowAdherence.length > 0) {
      console.log('⚠️ Patients with low medication adherence:');
      lowAdherence.forEach(report => {
        console.log(`  - ${report.patient}: ${report.medication} (${report.adherenceRate}%)`);
      });
    } else {
      console.log('✅ All patients have good medication adherence (80%+)');
    }

  } catch (error) {
    console.error('Error generating weekly adherence report:', error);
  }
});

// Export functions for manual triggering if needed
module.exports = {
  checkMedicationReminders: async () => {
    // Manual trigger for medication reminders
    console.log('🔄 Manually triggering medication reminder check...');
    // Implementation would go here
  },
  
  checkAppointmentReminders: async () => {
    // Manual trigger for appointment reminders
    console.log('🔄 Manually triggering appointment reminder check...');
    // Implementation would go here
  },
  
  generateStats: async () => {
    // Manual trigger for statistics generation
    console.log('🔄 Manually generating statistics...');
    // Implementation would go here
  }
};