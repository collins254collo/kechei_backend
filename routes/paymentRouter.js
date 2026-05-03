const express = require('express');
const router = express.Router();
const paymentCtrl = require('../controller/paymentController');

router.get   ('/:id', paymentCtrl.getOne);
router.patch ('/:id', paymentCtrl.update);
router.delete('/:id', paymentCtrl.remove);

module.exports = router;