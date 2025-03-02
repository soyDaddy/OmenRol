const express = require('express');
const router = express.Router();
const TriviaQuestion = require('../../models/TriviaQuestion');
const Server = require('../../models/Server');

// Middleware para verificar si el usuario está autenticado
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Guardar la URL original para redirigir después del inicio de sesión
  req.session.redirectTo = req.originalUrl;
  res.redirect('/login');
};

// Middleware para verificar si el usuario es administrador de un servidor
const isGuildAdmin = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  
  const { serverId } = req.params;
  
  // Verificar si el usuario tiene permiso para administrar este servidor
  const userGuild = req.user.guilds.find(g => g.id === serverId);
  
  // Si no encontramos el servidor en los servidores del usuario
  if (!userGuild) {
    return res.status(403).render('error', {
      title: 'Acceso denegado',
      message: 'No tienes acceso a este servidor',
      status: 403
    });
  }
  
  // Verificar si es admin o propietario del servidor
  const isAdmin = (userGuild.permissions & 0x8) === 0x8; // 0x8 es el flag de ADMINISTRATOR
  const isOwner = userGuild.owner === true;
  
  if (!isAdmin && !isOwner) {
    return res.status(403).render('error', {
      title: 'Acceso denegado',
      message: 'No tienes permisos de administrador en este servidor',
      status: 403
    });
  }
  
  next();
};

// Middleware para verificar si el servidor existe
const checkServerExists = async (req, res, next) => {
  try {
    const server = await Server.findOne({ serverId: req.params.serverId });
    
    if (!server) {
      return res.status(404).render('error', {
        title: 'Servidor no encontrado',
        message: 'El servidor solicitado no existe.',
        status: 404
      });
    }
    
    req.server = server;
    next();
  } catch (error) {
    console.error('Error al verificar servidor:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error al verificar el servidor.',
      status: 500
    });
  }
};

// Listar preguntas de trivia (globales y del servidor)
router.get('/servers/:serverId/trivia', isAuthenticated, isGuildAdmin, checkServerExists, async (req, res) => {
  try {
    const { serverId } = req.params;
    const server = req.server;
    
    // Obtener parámetros de filtrado y paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Filtros
    const filters = {
      $or: [
        { createdInServerId: serverId, isGlobal: false }, // Preguntas específicas de este servidor
        { isGlobal: true } // Preguntas globales
      ]
    };
    
    if (req.query.category) {
      filters.category = req.query.category;
    }
    
    if (req.query.difficulty) {
      filters.difficulty = req.query.difficulty;
    }
    
    if (req.query.search) {
      filters.question = { $regex: req.query.search, $options: 'i' };
    }
    
    // Obtener las preguntas
    const questions = await TriviaQuestion.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Contar el total de preguntas que coinciden con los filtros
    const totalQuestions = await TriviaQuestion.countDocuments(filters);
    
    // Obtener las categorías únicas para el filtro
    const categories = await TriviaQuestion.distinct('category');
    
    res.render('servers/trivia', {
      title: 'Preguntas de Trivia',
      server,
      req,
      questions,
      categories,
      currentPage: page,
      totalPages: Math.ceil(totalQuestions / limit),
      totalQuestions,
      filters: {
        category: req.query.category || '',
        difficulty: req.query.difficulty || '',
        search: req.query.search || ''
      }
    });
  } catch (error) {
    console.error('Error al listar preguntas de trivia:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error al cargar las preguntas de trivia.',
      status: 500
    });
  }
});

