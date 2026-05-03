const express = require('express');
const router = express.Router();
const clientCtrl = require('../controller/clientController');

router.get   ('/',            clientCtrl.getAll);
router.post  ('/',            clientCtrl.create);
router.get   ('/:id',         clientCtrl.getOne);
router.patch ('/:id',         clientCtrl.update);
router.delete('/:id',         clientCtrl.remove);
router.get   ('/:id/visits',  clientCtrl.getWithVisits);

module.exports = router;