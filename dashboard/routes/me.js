const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Profile = require('../../models/Profile');
const config = require('../config');

// Perfil del usuario
router.get('/', async (req, res) => {
  try {
    // Obtener todos los perfiles del usuario en diferentes servidores
    const profiles = await Profile.find({ userId: req.user.id });
    
    // Enriquecer los perfiles con información de los servidores
    const enrichedProfiles = profiles.map(profile => {
      const guild = req.user.guilds.find(g => g.id === profile.serverId) || { 
        name: 'Servidor desconocido',
        icon: null
      };
      
      return {
        ...profile.toObject(),
        guild: {
          id: profile.serverId,
          name: guild.name,
          icon: guild.icon ? config.discord.guildIconURL(guild.id, guild.icon) : '/img/empty-servers.svg'
        }
      };
    });
    
    res.render('me/index', {
      title: 'Mi Perfil',
      user: req.user,
      req,
      profiles: enrichedProfiles,
      avatarURL: req.user.avatar ? config.discord.userAvatarURL(req.user.id, req.user.avatar) : '/img/empty-avatar.svg'
    });
  } catch (error) {
    console.error('Error al obtener el perfil del usuario:', error);
    res.redirect('/error?message=Error al cargar tu perfil&status=500');
  }
});

// Configuración del usuario
router.get('/settings', async (req, res) => {
  try {
    res.render('me/settings', {
      title: 'Mis Configuraciones',
      req,
      user: req.user,
      avatarURL: req.user.avatar ? config.discord.userAvatarURL(req.user.id, req.user.avatar) : 'https://cdn.discordapp.com/embed/avatars/0.png'
    });
  } catch (error) {
    console.error('Error al obtener la configuración del usuario:', error);
    res.redirect('/error?message=Error al cargar tus configuraciones&status=500');
  }
});

// Actualizar configuración del usuario
router.post('/settings', async (req, res) => {
  try {
    // Actualizar preferencias del usuario
    // (Esto sería una implementación básica; en una aplicación real podrían almacenarse más preferencias)
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.redirect('/error?message=Usuario no encontrado&status=404');
    }
    
    // Guardar cualquier configuración que se desee implementar
    // Por ejemplo, tema de la interfaz, notificaciones, etc.
    
    // Confirmar actualización
    res.redirect('/me/settings?success=true');
  } catch (error) {
    console.error('Error al actualizar la configuración del usuario:', error);
    res.redirect('/me/settings?error=true');
  }
});

// Ver un perfil específico del usuario
router.get('/profiles/:profileId', async (req, res) => {
  try {
    const { profileId } = req.params;
    
    // Obtener el perfil
    const profile = await Profile.findById(profileId);
    
    if (!profile) {
      return res.redirect('/error?message=Perfil no encontrado&status=404');
    }
    
    // Obtener información del servidor
    const guild = req.user.guilds.find(g => g.id === profile.serverId) || { 
      name: 'Servidor desconocido',
      icon: null
    };
    
    const guildInfo = {
      id: profile.serverId,
      name: guild.name,
      icon: guild.icon ? config.discord.guildIconURL(guild.id, guild.icon) : '/img/empty-servers.svg'
    };
    
    res.render('me/profileView', {
      title: `Perfil - ${profile.character.name || 'Sin nombre'}`,
      user: req.user,
      req,
      profile,
      guild: guildInfo,
      avatarURL: req.user.avatar ? config.discord.userAvatarURL(req.user.id, req.user.avatar) : 'https://cdn.discordapp.com/embed/avatars/0.png'
    });
  } catch (error) {
    console.error('Error al obtener el perfil:', error);
    res.redirect('/error?message=Error al cargar el perfil&status=500');
  }
});

// Historial de actividad del usuario
router.get('/activity', async (req, res) => {
  try {
    // Aquí se podría implementar un sistema para mostrar el historial de actividad
    // Por ejemplo, servidores visitados, perfiles actualizados, etc.
    
    res.render('me/activity', {
      title: 'Mi Actividad',
      user: req.user,
      req,
      avatarURL: req.user.avatar ? config.discord.userAvatarURL(req.user.id, req.user.avatar) : '/assets/img/default-avatar.png',
      activities: [] // Aquí se agregarían las actividades del usuario
    });
  } catch (error) {
    console.error('Error al obtener la actividad del usuario:', error);
    res.redirect('/error?message=Error al cargar tu actividad&status=500');
  }
});

// Inventario del usuario (para todos sus perfiles)
router.get('/inventory', async (req, res) => {
  try {
    // Obtener todos los perfiles del usuario
    const profiles = await Profile.find({ userId: req.user.id });
    
    // Recopilar todos los items de inventario de todos los perfiles
    const inventoryItems = [];
    
    profiles.forEach(profile => {
      if (profile.character.inventory && profile.character.inventory.length > 0) {
        const guild = req.user.guilds.find(g => g.id === profile.serverId) || { 
          name: 'Servidor desconocido'
        };
        
        profile.character.inventory.forEach(item => {
          inventoryItems.push({
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            guildName: guild.name,
            serverId: profile.serverId,
            profileId: profile._id,
            characterName: profile.character.name
          });
        });
      }
    });
    
    res.render('me/inventory', {
      title: 'Mi Inventario',
      user: req.user,
      req,
      inventoryItems,
      avatarURL: req.user.avatar ? config.discord.userAvatarURL(req.user.id, req.user.avatar) : '/assets/img/default-avatar.png'
    });
  } catch (error) {
    console.error('Error al obtener el inventario del usuario:', error);
    res.redirect('/error?message=Error al cargar tu inventario&status=500');
  }
});

// Estadísticas del usuario
router.get('/stats', async (req, res) => {
  try {
    // Obtener todos los perfiles del usuario
    const profiles = await Profile.find({ userId: req.user.id });
    
    // Calcular estadísticas generales
    const totalServers = profiles.length;
    const totalCurrency = profiles.reduce((sum, profile) => sum + profile.character.currency, 0);
    const highestLevel = Math.max(...profiles.map(profile => profile.character.level), 0);
    const totalExperience = profiles.reduce((sum, profile) => sum + profile.character.experience, 0);
    
    // Calcular estadísticas de juegos (si existen)
    const gameStats = {
      totalWins: profiles.reduce((sum, profile) => sum + (profile.stats?.wins || 0), 0),
      totalLosses: profiles.reduce((sum, profile) => sum + (profile.stats?.losses || 0), 0),
      totalQuestsCompleted: profiles.reduce((sum, profile) => sum + (profile.stats?.quests?.completed || 0), 0),
      totalQuestsFailed: profiles.reduce((sum, profile) => sum + (profile.stats?.quests?.failed || 0), 0)
    };
    
    res.render('me/stats', {
      title: 'Mis Estadísticas',
      user: req.user,
      req,
      totalServers,
      totalCurrency,
      highestLevel,
      totalExperience,
      gameStats,
      profiles,
      avatarURL: req.user.avatar ? config.discord.userAvatarURL(req.user.id, req.user.avatar) : '/assets/img/default-avatar.png'
    });
  } catch (error) {
    console.error('Error al obtener las estadísticas del usuario:', error);
    res.redirect('/error?message=Error al cargar tus estadísticas&status=500');
  }
});

module.exports = router;