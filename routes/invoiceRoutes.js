const express = require('express');
const router  = express.Router();
const invoiceController = require('../controller/invoiceController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware'); 

router.get('/',                       authenticate, invoiceController.getAll);
router.post('/generate',              authenticate, invoiceController.generateFromVisit);
router.post('/generate-from-client',  authenticate, invoiceController.generateFromClient);
router.post('/generate-from-group',   authenticate, invoiceController.generateFromGroup);
router.post('/manual',                authenticate, adminOnly, invoiceController.createManual);
router.post('/:id/send',              authenticate, invoiceController.sendToClient);
router.get('/preview/:client_id',     authenticate, invoiceController.previewByClient);
router.get('/:id/pdf',                authenticate, invoiceController.previewPdf);
router.get('/:id',                    authenticate, invoiceController.getById);
router.post('/',                      authenticate, invoiceController.create);
router.patch('/:id',                  authenticate, invoiceController.update);
router.delete('/:id',                 authenticate, adminOnly, invoiceController.delete); 

module.exports = router;