const express = require('express');
const router = express.Router();
const botClient = require('../../bot/index');
const config = require('../config');

// Página de inicio
router.get('/', (req, res) => {
  // Obtener estadísticas del bot
  const botStats = {
    servers: botClient ? botClient.guilds.cache.size : 0,
    users: botClient ? botClient.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0) : 0,
    uptime: botClient ? (botClient.uptime / 1000 / 60 / 60).toFixed(2) : 0,
    comandos: botClient ? botClient.commands.size + botClient.slashCommands.size : 0
  };
  
  res.render('index', {
    title: 'Inicio',
    req,
    botStats,
    inviteUrl: config.discord.inviteURL(config.clientId, config.permissions)
  });
});

// Página de comandos
router.get('/commands', (req, res) => {
  let categories = {};
  let allCategories = [];
  
  if (botClient) {
    // Agrupar comandos por categoría
    botClient.commands.forEach(cmd => {
      if (!categories[cmd.category] && !allCategories[cmd.category]) {
        categories[cmd.category] = [];
        allCategories[cmd.category] = [];
      }
      categories[cmd.category].push(cmd);
    });
    
    // Añadir comandos slash
    botClient.slashCommands.forEach(cmd => {
      if (!categories[cmd.category] && !allCategories[cmd.category]) {
        categories[cmd.category] = [];
        allCategories[cmd.category] = [];
      }
      // Evitar duplicados si el comando tiene versión tradicional y slash
      if (!categories[cmd.category].find(c => c.name === cmd.name)) {
        categories[cmd.category].push(cmd);
      }
    });
  }

  if (req.query.category) {
    categories = {};
    botClient.commands.filter(cmd => cmd.category === req.query.category).forEach(cmd => {
      if (!categories[cmd.category]) {
        categories[cmd.category] = [];
      }
      categories[cmd.category].push(cmd);
    });
    
    // Añadir comandos slash
    botClient.slashCommands.filter(cmd => cmd.category === req.query.category).forEach(cmd => {
      if (!categories[cmd.category]) {
        categories[cmd.category] = [];
      }
      if (!categories[req.query.category].find(c => c.name === cmd.name)) {
        categories[req.query.category].push(cmd);
      }
    });
  }
  
  
  res.render('commands', {
    title: 'Comandos',
    req,
    allCategories,
    categories
  });
});

router.get('/guide', (req,res) => {
  res.render('guide', {
    title: 'Guia de Uso',
    req
  })
})

// Página de invitación
router.get('/invite', (req, res) => {
  res.render('invite', {
    title: 'Invitar Bot',
    req,
    inviteUrl: config.discord.inviteURL(config.clientId, config.permissions)
  });
});

// Servidor de soporte
router.get('/support', (req, res) => {
  res.redirect('https://discord.gg/hYQWbxjMUt');
})

// Página de login
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/me');
  }
  
  res.render('login', {
    title: 'Iniciar Sesión',
    req
  });
});

// Página de privacidad
router.get('/legal/privacy', (req, res) => {
  res.render('legal/privacy', {
    title: 'Política de Privacidad',
    req
  });
});

// Página de términos
router.get('/legal/terms', (req, res) => {
  res.render('legal/terms', {
    title: 'Términos de Servicio',
    req
  });
});

// Página de error
router.get('/error', (req, res) => {
  res.render('error', {
    title: 'Error',
    req,
    message: req.query.message || 'Ha ocurrido un error inesperado.',
    status: req.query.status || 500
  });
});

module.exports = router;