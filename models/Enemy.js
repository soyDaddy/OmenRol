const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EnemySchema = new Schema({
  // Información básica
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  
  // Imagen/avatar del enemigo
  image: {
    type: String,
    default: null
  },
  
  // Tipo de enemigo
  type: {
    type: String,
    enum: ['normal', 'elite', 'boss', 'raid'],
    default: 'normal'
  },
  
  // Nivel y dificultad
  level: {
    type: Number,
    required: true,
    min: 1
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'extreme'],
    default: 'medium'
  },
  
  // Estadísticas de combate
  stats: {
    health: { type: Number, required: true, min: 1 },
    maxHealth: { type: Number, required: true, min: 1 },
    mana: { type: Number, default: 0 },
    maxMana: { type: Number, default: 0 },
    strength: { type: Number, default: 10 },
    intelligence: { type: Number, default: 10 },
    dexterity: { type: Number, default: 10 },
    defense: { type: Number, default: 10 }
  },
  
  // Ataques y habilidades
  attacks: [{
    name: { type: String, required: true },
    description: { type: String, default: '' },
    damageType: { 
      type: String, 
      enum: ['physical', 'magical', 'fire', 'ice', 'lightning', 'poison', 'holy', 'dark'],
      default: 'physical'
    },
    baseDamage: { type: Number, required: true },
    scaling: {
      stat: { type: String, enum: ['strength', 'intelligence', 'dexterity'], default: 'strength' },
      multiplier: { type: Number, default: 1.0 }
    },
    effects: [{
      type: { 
        type: String,
        enum: ['stun', 'poison', 'burn', 'freeze', 'bleed', 'heal', 'buff', 'debuff'],
        required: true
      },
      chance: { type: Number, min: 0, max: 100, default: 100 },
      duration: { type: Number, default: 1 }, // En turnos
      value: { type: Number, default: 0 }, // Daño por turno o cantidad de curación/buff
      targetStat: { type: String, default: null } // Para buffs/debuffs
    }],
    cooldown: { type: Number, default: 0 }, // En turnos
    manaCost: { type: Number, default: 0 },
    useChance: { type: Number, min: 0, max: 100, default: 50 } // Probabilidad de que el enemigo use este ataque
  }],
  
  // Debilidades y resistencias
  resistances: {
    physical: { type: Number, default: 0 }, // Porcentaje (-100 a 100)
    magical: { type: Number, default: 0 },
    fire: { type: Number, default: 0 },
    ice: { type: Number, default: 0 },
    lightning: { type: Number, default: 0 },
    poison: { type: Number, default: 0 },
    holy: { type: Number, default: 0 },
    dark: { type: Number, default: 0 }
  },
  
  // Drops y recompensas
  drops: {
    experience: { type: Number, required: true, min: 0 },
    currency: { type: Number, required: true, min: 0 },
    items: [{
      itemId: { type: String, required: true },
      quantity: { type: Number, default: 1 },
      dropChance: { type: Number, min: 0, max: 100, default: 100 } // Porcentaje
    }]
  },
  
  // Comportamiento en combate
  behavior: {
    aggressiveness: { type: Number, min: 1, max: 10, default: 5 }, // 1: defensivo, 10: agresivo
    intelligence: { type: Number, min: 1, max: 10, default: 5 }, // 1: aleatorio, 10: estratégico
    fleeThreshold: { type: Number, min: 0, max: 100, default: 0 }, // % de vida para huir
    prioritizeWeakTargets: { type: Boolean, default: false },
    useHealingWhenBelow: { type: Number, min: 0, max: 100, default: 30 } // % de vida
  },
  
  // Servidor al que pertenece
  serverId: {
    type: String,
    required: true
  },
  
  // Estado (habilitado o no)
  enabled: {
    type: Boolean,
    default: true
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
EnemySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Asegurarse de que maxHealth sea al menos igual a health
  if (this.stats.health > this.stats.maxHealth) {
    this.stats.maxHealth = this.stats.health;
  }
  
  next();
});

// Método estático para obtener enemigos aleatorios según nivel
EnemySchema.statics.getRandomByLevel = async function(serverId, level, count = 1, type = 'normal') {
  const levelRange = {
    min: Math.max(1, level - 2),
    max: level + 2
  };
  
  const enemies = await this.find({
    serverId: serverId,
    level: { $gte: levelRange.min, $lte: levelRange.max },
    type: type,
    enabled: true
  }).limit(count * 3); // Obtener más para poder seleccionar aleatoriamente
  
  if (enemies.length === 0) {
    // Si no hay enemigos en el rango, buscar cualquier enemigo cercano
    return await this.find({
      serverId: serverId,
      enabled: true
    }).sort({ level: 1 }).limit(count);
  }
  
  // Seleccionar aleatoriamente
  const selectedEnemies = [];
  for (let i = 0; i < Math.min(count, enemies.length); i++) {
    const randomIndex = Math.floor(Math.random() * enemies.length);
    selectedEnemies.push(enemies[randomIndex]);
    enemies.splice(randomIndex, 1); // Eliminar para evitar duplicados
  }
  
  return selectedEnemies;
};

module.exports = mongoose.model('Enemy', EnemySchema);