const express = require('express');
const router = express.Router();
const botClient = require('../../bot/index');
const User = require('../../models/User');
const Server = require('../../models/Server');
const Profile = require('../../models/Profile');
const config = require('../config');

// Panel de administración principal
router.get('/', async (req, res) => {
  try {
    // Recopilar estadísticas generales para el panel de control
    const userCount = await User.countDocuments();
    const serverCount = await Server.countDocuments();
    const profileCount = await Profile.countDocuments();
    
    // Estadísticas del bot
    const botStats = {
      servers: botClient ? botClient.guilds.cache.size : 0,
      users: botClient ? botClient.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0) : 0,
      uptime: botClient ? Math.floor(botClient.uptime / 1000 / 60 / 60) : 0, // Horas
      commands: botClient ? botClient.commands.size + botClient.slashCommands.size : 0
    };
    
    // Obtener los últimos usuarios registrados
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Obtener los últimos servidores registrados
    const recentServers = await Server.find()
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.render('admin/index', {
      title: 'Panel de Administración',
      userCount,
      req,
      serverCount,
      profileCount,
      botStats,
      recentUsers,
      recentServers
    });
  } catch (error) {
    console.error('Error al cargar el panel de administración:', error);
    res.redirect('/error?message=Error al cargar el panel de administración&status=500');
  }
});

// Gestión de usuarios
router.get('/users', async (req, res) => {
  try {
    // Parámetros de paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Filtros opcionales
    const filters = {};
    
    if (req.query.search) {
      filters.$or = [
        { username: { $regex: req.query.search, $options: 'i' } },
        { id: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    // Obtener usuarios con paginación
    const users = await User.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Contar el total de usuarios para la paginación
    const totalUsers = await User.countDocuments(filters);
    
    res.render('admin/users', {
      title: 'Gestión de Usuarios',
      users,
      req,
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers,
      search: req.query.search || ''
    });
  } catch (error) {
    console.error('Error al cargar la gestión de usuarios:', error);
    res.redirect('/error?message=Error al cargar la gestión de usuarios&status=500');
  }
});

// Ver detalles de un usuario
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Obtener el usuario
    const user = await User.findById(userId);
    
    if (!user) {
      return res.redirect('/error?message=Usuario no encontrado&status=404');
    }
    
    // Obtener los perfiles del usuario
    const profiles = await Profile.find({ userId: user.discordId });
    
    // Enriquecer los perfiles con información de los servidores
    const enrichedProfiles = await Promise.all(profiles.map(async profile => {
      const server = await Server.findOne({ serverId: profile.serverId });
      
      return {
        ...profile,
        server: server ? {
          name: server.name,
          serverId: server.serverId,
          icon: server.icon
        } : {
          name: 'Servidor desconocido',
          icon: null
        }
      };
    }));
    
    res.render('admin/userView', {
      title: `Usuario - ${user.username}`,
      user,
      req,
      profiles: enrichedProfiles,
      avatarURL: user.avatar ? config.discord.userAvatarURL(user.id, user.avatar) : '/assets/img/default-avatar.png'
    });
  } catch (error) {
    console.error('Error al cargar los detalles del usuario:', error);
    res.redirect('/error?message=Error al cargar los detalles del usuario&status=500');
  }
});

// Gestión de servidores
router.get('/servers', async (req, res) => {
  try {
    // Parámetros de paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Filtros opcionales
    const filters = {};
    
    if (req.query.search) {
      filters.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { serverId: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    // Obtener servidores con paginación
    const servers = await Server.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Contar el total de servidores para la paginación
    const totalServers = await Server.countDocuments(filters);
    
    // Enriquecer los servidores con información adicional
    const enrichedServers = await Promise.all(servers.map(async server => {
      const profileCount = await Profile.countDocuments({ serverId: server.serverId });
      const isActive = botClient ? botClient.guilds.cache.has(server.serverId) : false;
      
      return {
        ...server.toObject(),
        profileCount,
        isActive
      };
    }));
    
    res.render('admin/servers', {
      title: 'Gestión de Servidores',
      servers: enrichedServers,
      currentPage: page,
      req,
      totalPages: Math.ceil(totalServers / limit),
      totalServers,
      search: req.query.search || ''
    });
  } catch (error) {
    console.error('Error al cargar la gestión de servidores:', error);
    res.redirect('/error?message=Error al cargar la gestión de servidores&status=500');
  }
});

// Ver detalles de un servidor
router.get('/servers/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    
    // Obtener la configuración del servidor
    const server = await Server.findById(serverId);
    
    if (!server) {
      return res.redirect('/error?message=Servidor no encontrado&status=404');
    }
    
    // Obtener todos los perfiles del servidor
    const profiles = await Profile.find({ serverId: server.serverId });
    
    // Comprobar si el bot está activo en el servidor
    const isActive = botClient ? botClient.guilds.cache.has(server.serverId) : false;
    
    // Si el bot está activo, obtener información adicional
    let guildInfo = null;
    
    if (isActive && botClient) {
      const guild = botClient.guilds.cache.get(server.serverId);
      
      guildInfo = {
        memberCount: guild.memberCount,
        channels: guild.channels.cache.size,
        roles: guild.roles.cache.size
      };
    }
    
    res.render('admin/serverView', {
      title: `Servidor - ${server.name}`,
      server,
      req,
      profiles,
      profileCount: profiles.length,
      isActive,
      guildInfo
    });
  } catch (error) {
    console.error('Error al cargar los detalles del servidor:', error);
    res.redirect('/error?message=Error al cargar los detalles del servidor&status=500');
  }
});

// Configuración global del sistema
router.get('/settings', async (req, res) => {
  try {
    res.render('admin/settings', {
      title: 'Configuración Global',
      req,
      config
    });
  } catch (error) {
    console.error('Error al cargar la configuración global:', error);
    res.redirect('/error?message=Error al cargar la configuración global&status=500');
  }
});

// Logs del sistema
router.get('/logs', async (req, res) => {
  try {
    // Aquí se implementaría un sistema de logs
    // Este es un ejemplo simplificado
    
    const logs = [
      { timestamp: new Date(), level: 'info', message: 'Sistema iniciado correctamente', source: 'system' },
      { timestamp: new Date(Date.now() - 3600000), level: 'warning', message: 'Alta carga de CPU detectada', source: 'system' },
      { timestamp: new Date(Date.now() - 7200000), level: 'error', message: 'Error de conexión con Discord API', source: 'bot' }
    ];
    
    res.render('admin/logs', {
      title: 'Logs del Sistema',
      req,
      logs
    });
  } catch (error) {
    console.error('Error al cargar los logs del sistema:', error);
    res.redirect('/error?message=Error al cargar los logs del sistema&status=500');
  }
});

module.exports = router;