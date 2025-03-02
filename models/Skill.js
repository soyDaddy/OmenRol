const mongoose = require('mongoose');

const SkillSchema = new mongoose.Schema({
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
  
  // Imagen/icono de la habilidad (opcional)
  image: {
    type: String,
    default: null
  },
  
  // Restricciones
  raceRestrictions: {
    type: [String],
    default: [] // Vacío significa disponible para todas las razas
  },
  classRestrictions: {
    type: [String],
    default: [] // Vacío significa disponible para todas las clases
  },
  levelRequired: {
    type: Number,
    default: 1,
    min: 1
  },
  
  // Mecánicas de la habilidad
  manaCost: {
    type: Number,
    default: 0,
    min: 0
  },
  cooldown: {
    type: Number, // En minutos
    default: 0,
    min: 0
  },
  
  // Límite de usos
  maxUses: {
    type: Number,
    default: 0 // 0 significa usos ilimitados
  },
  usesPerDay: {
    type: Number,
    default: 0 // 0 significa sin límite diario
  },
  
  // Efectos de la habilidad
  effects: {
    damage: { type: Number, default: 0 },
    healing: { type: Number, default: 0 },
    buffStrength: { type: Number, default: 0 },
    buffIntelligence: { type: Number, default: 0 },
    buffDexterity: { type: Number, default: 0 },
    buffDefense: { type: Number, default: 0 },
    duration: { type: Number, default: 0 } // Duración en minutos, 0 es efecto inmediato
  },
  
  // Categoría de habilidad
  category: {
    type: String,
    enum: ['attack', 'defense', 'healing', 'utility', 'passive', 'debuff', 'buff'],
    default: 'utility'
  },
  
  // Tipo de objetivo
  targetType: {
    type: String,
    enum: ['self', 'single', 'area', 'all'],
    default: 'self'
  },
  
  // Servidor al que pertenece la habilidad
  serverId: {
    type: String,
    required: true
  },
  
  // Si la habilidad está habilitada o no
  enabled: {
    type: Boolean,
    default: true
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

// Middleware pre-save para actualizar la fecha de modificación
SkillSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Skill', SkillSchema);