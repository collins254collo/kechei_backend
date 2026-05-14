const UserModel = require('../model/userModel');
const jwt = require('jsonwebtoken');

const authController = {
  async login(req, res) {
    try {
      const { password } = req.body;
      const email = req.body.email?.trim().toLowerCase();
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }
      console.log(req.body);

      const user = await UserModel.getByEmail(email);
      if (!user) return res.status(401).json({ error: 'no such email' });

      const valid = await UserModel.verifyPassword(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid password' });

      const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getMe(req, res) {
    try {
      const user = await UserModel.getById(req.user.id);
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createUser(req, res) {
    try {
      const { name, email, password, role } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'name, email, and password are required' });
      }
      const user = await UserModel.create({ name, email, password, role });
      res.status(201).json(user);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Email already in use' });
      }
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const users = await UserModel.getAll();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async deleteUser(req, res) {
    try {
      await UserModel.delete(req.params.id);
      res.json({ message: 'User deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = authController;