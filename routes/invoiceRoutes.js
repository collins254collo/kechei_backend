const express = require('express');
const router  = express.Router();
const invoiceController = require('../controller/invoiceController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware'); 

router.get('/',          authenticate, invoiceController.getAll);
router.post('/generate', authenticate, invoiceController.generateFromVisit);
router.get('/:id',       authenticate, invoiceController.getById);
router.post('/',         authenticate, invoiceController.create);
router.patch('/:id',     authenticate, invoiceController.update);
router.delete('/:id',    authenticate, adminOnly, invoiceController.delete); 

module.exports = router;