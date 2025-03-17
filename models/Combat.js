const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Esquema para participantes en el combate (jugadores y enemigos)
const CombatParticipantSchema = new Schema({
  // Tipo de participante
  type: {
    type: String,
    enum: ['player', 'enemy'],
    required: true
  },
  
  // Identificadores
  userId: { type: String, default: null }, // Para jugadores
  enemyId: { type: String, default: null }, // Para enemigos
  
  // Información básica
  name: { type: String, required: true },
  avatar: { type: String, default: null },
  
  // Si es un enemigo duplicado en combate
  duplicateNumber: { type: Number, default: 0 },
  
  // Estado actual en combate
  stats: {
    health: { type: Number, required: true },
    maxHealth: { type: Number, required: true },
    mana: { type: Number, default: 0 },
    maxMana: { type: Number, default: 0 },
    strength: { type: Number, default: 10 },
    intelligence: { type: Number, default: 10 },
    dexterity: { type: Number, default: 10 },
    defense: { type: Number, default: 10 }
  },
  
  // Para enemigos, se guardan sus ataques
  attacks: [{
    name: { type: String, required: true },
    description: { type: String, default: '' },
    damageType: { type: String, default: 'physical' },
    baseDamage: { type: Number, required: true },
    scaling: {
      stat: { type: String, default: 'strength' },
      multiplier: { type: Number, default: 1.0 }
    },
    effects: [{
      type: { type: String, required: true },
      chance: { type: Number, default: 100 },
      duration: { type: Number, default: 1 },
      value: { type: Number, default: 0 },
      targetStat: { type: String, default: null }
    }],
    cooldown: { type: Number, default: 0 },
    currentCooldown: { type: Number, default: 0 },
    manaCost: { type: Number, default: 0 },
    useChance: { type: Number, default: 50 }
  }],
  
  // Para jugadores, se guardan sus habilidades disponibles
  skills: [{
    skillId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    damageType: { type: String, default: 'physical' },
    baseDamage: { type: Number, default: 0 },
    healing: { type: Number, default: 0 },
    manaCost: { type: Number, default: 0 },
    cooldown: { type: Number, default: 0 },
    currentCooldown: { type: Number, default: 0 },
    effects: [Schema.Types.Mixed]
  }],
  
  // Items equipados (para jugadores)
  equipment: {
    weapon: { type: String, default: null },
    head: { type: String, default: null },
    body: { type: String, default: null },
    hands: { type: String, default: null },
    feet: { type: String, default: null },
    accessory: { type: String, default: null }
  },
  
  // Estado actual (efectos activos)
  statusEffects: [{
    name: { type: String, required: true },
    type: { type: String, required: true },
    remainingTurns: { type: Number, required: true },
    value: { type: Number, default: 0 },
    targetStat: { type: String, default: null },
    appliedBy: { type: String, default: null } // ID del participante que lo aplicó
  }],
  
  // Estado de turno
  turnState: {
    hasActed: { type: Boolean, default: false },
    hasMoved: { type: Boolean, default: false },
    stunned: { type: Boolean, default: false },
    canAct: { type: Boolean, default: true }
  },
  
  // Si el participante está vivo o derrotado
  isDefeated: { type: Boolean, default: false },
  
  // Posición en el campo de batalla (para futuros efectos de área)
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 }
  }
});

// Esquema para un registro de acción en el combate
const CombatActionSchema = new Schema({
  // Turno en el que ocurrió
  turn: { type: Number, required: true },
  
  // Quién realizó la acción
  actorId: { type: String, required: true },
  actorType: { type: String, enum: ['player', 'enemy'], required: true },
  actorName: { type: String, required: true },
  
  // Tipo de acción
  actionType: { 
    type: String, 
    enum: ['attack', 'skill', 'item', 'flee', 'defend', 'status_effect'],
    required: true 
  },
  
  // Detalles específicos según el tipo de acción
  details: {
    attackName: { type: String, default: null },
    skillId: { type: String, default: null },
    skillName: { type: String, default: null },
    itemId: { type: String, default: null },
    itemName: { type: String, default: null },
    statusEffect: { type: String, default: null }
  },
  
  // Objetivos de la acción
  targets: [{
    targetId: { type: String, required: true },
    targetName: { type: String, required: true },
    damage: { type: Number, default: 0 },
    healing: { type: Number, default: 0 },
    wasCritical: { type: Boolean, default: false },
    wasEvaded: { type: Boolean, default: false },
    appliedEffects: [{
      name: { type: String, required: true },
      type: { type: String, required: true },
      duration: { type: Number, required: true },
      value: { type: Number, default: 0 }
    }]
  }],
  
  // Mensaje descriptivo de la acción
  message: { type: String, default: '' },
  
  // Timestamp para ordenación
  timestamp: { type: Date, default: Date.now }
});

