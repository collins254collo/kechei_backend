const express = require('express');
const router = express.Router();
const chargeCtrl = require('../controller/chargeController');

router.get   ('/:id', chargeCtrl.getOne);
router.patch ('/:id', chargeCtrl.update);
router.delete('/:id', chargeCtrl.remove);

module.exports = router;