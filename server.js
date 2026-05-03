const express = require('express');
const app = express();

app.use(express.json());

// Routes
const clientRoutes  = require('./routes/clientRouter');
const visitRoutes   = require('./routes/visitRouter');
const chargeRoutes  = require('./routes/chargeRouter');
const paymentRoutes = require('./routes/paymentRouter');
const expenseRoutes = require('./routes/expenseRouter');

app.use('/api/clients',  clientRoutes);
app.use('/api/visits',   visitRoutes);
app.use('/api/charges',  chargeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/expenses', expenseRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;