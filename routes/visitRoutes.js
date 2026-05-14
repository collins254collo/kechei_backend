const express = require('express');
const router = express.Router();
const visitController = require('../controller/visitController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/active',              visitController.getActive);
router.get('/client/:clientId',    visitController.getByClient);
router.get('/:id',                 visitController.getById);
router.post('/',                   visitController.create);
router.patch('/:id/complete',      visitController.complete);
router.put('/:id',                 visitController.update);
router.delete('/:id',              adminOnly, visitController.delete);

module.exports = router;