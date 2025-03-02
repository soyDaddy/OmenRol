const mongoose = require('mongoose');

// Esquema para las misiones
const MissionSchema = new mongoose.Schema({
  // Información básica
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  
  // Imagen/banner de la misión (opcional)
  image: {
    type: String,
    default: null
  },
  
  // Tipo de misión
  type: {
    type: String,
    enum: ['story', 'daily', 'weekly', 'event', 'custom'],
    default: 'custom'
  },
  
  // Restricciones
  levelRequired: {
    type: Number,
    default: 1,
    min: 1
  },
  raceRestrictions: {
    type: [String],
    default: [] // Vacío significa todas las razas permitidas
  },
  classRestrictions: {
    type: [String],
    default: [] // Vacío significa todas las clases permitidas
  },
  
  // Razones de restricción (para mostrar a los usuarios restringidos)
  restrictionReasons: {
    type: Map,
    of: String,
    default: () => new Map() // Las claves son los nombres de raza o clase
  },
  
  // Dificultad
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'extreme'],
    default: 'medium'
  },
  
  // Recompensas
  rewards: {
    experience: { type: Number, default: 0 },
    currency: { type: Number, default: 0 },
    items: {
      type: [{
        itemId: String,
        quantity: { type: Number, default: 1 }
      }],
      default: []
    },
    skills: {
      type: [String], // ID de habilidades que se pueden desbloquear
      default: []
    }
  },
  
  // Costos para iniciar la misión (opcional)
  costs: {
    currency: { type: Number, default: 0 },
    items: {
      type: [{
        itemId: String,
        quantity: { type: Number, default: 1 }
      }],
      default: []
    }
  },
  
  // Tiempo y disponibilidad
  duration: {
    type: Number, // En minutos, 0 significa sin límite de tiempo
    default: 0
  },
  cooldown: {
    type: Number, // En minutos, tiempo de espera entre intentos
    default: 0
  },
  availableFrom: {
    type: Date,
    default: null // null significa siempre disponible
  },
  availableUntil: {
    type: Date,
    default: null // null significa siempre disponible
  },
  
  // Limitación de participantes
  maxParticipants: {
    type: Number,
    default: 0 // 0 significa sin límite
  },
  
  // Etapas de la misión (para misiones más complejas)
  stages: {
    type: [{
      name: { type: String, required: true },
      description: { type: String, required: true },
      taskType: { 
        type: String, 
        enum: ['combat', 'puzzle', 'dialogue', 'collection', 'custom'],
        default: 'custom'
      },
      targetAmount: { type: Number, default: 1 },
      completionMessage: { type: String, default: '' }
    }],
    default: []
  },
  
  // Servidor al que pertenece
  serverId: {
    type: String,
    required: true
  },
  
  // Estado de la misión
  status: {
    type: String,
    enum: ['draft', 'active', 'expired', 'disabled'],
    default: 'draft'
  },
  
  // Si es una misión destacada
  featured: {
    type: Boolean,
    default: false
  },
  
  // Metadatos
  createdBy: {
    type: String,  // ID del administrador que la creó
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Esquema para las aventuras (colecciones de misiones)
const AdventureSchema = new mongoose.Schema({
  // Información básica
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  
  // Imagen/banner de la aventura (opcional)
  image: {
    type: String,
    default: null
  },
  
  // Misiones que componen esta aventura (en orden)
  missions: {
    type: [{
      missionId: { type: String, required: true },
      required: { type: Boolean, default: true } // Si es obligatoria para completar la aventura
    }],
    default: []
  },
  
  // Restricciones generales (se aplicarán además de las restricciones específicas de cada misión)
  levelRequired: {
    type: Number,
    default: 1,
    min: 1
  },
  raceRestrictions: {
    type: [String],
    default: []
  },
  classRestrictions: {
    type: [String],
    default: []
  },
  
  // Razones de restricción (para mostrar a los usuarios restringidos)
  restrictionReasons: {
    type: Map,
    of: String,
    default: () => new Map()
  },
  
  // Recompensas adicionales por completar toda la aventura
  completionRewards: {
    experience: { type: Number, default: 0 },
    currency: { type: Number, default: 0 },
    items: {
      type: [{
        itemId: String,
        quantity: { type: Number, default: 1 }
      }],
      default: []
    },
    skills: {
      type: [String],
      default: []
    }
  },
  
  // Tiempo y disponibilidad
  availableFrom: {
    type: Date,
    default: null
  },
  availableUntil: {
    type: Date,
    default: null
  },
  
  // Servidor al que pertenece
  serverId: {
    type: String,
    required: true
  },
  
  // Estado de la aventura
  status: {
    type: String,
    enum: ['draft', 'active', 'expired', 'disabled'],
    default: 'draft'
  },
  
  // Si es una aventura destacada
  featured: {
    type: Boolean,
    default: false
  },
  
  // Metadatos
  createdBy: {
    type: String,
    required: true
  },
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
MissionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

AdventureSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Crear los modelos
const Mission = mongoose.model('Mission', MissionSchema);
const Adventure = mongoose.model('Adventure', AdventureSchema);

module.exports = {
  Mission,
  Adventure
};