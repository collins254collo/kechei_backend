// expenseRoutes.js
const express = require('express');
const router = express.Router();
const expenseController = require('../controller/expenseController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/',                expenseController.getAll);   
router.get('/visit/:visitId',  expenseController.getByVisit);
router.post('/',               expenseController.create);
router.put('/:id',             expenseController.update);
router.delete('/:id',          adminOnly, expenseController.delete);

module.exports = router;