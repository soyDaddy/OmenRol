const mongoose = require('mongoose');

const triviaQuestionSchema = new mongoose.Schema({
  // ID del servidor donde se creó la pregunta
  createdInServerId: {
    type: String,
    required: true,
    index: true
  },
  
  // Si es global, aparecerá en todos los servidores
  isGlobal: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Pregunta
  question: {
    type: String,
    required: true
  },
  
  // Opciones (múltiples)
  options: {
    type: [String],
    required: true,
    validate: {
      validator: function(v) {
        return v.length >= 2 && v.length <= 4; // Al menos 2 opciones, máximo 4
      },
      message: 'Debe haber entre 2 y 4 opciones'
    }
  },
  
  // Índice de la respuesta correcta (0-based)
  answer: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(v) {
        return v < this.options.length; // El índice debe ser válido
      },
      message: 'El índice de la respuesta debe ser válido'
    }
  },
  
  // Dificultad
  difficulty: {
    type: String,
    enum: ['fácil', 'medio', 'difícil'],
    default: 'medio'
  },
  
  // Categoría
  category: {
    type: String,
    default: 'General'
  },
  
  // Habilitada/Deshabilitada
  enabled: {
    type: Boolean,
    default: true
  },
  
  // Estadísticas
  stats: {
    timesAsked: {
      type: Number,
      default: 0
    },
    timesCorrect: {
      type: Number,
      default: 0
    },
    timesWrong: {
      type: Number,
      default: 0
    }
  },

  // Creador de la pregunta
  createdBy: {
    type: String,  // Discord ID del usuario
    required: true
  },
  
  // Marcas de tiempo
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Actualizar la marca de tiempo 'updatedAt' antes de guardar
triviaQuestionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('TriviaQuestion', triviaQuestionSchema);