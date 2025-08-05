# Medication Reminder System API

A comprehensive backend API for a doctor-patient medication reminder system with Telegram integration. This system allows doctors to manage patient appointments and medication schedules, while patients receive timely reminders via Telegram.

## Features

- **User Authentication**: JWT-based authentication with role-based access control (Patient, Doctor, Admin)
- **Appointment Management**: Schedule, view, update, and cancel appointments
- **Medication Management**: Prescribe and track medications with detailed schedules
- **Telegram Integration**: Real-time medication reminders via Telegram bot
- **Admin Dashboard**: Comprehensive system monitoring and management
- **RESTful API**: Well-documented endpoints following REST principles

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Real-time Notifications**: Telegram Bot API
- **Logging**: Winston
- **Environment Management**: dotenv
- **API Documentation**: Included in the codebase

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Telegram Bot Token (for Telegram integration)
- npm or yarn

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/medreminder-api.git
   cd medreminder-api
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Update the `.env` file with your configuration.

4. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. The API will be available at `http://localhost:3000`

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/medreminder

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=90d
JWT_COOKIE_EXPIRES_IN=90

# Email Configuration (for production)
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USERNAME=apikey
EMAIL_PASSWORD=your_sendgrid_api_key
EMAIL_FROM=MedReminder <noreply@medreminder.com>

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_BOT_USERNAME=your_telegram_bot_username
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/forgot-password` - Request password reset
- `PATCH /api/auth/reset-password/:token` - Reset password
- `PATCH /api/auth/update-password` - Update password (authenticated)
- `POST /api/auth/logout` - Logout user

### Appointments

- `GET /api/appointments` - Get all appointments (filtered by role)
- `POST /api/appointments` - Create a new appointment (Doctor only)
- `GET /api/appointments/available-slots` - Get available time slots
- `GET /api/appointments/:id` - Get appointment by ID
- `PATCH /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Delete appointment

### Medications

- `GET /api/medications` - Get all medications (filtered by role)
- `POST /api/medications` - Create a new medication (Doctor only)
- `GET /api/medications/:id` - Get medication by ID
- `PATCH /api/medications/:id` - Update medication
- `DELETE /api/medications/:id` - Delete medication
- `GET /api/medications/stats/:patientId` - Get medication statistics

### Admin

- `GET /api/admin/dashboard` - Get dashboard statistics
- `GET /api/admin/users` - Get all users
- `POST /api/admin/users` - Create a new user
- `GET /api/admin/users/:id` - Get user by ID
- `PATCH /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/appointments` - Get all appointments
- `GET /api/admin/medications` - Get all medications
- `GET /api/admin/logs` - Get system logs
- `GET /api/admin/health` - Get system health status

### Telegram

- `POST /api/telegram/webhook/:token` - Telegram webhook endpoint
- `POST /api/telegram/generate-verification-code` - Generate verification code
- `POST /api/telegram/unlink` - Unlink Telegram account
- `GET /api/telegram/bot-info` - Get bot information

## Telegram Bot Commands

- `/start` - Link your account and get started
- `/medications` - View your current medications
- `/appointments` - View your upcoming appointments
- `/help` - Show available commands

## Database Models

### User
- `name` (String): User's full name
- `email` (String): Unique email address
- `password` (String): Hashed password
- `role` (String): User role (patient, doctor, admin)
- `telegramId` (String): Telegram user ID for notifications
- `specialization` (String, Doctor only): Doctor's specialization
- `isVerified` (Boolean): Email verification status
- `active` (Boolean): Account status

### Appointment
- `doctor` (ObjectId): Reference to User (Doctor)
- `patient` (ObjectId): Reference to User (Patient)
- `date` (Date): Appointment date
- `startTime` (String): Appointment start time
- `endTime` (String): Appointment end time
- `status` (String): Appointment status (scheduled, completed, cancelled, no-show)
- `reason` (String): Reason for appointment
- `notes` (String): Additional notes
- `isVirtual` (Boolean): Virtual/In-person flag
- `meetingLink` (String, optional): Virtual meeting link

### Medication
- `patient` (ObjectId): Reference to User (Patient)
- `doctor` (ObjectId): Reference to User (Doctor)
- `name` (String): Medication name
- `dosage` (Object): 
  - `value` (Number): Dosage amount
  - `unit` (String): Dosage unit (mg, mcg, etc.)
  - `form` (String): Medication form (tablet, liquid, etc.)
- `frequency` (Object):
  - `timesPerDay` (Number): Number of times per day
  - `specificTimes` ([String]): Array of specific times (HH:MM)
  - `instructions` (String): Special instructions
- `startDate` (Date): Medication start date
- `endDate` (Date, optional): Medication end date
- `status` (String): Medication status (active, completed, stopped, cancelled)
- `isCritical` (Boolean): Critical medication flag
- `notes` (String): Additional notes

## Error Handling

The API follows RESTful error handling conventions with appropriate HTTP status codes:

- `200` OK - Request successful
- `201` Created - Resource created successfully
- `400` Bad Request - Invalid request data
- `401` Unauthorized - Authentication required
- `403` Forbidden - Insufficient permissions
- `404` Not Found - Resource not found
- `500` Internal Server Error - Server error

## Logging

The application uses Winston for logging. Logs are written to both console and files in the `logs/` directory.

## Testing

To run tests:

```bash
npm test
# or
yarn test
```

## Deployment

### Production

1. Set `NODE_ENV=production` in your `.env` file
2. Configure a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start src/app.js --name medreminder-api
   pm2 save
   pm2 startup
   ```

3. Set up Nginx as a reverse proxy (recommended)

### Docker

A `Dockerfile` and `docker-compose.yml` are provided for containerized deployment:

```bash
docker-compose up -d
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Express.js](https://expressjs.com/)
- [MongoDB](https://www.mongodb.com/)
- [Mongoose](https://mongoosejs.com/)
- [JWT](https://jwt.io/)
- [Telegram Bot API](https://core.telegram.org/bots/api)

## Support

For support, please open an issue or contact [your-email@example.com](mailto:your-email@example.com)# API_med
