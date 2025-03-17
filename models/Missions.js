const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Esquema para datos de desafíos (minijuegos, combates, etc.)
const ChallengeDataSchema = new Schema({
  // Tipo de desafío o minijuego
  gameType: {
    type: String,
    enum: ['quiz', 'memory', 'reaction', 'combat', 'puzzle', 'dialogue', 'collection'],
    required: true
  },

  enemyType: {
    type: String,
    default: null
  },
  
  enemyLevel: {
    type: Number,
    default: null
  },
  
  enemyHealth: {
    type: Number,
    default: null
  },

  enemyAvatar: {
    type: String,
    default: null
  },

  puzzleType: {
    type: String,
    default: null
  },
  
  // Límite de tiempo (en segundos, 0 significa sin límite)
  timeLimit: {
    type: Number,
    default: 0
  },

  puzzleContent: {
    instructions: {
      type: String,
      default: null
    },
    question: {
      type: String,
      default: null
    },
    answer: {
      type: String,
      default: null
    }
  },

  script: {
    type: String,
    default: null
  },

  npcName: {
    type: String,
    default: null
  },
  
  result: {
    type: String,
    default: null
  },
  
  // Intentos permitidos (0 significa ilimitados)
  maxAttempts: {
    type: Number,
    default: 0
  },
  
  // Puntuación mínima para aprobar (0-100)
  passingScore: {
    type: Number,
    default: 70,
    min: 0,
    max: 100
  },
  
  // Configuración específica del minijuego
  gameConfig: {
    type: Schema.Types.Mixed,
    default: {}
    // Ejemplos de estructura para cada tipo:
    // quiz: { questions: [...], showCorrectAnswers: true }
    // memory: { pairs: [...], allowHints: false }
    // reaction: { rounds: 5, targetSize: "medium" }
    // combat: { enemies: [...], playerBonus: {...} }
  },
  
  // Dificultad específica del desafío (puede ser diferente a la misión)
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'extreme'],
    default: 'medium'
  },
  
  // Recompensas específicas por completar este desafío
  rewards: {
    experience: { type: Number, default: 0 },
    currency: { type: Number, default: 0 },
    // Otros tipos de recompensas específicas...
  }
});

// Esquema para las etapas de una misión
const MissionStageSchema = new Schema({
  name: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  taskType: { 
    type: String, 
    enum: ['combat', 'puzzle', 'minigame', 'dialogue', 'collection', 'custom'],
    default: 'custom'
  },
  targetAmount: { 
    type: Number, 
    default: 1 
  },
  completionMessage: { 
    type: String, 
    default: '' 
  },
  
  // Datos específicos del desafío para esta etapa
  challengeData: {
    type: ChallengeDataSchema,
    default: null
  },
  
  // Condiciones para desbloquear esta etapa
  unlockConditions: {
    previousStagesCompleted: { type: Boolean, default: true },
    requiredItems: [{
      itemId: String,
      quantity: { type: Number, default: 1 }
    }],
    requiredLevel: { type: Number, default: 0 },
    customCondition: { type: String, default: '' }
  },
  
  // Recompensas específicas por completar esta etapa
  stageRewards: {
    experience: { type: Number, default: 0 },
    currency: { type: Number, default: 0 },
    items: [{
      itemId: String,
      quantity: { type: Number, default: 1 }
    }]
  },
  
  // Opcional: NPCs involucrados en esta etapa
  involvedNPCs: [{
    name: String,
    role: String, // 'quest_giver', 'enemy', 'ally', etc.
    dialogueKey: String // Referencia a diálogos específicos
  }],
  
  // Opcional: Ubicación específica para esta etapa
  location: {
    name: String,
    description: String,
    coordinates: {
      x: Number,
      y: Number,
      z: Number
    }
  }
});