// Ver estadísticas de preguntas de trivia
router.get('/servers/:serverId/trivia/stats', isAuthenticated, isGuildAdmin, checkServerExists, async (req, res) => {
  try {
    const { serverId } = req.params;
    const server = req.server;
    
    // Obtener estadísticas generales
    const stats = {
      total: await TriviaQuestion.countDocuments({ createdInServerId: serverId }),
      globalTotal: await TriviaQuestion.countDocuments({ isGlobal: true }),
      serverOnlyTotal: await TriviaQuestion.countDocuments({ createdInServerId: serverId, isGlobal: false }),
      byCategory: [],
      byDifficulty: [],
      topAsked: [],
      topCorrect: [],
      topWrong: []
    };
    
    // Obtener distribución por categoría
    const categoryStats = await TriviaQuestion.aggregate([
      { $match: { createdInServerId: serverId } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    stats.byCategory = categoryStats;
    
    // Obtener distribución por dificultad
    const difficultyStats = await TriviaQuestion.aggregate([
      { $match: { createdInServerId: serverId } },
      { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    stats.byDifficulty = difficultyStats;
    
    // Obtener preguntas más preguntadas
    const topAsked = await TriviaQuestion.find({ createdInServerId: serverId })
      .sort({ 'stats.timesAsked': -1 })
      .limit(5);
    
    stats.topAsked = topAsked;
    
    // Obtener preguntas con más respuestas correctas
    const topCorrect = await TriviaQuestion.find({ createdInServerId: serverId })
      .sort({ 'stats.timesCorrect': -1 })
      .limit(5);
    
    stats.topCorrect = topCorrect;
    
    // Obtener preguntas con más respuestas incorrectas
    const topWrong = await TriviaQuestion.find({ createdInServerId: serverId })
      .sort({ 'stats.timesWrong': -1 })
      .limit(5);
    
    stats.topWrong = topWrong;
    
    res.render('servers/triviaStats', {
      title: 'Estadísticas de Trivia',
      server,
      req,
      stats
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de trivia:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error al cargar las estadísticas de trivia.',
      status: 500
    });
  }
});

// Crear nueva pregunta de trivia
router.get('/servers/:serverId/trivia/new', isAuthenticated, isGuildAdmin, checkServerExists, (req, res) => {
  const { serverId } = req.params;
  const server = req.server;
  
  res.render('servers/triviaNew', {
    title: 'Nueva Pregunta de Trivia',
    server,
    req,
    question: null,
    isGlobal: req.query.global === 'true'
  });
});

// Procesar el formulario de nueva pregunta
router.post('/servers/:serverId/trivia/new', isAuthenticated, isGuildAdmin, checkServerExists, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { question, options, answer, difficulty, category, isGlobal } = req.body;
    
    // Validar campos
    if (!question || !options || answer === undefined || !difficulty || !category) {
      return res.status(400).render('servers/triviaNew', {
        title: 'Nueva Pregunta de Trivia',
        server: req.server,
        question: req.body,
        isGlobal: isGlobal === 'true',
        error: 'Todos los campos son requeridos'
      });
    }
    
    // Convertir opciones a array si viene como string
    const optionsArray = Array.isArray(options) ? options : options.split('\n').filter(opt => opt.trim());
    
    // Validar número de opciones
    if (optionsArray.length < 2 || optionsArray.length > 4) {
      return res.status(400).render('servers/triviaNew', {
        title: 'Nueva Pregunta de Trivia',
        server: req.server,
        question: req.body,
        isGlobal: isGlobal === 'true',
        error: 'Debe haber entre 2 y 4 opciones'
      });
    }
    
    // Validar índice de respuesta correcta
    const answerIndex = parseInt(answer);
    if (isNaN(answerIndex) || answerIndex < 0 || answerIndex >= optionsArray.length) {
      return res.status(400).render('servers/triviaNew', {
        title: 'Nueva Pregunta de Trivia',
        server: req.server,
        question: req.body,
        isGlobal: isGlobal === 'true',
        error: 'El índice de la respuesta correcta es inválido'
      });
    }
    
    // Crear nueva pregunta
    const triviaQuestion = new TriviaQuestion({
      createdInServerId: serverId, // Siempre guardamos el servidor donde se creó
      isGlobal: isGlobal === 'true', // Si es global o solo para este servidor
      question,
      options: optionsArray,
      answer: answerIndex,
      difficulty,
      category,
      createdBy: req.user.id
    });
    
    await triviaQuestion.save();
    
    res.redirect(`/servers/${serverId}/trivia?success=true`);
  } catch (error) {
    console.error('Error al crear pregunta de trivia:', error);
    res.status(500).render('servers/triviaNew', {
      title: 'Nueva Pregunta de Trivia',
      server: req.server,
      question: req.body,
      isGlobal: req.body.isGlobal === 'true',
      error: 'Error al guardar la pregunta: ' + error.message
    });
  }
});

// Ver/Editar pregunta existente
router.get('/servers/:serverId/trivia/:questionId', isAuthenticated, isGuildAdmin, checkServerExists, async (req, res) => {
  try {
    const { serverId, questionId } = req.params;
    const server = req.server;
    
    // Obtener la pregunta
    const question = await TriviaQuestion.findById(questionId);
    
    if (!question) {
      return res.status(404).render('error', {
        title: 'Pregunta no encontrada',
        message: 'La pregunta solicitada no existe.',
        status: 404
      });
    }
    
    // Verificar que la pregunta pertenezca al servidor o sea global
    if (question.createdInServerId !== serverId && !question.isGlobal) {
      return res.status(403).render('error', {
        title: 'Acceso denegado',
        message: 'No tienes permiso para ver esta pregunta.',
        status: 403
      });
    }
    
    res.render('servers/triviaEdit', {
      title: 'Editar Pregunta de Trivia',
      server,
      req,
      question,
      isGlobal: question.isGlobal
    });
  } catch (error) {
    console.error('Error al obtener pregunta de trivia:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error al cargar la pregunta de trivia.',
      status: 500
    });
  }
});

// Actualizar pregunta existente
router.post('/servers/:serverId/trivia/:questionId', isAuthenticated, isGuildAdmin, checkServerExists, async (req, res) => {
  try {
    const { serverId, questionId } = req.params;
    const { question, options, answer, difficulty, category, isGlobal, enabled } = req.body;
    
    // Obtener la pregunta existente
    const triviaQuestion = await TriviaQuestion.findById(questionId);
    
    if (!triviaQuestion) {
      return res.status(404).render('error', {
        title: 'Pregunta no encontrada',
        message: 'La pregunta solicitada no existe.',
        status: 404
      });
    }
    
    // Verificar que la pregunta pertenezca al servidor
    if (triviaQuestion.createdInServerId !== serverId) {
      return res.status(403).render('error', {
        title: 'Acceso denegado',
        message: 'No tienes permiso para editar esta pregunta.',
        status: 403
      });
    }
    
    // Validar campos
    if (!question || !options || answer === undefined || !difficulty || !category) {
      return res.status(400).render('servers/triviaEdit', {
        title: 'Editar Pregunta de Trivia',
        server: req.server,
        question: triviaQuestion,
        isGlobal: triviaQuestion.isGlobal,
        error: 'Todos los campos son requeridos'
      });
    }
    
    // Convertir opciones a array si viene como string
    const optionsArray = Array.isArray(options) ? options : options.split('\n').filter(opt => opt.trim());
    
    // Validar número de opciones
    if (optionsArray.length < 2 || optionsArray.length > 4) {
      return res.status(400).render('servers/triviaEdit', {
        title: 'Editar Pregunta de Trivia',
        server: req.server,
        question: triviaQuestion,
        isGlobal: triviaQuestion.isGlobal,
        error: 'Debe haber entre 2 y 4 opciones'
      });
    }
    
    // Validar índice de respuesta correcta
    const answerIndex = parseInt(answer);
    if (isNaN(answerIndex) || answerIndex < 0 || answerIndex >= optionsArray.length) {
      return res.status(400).render('servers/triviaEdit', {
        title: 'Editar Pregunta de Trivia',
        server: req.server,
        question: triviaQuestion,
        isGlobal: triviaQuestion.isGlobal,
        error: 'El índice de la respuesta correcta es inválido'
      });
    }
    
    // Actualizar la pregunta
    triviaQuestion.question = question;
    triviaQuestion.options = optionsArray;
    triviaQuestion.answer = answerIndex;
    triviaQuestion.difficulty = difficulty;
    triviaQuestion.category = category;
    triviaQuestion.isGlobal = isGlobal === 'true' || isGlobal === true;
    triviaQuestion.enabled = enabled === 'on' || enabled === true;
    
    await triviaQuestion.save();
    
    res.redirect(`/servers/${serverId}/trivia?success=true`);
  } catch (error) {
    console.error('Error al actualizar pregunta de trivia:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error al actualizar la pregunta de trivia: ' + error.message,
      status: 500
    });
  }
});

// Eliminar pregunta
router.post('/servers/:serverId/trivia/:questionId/delete', isAuthenticated, isGuildAdmin, checkServerExists, async (req, res) => {
  try {
    const { serverId, questionId } = req.params;
    
    // Obtener la pregunta
    const question = await TriviaQuestion.findById(questionId);
    
    if (!question) {
      return res.status(404).json({ error: 'Pregunta no encontrada' });
    }
    
    // Verificar que la pregunta pertenezca al servidor
    if (question.createdInServerId !== serverId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta pregunta' });
    }
    
    // Eliminar la pregunta
    await TriviaQuestion.findByIdAndDelete(questionId);
    
    res.redirect(`/servers/${serverId}/trivia?deleted=true`);
  } catch (error) {
    console.error('Error al eliminar pregunta de trivia:', error);
    res.status(500).json({ error: 'Error al eliminar la pregunta' });
  }
});

// Importar preguntas en masa
router.post('/servers/:serverId/trivia/import', isAuthenticated, isGuildAdmin, checkServerExists, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { questions, isGlobal } = req.body;
    
    // Verificar formato de las preguntas (debe ser JSON o líneas separadas en un formato específico)
    let questionsToImport = [];
    
    try {
      // Intentar parsear como JSON
      questionsToImport = JSON.parse(questions);
    } catch (e) {
      // Si falla, considerar que es un formato personalizado (líneas separadas)
      return res.status(400).render('servers/triviaImport', {
        title: 'Importar Preguntas de Trivia',
        server: req.server,
        error: 'El formato de las preguntas es inválido. Debe ser un objeto JSON válido.'
      });
    }
    
    // Validar formato de las preguntas
    if (!Array.isArray(questionsToImport)) {
      return res.status(400).render('servers/triviaImport', {
        title: 'Importar Preguntas de Trivia',
        server: req.server,
        error: 'El formato de las preguntas es inválido. Debe ser un array de preguntas.'
      });
    }
    
    // Validar cada pregunta
    const validQuestions = questionsToImport.filter(q => 
      q.question && 
      Array.isArray(q.options) && 
      q.options.length >= 2 && 
      q.options.length <= 4 &&
      typeof q.answer === 'number' &&
      q.answer >= 0 &&
      q.answer < q.options.length
    );
    
    if (validQuestions.length === 0) {
      return res.status(400).render('servers/triviaImport', {
        title: 'Importar Preguntas de Trivia',
        server: req.server,
        error: 'No se encontraron preguntas válidas para importar.'
      });
    }
    
    // Importar preguntas
    const importedQuestions = [];
    
    for (const q of validQuestions) {
      const triviaQuestion = new TriviaQuestion({
        createdInServerId: serverId,
        isGlobal: isGlobal === 'true',
        question: q.question,
        options: q.options,
        answer: q.answer,
        difficulty: q.difficulty || 'medio',
        category: q.category || 'General',
        createdBy: req.user.id
      });
      
      await triviaQuestion.save();
      importedQuestions.push(triviaQuestion);
    }
    
    res.redirect(`/servers/${serverId}/trivia?imported=${importedQuestions.length}`);
  } catch (error) {
    console.error('Error al importar preguntas de trivia:', error);
    res.status(500).render('servers/triviaImport', {
      title: 'Importar Preguntas de Trivia',
      server: req.server,
      error: 'Error al importar las preguntas: ' + error.message
    });
  }
});

