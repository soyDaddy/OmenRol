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
  lastLogin: { type: Date, default: Date.now },
  
  // Configuraciones del usuario
  settings: {
    // Preferencias de apariencia
    theme: {
      type: String,
      enum: ['default', 'dark', 'cyberpunk', 'fantasy'],
      default: 'default'
    },
    displayMode: {
      type: String,
      enum: ['detailed', 'minimal', 'auto'],
      default: 'detailed'
    },
    language: {
      type: String,
      enum: ['es', 'en', 'fr', 'de'],
      default: 'es'
    },
    dateFormat: {
      type: String,
      enum: ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd'],
      default: 'dd/mm/yyyy'
    },
    fontSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium'
    },
    compactMode: {
      type: Boolean,
      default: false
    },
    reduceMotion: {
      type: Boolean,
      default: false
    },
    highContrast: {
      type: Boolean,
      default: false
    },
    
    // Configuración de notificaciones
    notifications: {
      notifyMessages: {
        type: Boolean,
        default: true
      },
      notifyEvents: {
        type: Boolean,
        default: true
      },
      notifyUpdates: {
        type: Boolean,
        default: true
      },
      notifyQuests: {
        type: Boolean,
        default: true
      },
      notifyMentions: {
        type: Boolean,
        default: true
      },
      mode: {
        type: String,
        enum: ['all', 'important', 'none'],
        default: 'all'
      }
    },
    
    // Configuración de privacidad
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'private'
      },
      activityVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'private'
      },
      showOnlineStatus: {
        type: Boolean,
        default: true
      },
      allowFriendRequests: {
        type: Boolean,
        default: true
      },
      shareCharacterStats: {
        type: Boolean,
        default: false
      }
    }
  }
});

module.exports = mongoose.model('User', userSchema);