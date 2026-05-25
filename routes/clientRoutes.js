const express = require('express');
const router = express.Router();
const clientController = require('../controller/clientController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/',         clientController.getAll);
router.get('/search',   clientController.search);
router.get('/:id/profile', clientController.getProfile);
router.get('/:id',      clientController.getById);
router.post('/',        clientController.create);
router.put('/:id',      clientController.update);
router.delete('/:id',   adminOnly, clientController.delete);

module.exports = router;