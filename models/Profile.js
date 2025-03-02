const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
  // Usuario y servidor al que pertenece
  userId: {
    type: String,
    required: true
  },
  serverId: {
    type: String,
    required: true
  },
  
  // Información del personaje
  character: {
    name: {
      type: String,
      default: ''
    },
    avatar: {
      type: String,
      default: null
    },
    race: {
      type: String,
      default: ''
    },
    class: {
      type: String,
      default: ''
    },
    level: {
      type: Number,
      default: 1,
      min: 1
    },
    experience: {
      type: Number,
      default: 0,
      min: 0
    },
    age: {
      type: Number,
      default: null
    },
    bio: {
      type: String,
      default: ''
    },
    
    // Estadísticas
    stats: {
      strength: { type: Number, default: 10 },
      intelligence: { type: Number, default: 10 },
      dexterity: { type: Number, default: 10 },
      defense: { type: Number, default: 10 }
    },
    
    // Salud y mana
    health: {
      current: { type: Number, default: 100 },
      max: { type: Number, default: 100 }
    },
    mana: {
      current: { type: Number, default: 50 },
      max: { type: Number, default: 50 }
    },
    
    // Moneda del juego
    currency: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // Inventario (actualizado)
    inventory: [{
      itemId: { type: String, required: true },
      quantity: { type: Number, default: 1, min: 1 },
      equipped: { type: Boolean, default: false },
      uses: { type: Number, default: null }, // Para ítems con usos limitados
      acquiredAt: { type: Date, default: Date.now }
    }],
    
    // Equipamiento actual (para acceso rápido)
    equipment: {
      head: { type: String, default: null },
      body: { type: String, default: null },
      hands: { type: String, default: null },
      feet: { type: String, default: null },
      weapon: { type: String, default: null },
      accessory: { type: String, default: null }
    },
    
    // Habilidades aprendidas (actualizado)
    skills: [{
      skillId: { type: String, required: true },
      level: { type: Number, default: 1, min: 1 },
      usesLeft: { type: Number, default: null }, // Para habilidades con usos limitados
      cooldownUntil: { type: Date, default: null } // Para habilidades con cooldown
    }]
  },
  
  // Progreso de misiones y aventuras
  progress: {
    // Misiones activas
    activeMissions: [{
      missionId: { type: String, required: true },
      startedAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, default: null },
      currentStage: { type: Number, default: 0 },
      progress: { type: Number, default: 0 }, // Progreso en la etapa actual (0-100%)
      completed: { type: Boolean, default: false }
    }],
    
    // Aventuras activas
    activeAdventures: [{
      adventureId: { type: String, required: true },
      startedAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, default: null },
      completedMissions: [String], // IDs de misiones completadas
      completed: { type: Boolean, default: false }
    }],
    
    // Historial de misiones completadas
    completedMissions: [{
      missionId: { type: String, required: true },
      completedAt: { type: Date, default: Date.now },
      rewards: {
        experience: Number,
        currency: Number,
        items: [{
          itemId: String,
          quantity: Number
        }]
      }
    }],
    
    // Historial de aventuras completadas
    completedAdventures: [{
      adventureId: { type: String, required: true },
      completedAt: { type: Date, default: Date.now },
      rewards: {
        experience: Number,
        currency: Number,
        items: [{
          itemId: String,
          quantity: Number
        }]
      }
    }]
  },
  
  // Estadísticas de juego
  stats: {
    wins: {
      type: Number,
      default: 0
    },
    losses: {
      type: Number,
      default: 0
    },
    quests: {
      completed: {
        type: Number,
        default: 0
      },
      failed: {
        type: Number,
        default: 0
      }
    },
    missionsCompleted: { type: Number, default: 0 },
    adventuresCompleted: { type: Number, default: 0 },
    itemsAcquired: { type: Number, default: 0 },
    skillsLearned: { type: Number, default: 0 },
    totalCurrencyEarned: { type: Number, default: 0 },
    totalCurrencySpent: { type: Number, default: 0 },
    totalExperienceEarned: { type: Number, default: 0 },
    totalDamageDealt: { type: Number, default: 0 },
    totalDamageTaken: { type: Number, default: 0 },
    totalHealing: { type: Number, default: 0 }
  },
  
  // Preferencias del usuario
  preferences: {
    theme: {
      type: String,
      default: 'default'
    },
    visibility: {
      type: String,
      enum: ['public', 'friends', 'private'],
      default: 'public'
    },
    customTitle: {
      type: String,
      default: ''
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  
  // Fechas de creación y actualización
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Canal de perfil en Discord (nuevo)
  profileChannelId: {
    type: String,
    default: null
  }
});

// Middleware pre-save para actualizar la fecha de modificación
ProfileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Profile', ProfileSchema);