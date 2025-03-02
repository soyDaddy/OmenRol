const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  discriminator: String,
  avatar: String,
  email: String,
  guilds: [{ id: String, name: String, icon: String, owner: Boolean, permissions: String }],
  accessToken: String,
  refreshToken: String,
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);