const express = require('express');
const router = express.Router();
const visitCtrl  = require('../controller/visitController');
const chargeCtrl = require('../controller/chargeController');
const paymentCtrl = require('../controller/paymentController');

router.get   ('/',               visitCtrl.getAll);
router.post  ('/',               visitCtrl.create);
router.get   ('/active',         visitCtrl.getActive);
router.get   ('/:id',            visitCtrl.getOne);
router.patch ('/:id',            visitCtrl.update);
router.patch ('/:id/status',     visitCtrl.updateStatus);
router.delete('/:id',            visitCtrl.remove);
router.get   ('/:id/summary',    visitCtrl.getSummary);

// Nested charges
router.get   ('/:visitId/charges',  chargeCtrl.getByVisit);
router.post  ('/:visitId/charges',  chargeCtrl.create);

// Nested payments
router.get   ('/:visitId/payments', paymentCtrl.getByVisit);
router.post  ('/:visitId/payments', paymentCtrl.create);

module.exports = router;