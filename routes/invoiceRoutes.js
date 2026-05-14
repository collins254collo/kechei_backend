const express = require('express');
const router = express.Router();
const invoiceController = require('../controller/invoiceController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/',           invoiceController.getAll);
router.get('/:id',        invoiceController.getById);
router.post('/',              invoiceController.create);        // manual creation
router.post('/generate',      invoiceController.generateFromVisit); // generate from visit
// router.put('/:id',        invoiceController.update);
router.delete('/:id',     adminOnly, invoiceController.delete);

module.exports = router;