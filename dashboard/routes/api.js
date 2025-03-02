const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Server = require('../../models/Server');
const Profile = require('../../models/Profile');
const botClient = require('../../bot/index');

// Middleware para verificar autenticación mediante token API
const apiAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Se requiere clave API' });
  }
  
  // Para una implementación real, deberías validar la API key contra una base de datos
  // Este es un ejemplo básico
  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({ error: 'Clave API inválida' });
  }
  
  next();
};

// Middleware para verificar autenticación de usuario por session
const sessionAuth = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  
  next();
};

// Rutas públicas (requieren API key)

// Estado del bot
router.get('/status', apiAuth, (req, res) => {
  if (!botClient) {
    return res.status(503).json({ status: 'offline' });
  }
  
  res.json({
    status: 'online',
    uptime: botClient.uptime,
    guilds: botClient.guilds.cache.size,
    users: botClient.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
  });
});

// Estadísticas generales
router.get('/stats', apiAuth, async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const serverCount = await Server.countDocuments();
    const profileCount = await Profile.countDocuments();
    
    res.json({
      users: userCount,
      servers: serverCount,
      profiles: profileCount,
      date: new Date()
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Rutas de usuario (requieren autenticación de sesión)

// Perfil del usuario actual
router.get('/me', sessionAuth, async (req, res) => {
  try {
    const user = req.user;
    
    // Eliminar información sensible
    const safeUser = {
      id: user._id,
      discordId: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      guilds: user.guilds.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner
      }))
    };
    
    res.json(safeUser);
  } catch (error) {
    console.error('Error al obtener perfil de usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Perfiles de roleplay del usuario actual
router.get('/me/profiles', sessionAuth, async (req, res) => {
  try {
    const profiles = await Profile.find({ userId: req.user.id });
    
    res.json(profiles);
  } catch (error) {
    console.error('Error al obtener perfiles de usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener perfil de roleplay específico
router.get('/profiles/:profileId', sessionAuth, async (req, res) => {
  try {
    const { profileId } = req.params;
    
    const profile = await Profile.findById(profileId);
    
    if (!profile) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }
    
    // Verificar que el perfil pertenece al usuario o es un administrador global
    if (profile.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'No tienes permiso para ver este perfil' });
    }
    
    res.json(profile);
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar perfil de roleplay
router.patch('/profiles/:profileId', sessionAuth, async (req, res) => {
  try {
    const { profileId } = req.params;
    
    const profile = await Profile.findById(profileId);
    
    if (!profile) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }
    
    // Verificar que el perfil pertenece al usuario o es un administrador global
    if (profile.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'No tienes permiso para editar este perfil' });
    }
    
    // Obtener la configuración del servidor para verificar si se permite editar perfiles
    const serverConfig = await Server.findOne({ serverId: profile.serverId });
    
    if (!serverConfig) {
      return res.status(404).json({ error: 'Servidor no encontrado' });
    }
    
    // Verificar si se permite la edición de perfiles
    if (!serverConfig.config.allowProfileEditing && !req.user.isAdmin) {
      return res.status(403).json({ error: 'La edición de perfiles está desactivada en este servidor' });
    }
    
    // Campos que se pueden actualizar
    const updatableFields = [
      'character.name',
      'character.avatar',
      'character.bio',
      'preferences.theme',
      'preferences.visibility',
      'preferences.customTitle',
      'preferences.notifications'
    ];
    
    // Actualizar solo los campos permitidos
    Object.keys(req.body).forEach(key => {
      if (updatableFields.includes(key)) {
        const keys = key.split('.');
        if (keys.length === 2) {
          profile[keys[0]][keys[1]] = req.body[key];
        }
      }
    });
    
    // Actualizar la fecha de modificación
    profile.updatedAt = Date.now();
    
    await profile.save();
    
    res.json(profile);
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener configuración de un servidor
router.get('/servers/:serverId', sessionAuth, async (req, res) => {
  try {
    const { serverId } = req.params;
    
    // Verificar que el usuario tenga acceso a este servidor
    const userGuild = req.user.guilds.find(g => g.id === serverId);
    
    if (!userGuild && !req.user.isAdmin) {
      return res.status(403).json({ error: 'No tienes acceso a este servidor' });
    }
    
    // Verificar si el usuario es admin del servidor
    const isAdmin = (userGuild && ((userGuild.permissions & 0x8) === 0x8 || userGuild.owner)) || req.user.isAdmin;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId });
    
    if (!serverConfig) {
      return res.status(404).json({ error: 'Servidor no encontrado' });
    }
    
    // Si no es admin, enviar solo información limitada
    if (!isAdmin) {
      const limitedConfig = {
        name: serverConfig.name,
        roleplay: {
          enabled: serverConfig.roleplay.enabled,
          races: serverConfig.roleplay.races,
          classes: serverConfig.roleplay.classes
        },
        entertainment: {
          enabled: serverConfig.entertainment.enabled
        }
      };
      
      return res.json(limitedConfig);
    }
    
    // Si es admin, enviar la configuración completa
    res.json(serverConfig);
  } catch (error) {
    console.error('Error al obtener configuración del servidor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener perfiles de un servidor (solo para admins)
router.get('/servers/:serverId/profiles', sessionAuth, async (req, res) => {
  try {
    const { serverId } = req.params;
    
    // Verificar que el usuario tenga acceso a este servidor como admin
    const userGuild = req.user.guilds.find(g => g.id === serverId);
    const isAdmin = (userGuild && ((userGuild.permissions & 0x8) === 0x8 || userGuild.owner)) || req.user.isAdmin;
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'No tienes permisos de administrador en este servidor' });
    }
    
    // Obtener todos los perfiles del servidor
    const profiles = await Profile.find({ serverId });
    
    res.json(profiles);
  } catch (error) {
    console.error('Error al obtener perfiles del servidor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Manejador de errores
router.use((err, req, res, next) => {
  console.error('Error en la API:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = router;