// Esquema para las misiones
const MissionSchema = new Schema({
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
    enum: ['story', 'daily', 'weekly', 'event', 'custom', 'side', 'guild', 'pvp'],
    default: 'custom'
  },
  
  // Categoría de la misión (para organización)
  category: {
    type: String,
    default: 'general'
  },
  
  // Etiquetas para búsqueda y filtrado
  tags: {
    type: [String],
    default: []
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
    reputation: { type: Number, default: 0 }, // Nueva: puntos de reputación
    items: {
      type: [{
        itemId: String,
        quantity: { type: Number, default: 1 },
        dropChance: { type: Number, default: 100 } // Probabilidad de obtener (1-100%)
      }],
      default: []
    },
    skills: {
      type: [String], // ID de habilidades que se pueden desbloquear
      default: []
    },
    // Nueva: recompensas aleatorias (se elige una al completar)
    randomRewards: {
      type: [{
        type: { type: String, enum: ['item', 'currency', 'experience'] },
        itemId: String,
        quantity: { type: Number, default: 1 },
        chance: { type: Number, default: 10 } // Probabilidad (1-100%)
      }],
      default: []
    },
    customReward: {
      type: Schema.Types.Mixed,
      default: null
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
    },
    // Nuevo: costo de energía o recursos específicos
    resources: {
      type: Map, // Ejemplo: { "energy": 10, "guild_tokens": 5 }
      of: Number,
      default: () => new Map()
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
  
  // Nueva: disponibilidad en días específicos
  availableDays: {
    type: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    default: [] // Vacío significa todos los días
  },
  
  // Nueva: horas de disponibilidad
  availableHours: {
    from: { type: Number, min: 0, max: 23, default: null },
    to: { type: Number, min: 0, max: 23, default: null }
  },
  
  // Limitación de participantes
  maxParticipants: {
    type: Number,
    default: 0 // 0 significa sin límite
  },
  
  // Nuevo: modo de completado en grupo
  groupCompletion: {
    enabled: { type: Boolean, default: false },
    minPlayers: { type: Number, default: 2 },
    maxPlayers: { type: Number, default: 5 },
    sharedRewards: { type: Boolean, default: true } // Si las recompensas se comparten
  },
  
  // Nueva: repetibilidad
  repeatable: {
    type: Boolean,
    default: false
  },
  repeatLimit: {
    type: Number,
    default: 0 // 0 significa sin límite
  },
  repeatCooldown: {
    type: Number, // En minutos
    default: 1440 // 24 horas por defecto
  },
  
  // Etapas de la misión (usando el esquema mejorado)
  stages: {
    type: [MissionStageSchema],
    default: []
  },
  
  // Prerrequisitos para desbloquear esta misión
  prerequisites: {
    missionsCompleted: [String], // IDs de misiones que deben estar completadas
    level: { type: Number, default: 1 },
    reputation: { type: Number, default: 0 },
    items: [{
      itemId: String,
      quantity: { type: Number, default: 1 }
    }],
    skills: [String] // Habilidades requeridas
  },
  
  // Nuevo: misiones que se desbloquean al completar esta
  unlocksQuests: {
    type: [String], // IDs de misiones
    default: []
  },
  
  // Nuevo: tipo de completado (lineal o cualquier orden)
  completionType: {
    type: String,
    enum: ['linear', 'any_order', 'partial'],
    default: 'linear'
  },
  minStagesForCompletion: {
    type: Number,
    default: null // Si es null, se requieren todas las etapas (para partial)
  },
  
  // Servidor al que pertenece
  serverId: {
    type: String,
    required: true
  },
  
  // Estado de la misión
  status: {
    type: String,
    enum: ['draft', 'active', 'expired', 'disabled', 'scheduled'],
    default: 'draft'
  },
  
  // Si es una misión destacada
  featured: {
    type: Boolean,
    default: false
  },
  
  // Nuevo: orden de prioridad para misiones destacadas
  featuredOrder: {
    type: Number,
    default: 0
  },
  
  // Nuevo: historia y narrativa
  narrative: {
    prologue: { type: String, default: '' },
    epilogue: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  
  // Nuevo: sistema de ramas y elecciones
  choices: {
    type: [{
      stageIndex: Number,
      text: String,
      outcomes: [{
        text: String,
        nextStageIndex: Number,
        effects: Schema.Types.Mixed // Efectos específicos de la elección
      }]
    }],
    default: []
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
  },
  
  // Nueva: historial de versiones
  versionHistory: {
    type: [{
      version: Number,
      changedBy: String,
      changedAt: { type: Date, default: Date.now },
      changes: [String] // Descripción de los cambios
    }],
    default: []
  }
});

// Esquema para las aventuras (colecciones de misiones)
const AdventureSchema = new Schema({
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
  
  // Categoría y tags
  category: {
    type: String,
    default: 'general'
  },
  tags: {
    type: [String],
    default: []
  },
  
  // Misiones que componen esta aventura (en orden)
  missions: {
    type: [{
      missionId: { type: String, required: true },
      required: { type: Boolean, default: true }, // Si es obligatoria para completar la aventura
      order: { type: Number, default: 0 }, // Orden de presentación
      description: { type: String, default: '' } // Descripción contextual en esta aventura
    }],
    default: []
  },
  
  // Nueva: capítulos o agrupaciones de misiones
  chapters: {
    type: [{
      title: String,
      description: String,
      missionIds: [String], // IDs de misiones en este capítulo
      unlockCondition: {
        previousChapterCompleted: { type: Boolean, default: true },
        customCondition: String
      }
    }],
    default: []
  },
  
  // Restricciones generales
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
  
  // Razones de restricción
  restrictionReasons: {
    type: Map,
    of: String,
    default: () => new Map()
  },
  
  // Recompensas adicionales por completar toda la aventura
  completionRewards: {
    experience: { type: Number, default: 0 },
    currency: { type: Number, default: 0 },
    reputation: { type: Number, default: 0 },
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
    },
    // Nueva: recompensas especiales exclusivas
    exclusiveRewards: {
      type: [{
        type: String, // 'title', 'badge', 'item', etc.
        id: String,
        name: String,
        description: String
      }],
      default: []
    }
  },
  
  // Nueva: recompensas por progreso parcial
  progressRewards: {
    type: [{
      requiredMissions: Number, // Número de misiones requeridas
      rewards: {
        experience: Number,
        currency: Number,
        items: [{
          itemId: String,
          quantity: Number
        }]
      }
    }],
    default: []
  },
  
  // Tiempo y disponibilidad
  duration: {
    type: Number, // En minutos, 0 significa sin límite de tiempo
    default: 0
  },
  availableFrom: {
    type: Date,
    default: null
  },
  availableUntil: {
    type: Date,
    default: null
  },
  
  // Nueva: temporada o evento asociado
  season: {
    type: String,
    default: null
  },
  
  // Nueva: dificultad de la aventura
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'extreme'],
    default: 'medium'
  },
  
  // Nueva: requisitos previos para desbloquear esta aventura
  prerequisites: {
    adventuresCompleted: [String],
    level: { type: Number, default: 1 },
    reputation: { type: Number, default: 0 }
  },
  
  // Servidor al que pertenece
  serverId: {
    type: String,
    required: true
  },
  
  // Estado de la aventura
  status: {
    type: String,
    enum: ['draft', 'active', 'expired', 'disabled', 'scheduled'],
    default: 'draft'
  },
  
  // Si es una aventura destacada
  featured: {
    type: Boolean,
    default: false
  },
  
  // Nuevo: orden de prioridad para aventuras destacadas
  featuredOrder: {
    type: Number,
    default: 0
  },
  
  // Nueva: tipo de completado
  completionType: {
    type: String,
    enum: ['all_missions', 'required_only', 'percentage'],
    default: 'required_only'
  },
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  
  // Nuevo: contenido narrativo
  narrative: {
    introduction: { type: String, default: '' },
    conclusion: { type: String, default: '' }
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
  
  // Si es una actualización, agregar entrada al historial de versiones
  if (!this.isNew && this.isModified()) {
    // Obtener la última versión o empezar en 1
    const lastVersion = this.versionHistory.length > 0 
      ? this.versionHistory[0].version : 0;
    
    // Crear nueva entrada de versión
    this.versionHistory.unshift({
      version: lastVersion + 1,
      changedBy: this.modifiedBy || this.createdBy, // Usa modifiedBy si está disponible
      changedAt: Date.now(),
      changes: ['Actualización de misión'] // Mensaje genérico
    });
  }
  
  next();
});

AdventureSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Métodos estáticos
MissionSchema.statics.findActive = function(serverId) {
  const now = new Date();
  
  return this.find({
    serverId: serverId,
    status: 'active',
    $or: [
      { availableUntil: null },
      { availableUntil: { $gt: now } }
    ],
    $or: [
      { availableFrom: null },
      { availableFrom: { $lte: now } }
    ]
  });
};

AdventureSchema.statics.findActive = function(serverId) {
  const now = new Date();
  
  return this.find({
    serverId: serverId,
    status: 'active',
    $or: [
      { availableUntil: null },
      { availableUntil: { $gt: now } }
    ],
    $or: [
      { availableFrom: null },
      { availableFrom: { $lte: now } }
    ]
  });
};

// Métodos de instancia
MissionSchema.methods.isAvailable = function() {
  const now = new Date();
  
  // Verificar estado
  if (this.status !== 'active') return false;
  
  // Verificar disponibilidad temporal
  if (this.availableFrom && this.availableFrom > now) return false;
  if (this.availableUntil && this.availableUntil < now) return false;
  
  // Verificar días disponibles
  if (this.availableDays && this.availableDays.length > 0) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[now.getDay()];
    if (!this.availableDays.includes(today)) return false;
  }
  
  // Verificar horas disponibles
  if (this.availableHours.from !== null && this.availableHours.to !== null) {
    const hour = now.getHours();
    if (hour < this.availableHours.from || hour >= this.availableHours.to) return false;
  }
  
  return true;
};

