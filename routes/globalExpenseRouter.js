const express = require('express');
const router = express.Router();
const globalExpenseCtrl = require('../controller/globalExpenseController');

router.get   ('/',          globalExpenseCtrl.getAll);
router.post  ('/',          globalExpenseCtrl.create);
router.get   ('/summary',   globalExpenseCtrl.getSummary);
router.get   ('/:id',       globalExpenseCtrl.getOne);
router.patch ('/:id',       globalExpenseCtrl.update);
router.delete('/:id',       globalExpenseCtrl.remove);

module.exports = router;