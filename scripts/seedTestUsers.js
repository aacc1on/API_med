require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/user.model');
const logger = require('../src/config/logger');

const testUsers = [
  {
    name: 'Test Doctor',
    email: 'testdoctor@example.com',
    password: 'doctor123',
    passwordConfirm: 'doctor123',
    role: 'doctor',
    phone: '+1234567890',
    specialization: 'General Medicine'
  },
  {
    name: 'Test Patient',
    email: 'testpatient@example.com',
    password: 'patient123',
    passwordConfirm: 'patient123',
    role: 'patient',
    phone: '+1987654321',
    dateOfBirth: '1990-01-01',
    address: '123 Test St, Test City'
  },
  {
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'admin123',
    passwordConfirm: 'admin123',
    role: 'admin',
    phone: '+1122334455'
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/medreminder', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('Connected to MongoDB for seeding');

    // Clear existing test users
    await User.deleteMany({
      email: { $in: testUsers.map(u => u.email) }
    });
    logger.info('Cleared existing test users');

    // Hash passwords and create users
    const createdUsers = [];
    for (const userData of testUsers) {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      // Create user with hashed password
      const user = new User({
        ...userData,
        password: hashedPassword,
        passwordConfirm: undefined, // Remove confirmPassword as it's not needed in the model
        active: true
      });
      
      await user.save({ validateBeforeSave: false });
      createdUsers.push(user);
    }

    logger.info(`Successfully seeded ${createdUsers.length} test users`);
    console.log('Test users created successfully:');
    createdUsers.forEach(user => {
      console.log(`- ${user.name} (${user.role}): ${user.email} / ${testUsers.find(u => u.email === user.email).password}`);
    });
    
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding test users:', error);
    console.error('Error seeding test users:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();
