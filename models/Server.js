const mongoose = require('mongoose');

const ServerSchema = new mongoose.Schema({
  // Información básica del servidor
  serverId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: null
  },
  ownerId: {
    type: String,
    required: true
  },
  
  // Configuración general
  config: {
    prefix: {
      type: String,
      default: '!'
    },
    language: {
      type: String,
      default: 'es'
    },
    adminRoles: {
      type: [String],
      default: []
    },
    modRoles: {
      type: [String],
      default: []
    },
    allowProfileEditing: {
      type: Boolean,
      default: true
    },
    automod: {
      enabled: {
        type: Boolean,
        default: false
      },
      bannedWords: {
        type: [String],
        default: []
      },
      spamThreshold: {
        type: Number,
        default: 5
      }
    },
    // Nueva configuración: canal de perfiles
    profilesChannel: {
      type: String,
      default: null // ID del canal donde se mostrarán los perfiles
    },
    autoCreateProfileChannels: {
      type: Boolean,
      default: false
    },
    profileChannelCategory: {
      type: String,
      default: null // ID de la categoría donde se crearán los canales de perfil
    }
  },
  
  // Configuración de roleplay (actualizada)
  roleplay: {
    enabled: {
      type: Boolean,
      default: false
    },
    startingCurrency: {
      type: Number,
      default: 100
    },
    startingLevel: {
      type: Number,
      default: 1
    },
    experienceRate: {
      type: Number,
      default: 1.0 // Multiplicador de experiencia
    },
    currencyRate: {
      type: Number,
      default: 1.0 // Multiplicador de moneda
    },
    
    // Configuración de canales
    questChannels: {
      type: [String],
      default: []
    },
    roleplayChannels: {
      type: [String],
      default: []
    },
    
    // Razas, clases, etc.
    races: {
      type: [String],
      default: ['Humano', 'Elfo', 'Enano', 'Orco', 'Tiefling']
    },
    classes: {
      type: [String],
      default: ['Guerrero', 'Mago', 'Ladrón', 'Clérigo', 'Bardo']
    },
    
    // Nuevas configuraciones
    raceDescriptions: {
      type: Map,
      of: String,
      default: () => new Map()
    },
    classDescriptions: {
      type: Map,
      of: String,
      default: () => new Map()
    },
    raceClassRestrictions: {
      type: Map,
      of: [String],
      default: () => new Map() // Mapa con clave = raza, valor = array de clases permitidas
    },
    
    // Configuración de misiones y aventuras
    dailyQuestReset: {
      type: String,
      default: '00:00' // Hora en formato 24h para reset de misiones diarias
    },
    weeklyQuestReset: {
      type: String,
      default: 'Mon-00:00' // Día y hora para reset de misiones semanales
    },
    maxActiveMissions: {
      type: Number,
      default: 3 // Máximo de misiones activas por usuario
    },
    maxActiveAdventures: {
      type: Number,
      default: 1 // Máximo de aventuras activas por usuario
    },
    
    // Configuración de economía
    itemDropRate: {
      type: Number,
      default: 1.0 // Multiplicador de probabilidad de drops
    },
    shopRefreshInterval: {
      type: Number,
      default: 24 // Horas entre actualizaciones de la tienda
    },
    
    // Canales específicos para funcionalidades de roleplay
    shopChannel: {
      type: String,
      default: null
    },
    adventureChannel: {
      type: String,
      default: null
    },
    announcementChannel: {
      type: String,
      default: null
    }
  },
  
  // Configuración de entretenimiento
  entertainment: {
    enabled: {
      type: Boolean,
      default: false
    },
    welcomeChannel: {
      type: String,
      default: ''
    },
    musicChannels: {
      type: [String],
      default: []
    },
    gameChannels: {
      type: [String],
      default: []
    }
  },
  
  // Estadísticas del servidor
  stats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    activeUsers: {
      type: Number,
      default: 0
    },
    commandUsage: {
      type: Map,
      of: Number,
      default: () => new Map()
    },
    topUsers: {
      type: [{
        userId: String,
        activity: Number
      }],
      default: []
    },
    // Nuevas estadísticas para roleplay
    totalProfiles: {
      type: Number,
      default: 0
    },
    totalMissionsCompleted: {
      type: Number,
      default: 0
    },
    totalAdventuresCompleted: {
      type: Number,
      default: 0
    },
    totalCurrencyEarned: {
      type: Number,
      default: 0
    },
    totalItemsAcquired: {
      type: Number,
      default: 0
    },
    mostPopularRace: {
      type: String,
      default: ''
    },
    mostPopularClass: {
      type: String,
      default: ''
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
  }
});

// Middleware pre-save para actualizar la fecha de modificación
ServerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Server', ServerSchema);