// Esquema principal de combate
const CombatSchema = new Schema({
  // ID del servidor
  serverId: {
    type: String,
    required: true,
    index: true
  },
  
  // ID del canal donde se desarrolla el combate
  channelId: {
    type: String,
    required: true
  },
  
  // Tipo de combate
  type: {
    type: String,
    enum: ['pve', 'pvp', 'raid', 'boss', 'event'],
    default: 'pve'
  },
  
  // Estado del combate
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active'
  },
  
  // Nivel de dificultad
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'extreme'],
    default: 'medium'
  },
  
  // Si es un combate iniciado desde una misión
  missionId: {
    type: String,
    default: null
  },
  
  // Si es parte de un evento
  eventId: {
    type: String,
    default: null
  },
  
  // Combate de grupo o individual
  isGroup: {
    type: Boolean,
    default: false
  },
  
  // Turno actual
  currentTurn: {
    type: Number,
    default: 1
  },
  
  // ID del participante que tiene el turno actual
  currentParticipantId: {
    type: String,
    default: null
  },
  
  // Orden de turnos (IDs de participantes)
  turnOrder: {
    type: [String],
    default: []
  },
  
  // Participantes en el combate
  participants: {
    type: [CombatParticipantSchema],
    default: []
  },
  
  // Registro de acciones
  actionLog: {
    type: [CombatActionSchema],
    default: []
  },
  
  // Recompensas (se calculan al finalizar)
  rewards: {
    experience: { type: Number, default: 0 },
    currency: { type: Number, default: 0 },
    items: [{
      itemId: { type: String, required: true },
      name: { type: String, required: true },
      quantity: { type: Number, default: 1 }
    }]
  },
  
  // Mensaje de combate (para editar)
  messageId: {
    type: String,
    default: null
  },
  
  // Tiempo límite del combate
  timeLimit: {
    type: Date,
    default: null
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Finalización
  completedAt: {
    type: Date,
    default: null
  },
  
  // Resultado (victoria o derrota para los jugadores)
  result: {
    type: String,
    enum: ['victory', 'defeat', 'draw', 'abandoned', null],
    default: null
  }
});

// Middleware pre-save para actualizar la fecha de modificación
CombatSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Método para obtener combates activos por servidor
CombatSchema.statics.getActiveByServer = function(serverId) {
  return this.find({
    serverId: serverId,
    status: 'active'
  });
};

// Método para obtener combate activo por usuario
CombatSchema.statics.getActiveByUser = function(userId) {
  return this.findOne({
    'participants.userId': userId,
    'participants.type': 'player',
    status: 'active'
  });
};

// Método para obtener combate por canal
CombatSchema.statics.getByChannel = function(channelId) {
  return this.findOne({
    channelId: channelId,
    status: 'active'
  });
};

// Método para añadir acción al log
CombatSchema.methods.addActionToLog = function(action) {
  action.turn = this.currentTurn;
  this.actionLog.push(action);
  return this.save();
};

// Método para finalizar combate
CombatSchema.methods.endCombat = function(result) {
  this.status = 'completed';
  this.result = result;
  this.completedAt = Date.now();
  return this.save();
};

// Método para abandonar combate
CombatSchema.methods.abandonCombat = function() {
  this.status = 'abandoned';
  this.result = 'abandoned';
  this.completedAt = Date.now();
  return this.save();
};

module.exports = mongoose.model('Combat', CombatSchema);