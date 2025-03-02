// Log.js - Modelo para los registros de actividad
const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  // Servidor donde ocurrió la acción
  serverId: {
    type: String,
    required: true,
    index: true
  },
  
  // Usuario que realizó la acción
  userId: {
    type: String,
    required: true,
    index: true
  },
  
  // Información del usuario (para mostrar en la UI sin consultar Discord)
  user: {
    tag: String,  // username#0000 o solo username en Discord nuevo
    avatar: String // URL del avatar
  },
  
  // Fecha y hora de la acción
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Tipo de acción (command, moderation, roleplay, system, etc.)
  type: {
    type: String,
    required: true,
    index: true
  },
  
  // Acción realizada (comando ejecutado, acción moderativa, etc.)
  action: {
    type: String,
    required: true
  },
  
  // Canal donde ocurrió la acción
  channelId: String,
  
  // Detalles adicionales (específicos para cada tipo de acción)
  details: mongoose.Schema.Types.Mixed
});

// Índice compuesto para búsquedas comunes
logSchema.index({ serverId: 1, timestamp: -1 });
logSchema.index({ serverId: 1, type: 1, timestamp: -1 });
logSchema.index({ serverId: 1, userId: 1, timestamp: -1 });

module.exports = mongoose.model('Log', logSchema);