const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');
const { authenticate, adminOnly } = require('../middleware/authMiddleware');

router.post('/login',           authController.login);
router.get('/me',               authenticate, authController.getMe);
router.get('/users',            authenticate, adminOnly, authController.getAll);
router.post('/users',           authenticate, adminOnly, authController.createUser);
router.delete('/users/:id',     authenticate, adminOnly, authController.deleteUser);

module.exports = router;