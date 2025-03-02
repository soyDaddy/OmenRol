const mongoose = require('mongoose');

// Esquema para razas
const RaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  image: {
    type: String,
    default: null
  },
  
  // Estadísticas base para esta raza
  baseStats: {
    health: { type: Number, default: 100 },
    mana: { type: Number, default: 50 },
    strength: { type: Number, default: 10 },
    intelligence: { type: Number, default: 10 },
    dexterity: { type: Number, default: 10 },
    defense: { type: Number, default: 10 }
  },
  
  // Lista de clases permitidas para esta raza
  allowedClasses: {
    type: [String],
    default: [] // Vacío significa todas las clases permitidas
  },
  
  // Habilidades raciales (IDs de habilidades)
  racialSkills: {
    type: [String],
    default: []
  },
  
  serverId: {
    type: String,
    required: true
  },
  
  enabled: {
    type: Boolean,
    default: true
  }
});

// Esquema para clases
const ClassSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  image: {
    type: String,
    default: null
  },
  
  // Modificadores de estadísticas para esta clase
  statModifiers: {
    health: { type: Number, default: 0 },
    mana: { type: Number, default: 0 },
    strength: { type: Number, default: 0 },
    intelligence: { type: Number, default: 0 },
    dexterity: { type: Number, default: 0 },
    defense: { type: Number, default: 0 }
  },
  
  // Habilidades base de la clase (IDs de habilidades)
  classSkills: {
    type: [String],
    default: []
  },
  
  // Restricciones de equipamiento
  equipmentRestrictions: {
    type: [String],
    default: [] // Tipos de equipamiento restringidos
  },
  
  serverId: {
    type: String,
    required: true
  },
  
  enabled: {
    type: Boolean,
    default: true
  }
});

// Crear los modelos
const Race = mongoose.model('Race', RaceSchema);
const Class = mongoose.model('Class', ClassSchema);

module.exports = {
  Race,
  Class
};