// Exportar preguntas
router.get('/servers/:serverId/trivia/export', isAuthenticated, isGuildAdmin, checkServerExists, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { format = 'json', scope = 'server' } = req.query;
    
    // Determinar el filtro según el alcance solicitado
    let filter = {};
    
    if (scope === 'server') {
      filter = { createdInServerId: serverId, isGlobal: false };
    } else if (scope === 'global') {
      filter = { isGlobal: true };
    } else if (scope === 'all') {
      filter = {
        $or: [
          { createdInServerId: serverId, isGlobal: false },
          { isGlobal: true }
        ]
      };
    } else if (scope === 'created') {
      filter = { createdInServerId: serverId };
    }
    
    // Obtener las preguntas
    const questions = await TriviaQuestion.find(filter)
      .select('-_id -__v -createdInServerId -createdBy -stats -createdAt -updatedAt')
      .lean();
    
    // Formatear según lo solicitado
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=trivia-questions-${scope}.json`);
      return res.json(questions);
    } else if (format === 'csv') {
      // Convertir a CSV
      const csvRows = [];
      
      // Encabezados
      csvRows.push(['question', 'options', 'answer', 'difficulty', 'category', 'isGlobal'].join(','));
      
      // Datos
      for (const q of questions) {
        const row = [
          `"${q.question.replace(/"/g, '""')}"`,
          `"${q.options.map(o => o.replace(/"/g, '""')).join('|')}"`,
          q.answer,
          q.difficulty,
          `"${q.category.replace(/"/g, '""')}"`,
          q.isGlobal
        ];
        
        csvRows.push(row.join(','));
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=trivia-questions-${scope}.csv`);
      return res.send(csvRows.join('\n'));
    }
    
    // Si el formato no es reconocido, devolver JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=trivia-questions-${scope}.json`);
    res.json(questions);
  } catch (error) {
    console.error('Error al exportar preguntas de trivia:', error);
    res.status(500).json({ error: 'Error al exportar las preguntas' });
  }
});

// Obtener página de importación
router.get('/servers/:serverId/trivia/import', isAuthenticated, isGuildAdmin, checkServerExists, (req, res) => {
  const { serverId } = req.params;
  const server = req.server;
  
  res.render('servers/triviaImport', {
    title: 'Importar Preguntas de Trivia',
    req,
    server
  });
});

module.exports = router;