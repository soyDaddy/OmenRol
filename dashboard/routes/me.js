const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Activity = require('../../models/Activity');
const { formatDateRelative, groupActivitiesByDate } = require('../../utils/dateHelpers');
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
    // Obtener el usuario con sus configuraciones
    const user = await User.findOne({ discordId: req.user.id });
    
    if (!user) {
      return res.redirect('/error?message=Usuario no encontrado&status=404');
    }
    
    // Asegurarse de que el objeto de configuración existe
    const settings = user.settings || {};
    
    // Preparar los datos para la plantilla
    const userData = {
      ...req.user,
      settings: {
        // Preferencias
        theme: settings.theme || 'default',
        displayMode: settings.displayMode || 'detailed',
        language: settings.language || 'es',
        dateFormat: settings.dateFormat || 'dd/mm/yyyy',
        fontSize: settings.fontSize || 'medium',
        compactMode: settings.compactMode || false,
        reduceMotion: settings.reduceMotion || false,
        highContrast: settings.highContrast || false,
        
        // Notificaciones
        notifications: {
          notifyMessages: settings.notifications?.notifyMessages !== false,
          notifyEvents: settings.notifications?.notifyEvents !== false,
          notifyUpdates: settings.notifications?.notifyUpdates !== false,
          notifyQuests: settings.notifications?.notifyQuests !== false,
          notifyMentions: settings.notifications?.notifyMentions !== false,
          mode: settings.notifications?.mode || 'all'
        },
        
        // Privacidad
        privacy: {
          profileVisibility: settings.privacy?.profileVisibility || 'private',
          activityVisibility: settings.privacy?.activityVisibility || 'private',
          showOnlineStatus: settings.privacy?.showOnlineStatus !== false,
          allowFriendRequests: settings.privacy?.allowFriendRequests !== false,
          shareCharacterStats: settings.privacy?.shareCharacterStats || false
        }
      }
    };
    
    res.render('me/settings', {
      title: 'Mis Configuraciones',
      req,
      user: userData,
      success: req.query.success === 'true',
      error: req.query.error === 'true',
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
    // Obtener la sección que se está actualizando
    const { section } = req.body;
    
    // Buscar el usuario en la base de datos
    const user = await User.findOne({ discordId: req.user.id });
    
    if (!user) {
      return res.redirect('/error?message=Usuario no encontrado&status=404');
    }
    
    // Inicializar objeto de configuración si no existe
    if (!user.settings) {
      user.settings = {};
    }
    
    // Actualizar configuraciones según la sección
    switch (section) {
      case 'preferences':
        // Actualizar preferencias de apariencia
        user.settings.theme = req.body.theme || 'default';
        user.settings.displayMode = req.body.displayMode || 'detailed';
        user.settings.language = req.body.language || 'es';
        user.settings.dateFormat = req.body.dateFormat || 'dd/mm/yyyy';
        user.settings.fontSize = req.body.fontSize || 'medium';
        user.settings.compactMode = req.body.compactMode === 'on';
        user.settings.reduceMotion = req.body.reduceMotion === 'on';
        user.settings.highContrast = req.body.highContrast === 'on';
        break;
        
      case 'notifications':
        // Asegurarse de que existe el objeto notifications
        if (!user.settings.notifications) {
          user.settings.notifications = {};
        }
        
        // Actualizar preferencias de notificaciones
        user.settings.notifications.notifyMessages = req.body.notifyMessages === 'on';
        user.settings.notifications.notifyEvents = req.body.notifyEvents === 'on';
        user.settings.notifications.notifyUpdates = req.body.notifyUpdates === 'on';
        user.settings.notifications.notifyQuests = req.body.notifyQuests === 'on';
        user.settings.notifications.notifyMentions = req.body.notifyMentions === 'on';
        user.settings.notifications.mode = req.body.notificationMode || 'all';
        break;
        
      case 'privacy':
        // Asegurarse de que existe el objeto privacy
        if (!user.settings.privacy) {
          user.settings.privacy = {};
        }
        
        // Actualizar configuraciones de privacidad
        user.settings.privacy.profileVisibility = req.body.profileVisibility || 'private';
        user.settings.privacy.activityVisibility = req.body.activityVisibility || 'private';
        user.settings.privacy.showOnlineStatus = req.body.showOnlineStatus === 'on';
        user.settings.privacy.allowFriendRequests = req.body.allowFriendRequests === 'on';
        user.settings.privacy.shareCharacterStats = req.body.shareCharacterStats === 'on';
        break;
        
      default:
        // Sin sección específica, no actualizamos nada
        break;
    }
    
    // Guardar cambios en la base de datos
    await user.save();
    
    // Redirigir con mensaje de éxito
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

router.get('/activity', async (req, res) => {
  try {
    // Obtener parámetros de filtrado
    const { server, type, date, page = 1 } = req.query;
    const limit = 15;
    
    // Obtener actividades del usuario con filtros aplicados
    const { activities, pagination } = await Activity.getActivities(
      req.user.id,
      { server, type, date },
      parseInt(page),
      limit
    );
    
    // Obtener resumen de actividades
    const summary = await Activity.getActivitySummary(req.user.id);
    
    // Obtener datos para gráficos
    const chartData = await Activity.getActivityCharts(req.user.id);
    
    // Preparar y agrupar actividades por fecha para mostrar en la timeline
    const groupedActivities = groupActivitiesByDate(activities);

    // Renderizar vista
    res.render('me/activity', {
      title: 'Mi Historial de Actividad',
      user: req.user,
      activities,
      groupedActivities,
      summary,
      require,
      chartData,
      server,
      type,
      date,
      pagination,
      req,
      avatarURL: req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : '/img/default-avatar.png'
    });
  } catch (error) {
    console.error('Error al obtener el historial de actividad:', error);
    res.redirect('/error?message=Error al cargar el historial de actividad&status=500');
  }
});

// Exportar datos de actividad
router.get('/activity/export', async (req, res) => {
  try {
    // Obtener todas las actividades del usuario
    const { activities } = await Activity.getActivities(
      req.user.id,
      {},
      1,
      1000  // Limitar a 1000 actividades para la exportación
    );
    
    // Formatear actividades para exportación
    const exportData = activities.map(activity => ({
      tipo: translateActivityType(activity.type),
      servidor: activity.serverName,
      accion: activity.action,
      exito: activity.success ? 'Sí' : 'No',
      recompensas: formatRewards(activity.rewards),
      fecha: new Date(activity.timestamp).toLocaleString()
    }));
    
    // Enviar como archivo JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=mis-actividades.json');
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('Error al exportar actividades:', error);
    res.redirect('/me/activity?error=export');
  }
});

// Cargar más actividades (para AJAX)
router.get('/activity/load-more', async (req, res) => {
  try {
    const { server, type, date, page = 1 } = req.query;
    
    // Obtener más actividades
    const { activities, pagination } = await Activity.getActivities(
      req.user.id,
      { server, type, date },
      parseInt(page),
      10
    );
    
    // Preparar y agrupar actividades por fecha
    const groupedActivities = groupActivitiesByDate(activities);
    
    // Devolver HTML renderizado para las nuevas actividades
    res.render('me/partials/activity-items', {
      groupedActivities,
      require,
      user: req.user
    });
  } catch (error) {
    console.error('Error al cargar más actividades:', error);
    res.status(500).send('Error al cargar más actividades');
  }
});

// Función auxiliar para traducir tipo de actividad
function translateActivityType(type) {
  const types = {
    command: 'Comando',
    quest: 'Misión',
    combat: 'Combate',
    levelup: 'Subida de nivel',
    item: 'Objeto',
    currency: 'Monedas'
  };
  
  return types[type] || type;
}

// Función auxiliar para formatear recompensas
function formatRewards(rewards) {
  if (!rewards || rewards.length === 0) {
    return 'Ninguna';
  }
  
  return rewards.map(reward => {
    if (reward.type === 'currency') {
      return `${reward.value} monedas`;
    } else if (reward.type === 'exp') {
      return `${reward.value} exp`;
    } else if (reward.type === 'item') {
      return `${reward.name} x${reward.quantity || 1}`;
    }
    return '';
  }).join(', ');
}

module.exports = router;