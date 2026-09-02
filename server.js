require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');

app.use(express.json());

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

console.log('CORS configuration:', {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}
)
app.use(morgan('dev'));
app.use(helmet());


// Routes
app.use('/api/auth',      require('./routes/authRoutes'));
app.use('/api/clients',   require('./routes/clientRoutes'));
app.use('/api/visits',    require('./routes/visitRoutes'));
app.use('/api/expenses',  require('./routes/expenseRoutes'));
app.use('/api/invoices',  require('./routes/invoiceRoutes'));
app.use('/api/payments',  require('./routes/paymentRoutes'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// const bcrypt = require('bcrypt');
// const saltRounds = 10;
// const password = 'Wamiatu25Collo.';
// bcrypt.hash(password, saltRounds, function(err, hash) {
//   if (err) {
//     console.error('Error hashing password:', err);
//   } else {
//     console.log('Hashed password:', hash);
//   }
// });

// 404
app.use((req, res) => res.status(404).json({ error: 'Page not found' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Kechei API running on port ${PORT}`));