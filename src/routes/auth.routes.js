const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const asyncHandler = require('../middlewares/async.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/register', asyncHandler(authController.register.bind(authController)));
router.post('/login', asyncHandler(authController.login.bind(authController)));
router.get('/profile', authenticate, asyncHandler(authController.getProfile.bind(authController)));
router.post('/logout', asyncHandler(authController.logout.bind(authController)));

module.exports = router;