// Verificar si un perfil cumple con los requisitos
MissionSchema.methods.checkRequirements = function(profile) {
  // Verificar nivel
  if (profile.character.level < this.levelRequired) {
    return {
      meets: false,
      reason: `Nivel insuficiente. Requiere nivel ${this.levelRequired}.`
    };
  }
  
  // Verificar restricciones de raza
  if (this.raceRestrictions.length > 0 && 
      !this.raceRestrictions.includes(profile.character.race)) {
    const reason = this.restrictionReasons.get(profile.character.race) || 
                  `Esta misión no está disponible para la raza ${profile.character.race}.`;
    return {
      meets: false,
      reason: reason
    };
  }
  
  // Verificar restricciones de clase
  if (this.classRestrictions.length > 0 && 
      !this.classRestrictions.includes(profile.character.class)) {
    const reason = this.restrictionReasons.get(profile.character.class) || 
                  `Esta misión no está disponible para la clase ${profile.character.class}.`;
    return {
      meets: false,
      reason: reason
    };
  }
  
  // Verificar prerrequisitos
  if (this.prerequisites) {
    // Verificar misiones completadas
    for (const missionId of this.prerequisites.missionsCompleted) {
      const missionCompleted = profile.progress.completedMissions.some(
        m => m.missionId === missionId
      );
      
      if (!missionCompleted) {
        return {
          meets: false,
          reason: "No has completado todas las misiones prerrequisito."
        };
      }
    }
    
    // Verificar skills requeridas
    for (const skillId of this.prerequisites.skills) {
      const hasSkill = profile.character.skills.some(
        s => s.skillId === skillId
      );
      
      if (!hasSkill) {
        return {
          meets: false,
          reason: "No tienes todas las habilidades requeridas."
        };
      }
    }
    
    // Verificar items requeridos
    for (const requiredItem of this.prerequisites.items) {
      const inventoryItem = profile.character.inventory.find(
        i => i.itemId === requiredItem.itemId
      );
      
      if (!inventoryItem || inventoryItem.quantity < requiredItem.quantity) {
        return {
          meets: false,
          reason: "No tienes todos los items requeridos."
        };
      }
    }
  }
  
  // Si pasó todas las verificaciones
  return {
    meets: true
  };
};

// Crear los modelos
const Mission = mongoose.model('Mission', MissionSchema);
const Adventure = mongoose.model('Adventure', AdventureSchema);

module.exports = {
  Mission,
  Adventure,
  ChallengeDataSchema,
  MissionStageSchema
};