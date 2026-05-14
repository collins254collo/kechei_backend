const express = require('express');
const router = express.Router();
const paymentController = require('../controller/paymentController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/invoice/:invoiceId',  paymentController.getByInvoice);
router.post('/',                   paymentController.create);
router.delete('/:id',              adminOnly, paymentController.delete);

module.exports = router;