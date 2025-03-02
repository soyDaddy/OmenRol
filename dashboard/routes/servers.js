const express = require('express');
const router = express.Router();
const { PermissionsBitField } = require('discord.js');
const botClient = require('../../bot/index');
const Server = require('../../models/Server');
const Item = require('../../models/Items');
const Skill = require('../../models/Skill');
const { Mission, Adventure } = require('../../models/Missions');
const { Race, Class } = require('../../models/Razas');
const Profile = require('../../models/Profile');
const profileUtils = require('../../utils/profileUtils');
const Logs = require('../../models/Logs');
const config = require('../config');

// Middleware para verificar si el bot está en el servidor
const checkBotInGuild = async (req, res, next) => {
  const { guildId } = req.params;
  
  if (!botClient) {
    return res.redirect('/error?message=El bot no está disponible en este momento&status=503');
  }
  
  const guild = botClient.guilds.cache.get(guildId);

  if (!guild) {
    return res.render('servers/invite', {
      title: 'Invitar Bot',
      req,
      guild: req.user.guilds.filter(g => g.id === guildId).map(guild => ({
        ...guild,
        icon: guild.icon ? config.discord.guildIconURL(guild.id, guild.icon) : '/img/empty-servers.svg'
      }))[0],
      inviteUrl: config.discord.inviteURL(config.clientId, config.permissions) + `&guild_id=${guildId}&disable_guild_select=true`
    });
  }
  
  // Guardar el objeto guild en req para uso posterior
  req.guild = guild;
  next();
};

// Middleware para verificar si el usuario tiene permisos de administrador
const isGuildAdmin = (req, res, next) => {
  const { guildId } = req.params;
  const userGuild = req.user.guilds.find(g => g.id === guildId);
  
  if (userGuild && ( (userGuild?.permissions & 0x8) === 0x8 || userGuild?.owner || config.adminUsers.includes(req.user.id) )) {
    return next();
  }
  
  res.status(403).render('error', {
    title: 'Acceso denegado',
    message: 'No tienes permisos para administrar este servidor.',
    status: 403
  });
};

// Lista de servidores del usuario
router.get('/', async (req, res) => {
  try {

    await botClient.guilds.fetch();
    // Filtrar servidores donde el usuario tiene permisos de administrador
    const adminGuilds = req.user.guilds.filter(g => 
      (g.permissions & 0x8) === 0x8 || g.owner
    );
    
    // Para cada servidor, verificar si el bot está presente
    const guildsWithBot = adminGuilds.map(guild => {
      const botInGuild = botClient.guilds.cache.has(guild.id);
      return {
        ...guild,
        botInGuild,
        iconURL: guild.icon ? config.discord.guildIconURL(guild.id, guild.icon) : '/img/empty-servers.svg'
      };
    });
    
    res.render('servers/index', {
      title: 'Mis Servidores',
      guilds: guildsWithBot,
      req,
      inviteUrl: config.discord.inviteURL(config.clientId, config.permissions)
    });
  } catch (error) {
    console.error('Error al obtener servidores:', error);
    res.redirect('/error?message=Error al obtener la lista de servidores&status=500');
  }
});

// Panel de un servidor
router.get('/:guildId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener configuración del servidor
    let serverConfig = await Server.findOne({ serverId: guildId });
    
    if (!serverConfig) {
      // Si no existe, crear nueva configuración
      serverConfig = new Server({
        serverId: guildId,
        name: guild.name,
        icon: guild.iconURL(),
        ownerId: guild.ownerId
      });
      
      await serverConfig.save();
    }
    
    // Obtener estadísticas adicionales
    const memberCount = guild.memberCount;
    const channelCount = guild.channels.cache.size;
    const roleCount = guild.roles.cache.size;
    
    // Obtener conteo de perfiles de roleplay
    const profileCount = await Profile.countDocuments({ serverId: guildId });
    
    res.render('servers/dashboard', {
      title: `Panel - ${guild.name}`,
      guild,
      serverConfig,
      req,
      stats: {
        members: memberCount,
        channels: channelCount,
        roles: roleCount,
        profiles: profileCount
      }
    });
  } catch (error) {
    console.error('Error al obtener el panel del servidor:', error);
    res.redirect('/error?message=Error al cargar el panel del servidor&status=500');
  }
});

// Invitar al bot al servidor
router.get('/:guildId/invite', checkBotInGuild, (req, res) => {
  const { guildId } = req.params;
  const guild = req.guild;
  
  res.render('servers/invite', {
    title: 'Invitar Bot',
    guild,
    req,
    inviteUrl: config.discord.inviteURL(config.clientId, config.permissions) + `&guild_id=${guildId}&disable_guild_select=true`
  });
});

// Configuración general del servidor
router.get('/:guildId/settings', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener canales y roles para los selectores
    const channels = guild.channels.cache
      .filter(c => c.type === 0) // Solo canales de texto
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const roles = guild.roles.cache
      .filter(r => !r.managed && r.id !== guild.id) // Excluir roles gestionados y @everyone
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
      .sort((a, b) => b.position - a.position);
    
    res.render('servers/settings', {
      title: `Configuración - ${guild.name}`,
      guild,
      req,
      serverConfig,
      channels,
      roles
    });
  } catch (error) {
    console.error('Error al obtener la configuración del servidor:', error);
    res.redirect('/error?message=Error al cargar la configuración del servidor&status=500');
  }
});

// Actualizar configuración general
router.post('/:guildId/settings', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Obtener configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    if (!serverConfig) {
      return res.redirect('/error?message=No se encontró la configuración del servidor&status=404');
    }
    
    // Actualizar configuración básica
    serverConfig.config.prefix = req.body.prefix || '!';
    serverConfig.config.language = req.body.language || 'es';
    
    // Actualizar configuración de automod
    serverConfig.config.automod.enabled = req.body.automodEnabled === 'on';
    serverConfig.config.automod.bannedWords = req.body.bannedWords
      ? req.body.bannedWords.split(',').map(word => word.trim())
      : [];
    serverConfig.config.automod.spamThreshold = parseInt(req.body.spamThreshold) || 5;
    
    // Actualizar roles administrativos
    serverConfig.config.adminRoles = Array.isArray(req.body.adminRoles)
      ? req.body.adminRoles
      : req.body.adminRoles
        ? [req.body.adminRoles]
        : [];
    
    serverConfig.config.modRoles = Array.isArray(req.body.modRoles)
      ? req.body.modRoles
      : req.body.modRoles
        ? [req.body.modRoles]
        : [];
    
    // Actualizar configuración de perfiles
    serverConfig.config.allowProfileEditing = req.body.allowProfileEditing === 'on';
    
    // Actualizar la fecha de modificación
    serverConfig.updatedAt = Date.now();
    
    await serverConfig.save();

    global.logger.logConfigChange(
      guildId,
      req.user.id,
      'general_settings',
      {
        previous: previousConfig,
        current: {
          prefix: serverConfig.config.prefix,
          language: serverConfig.config.language,
          automod: serverConfig.config.automod,
          allowProfileEditing: serverConfig.config.allowProfileEditing
        },
        fields: Object.keys(req.body)
      }
    );
    
    res.redirect(`/servers/${guildId}/settings?success=true`);
  } catch (error) {
    console.error('Error al actualizar la configuración del servidor:', error);
    res.redirect(`/servers/${req.params.guildId}/settings?error=true`);
  }
});

// Configuración del sistema de rol
router.get('/:guildId/roleplay', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener canales para los selectores
    const channels = guild.channels.cache
      .filter(c => c.type === 0) // Solo canales de texto
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    res.render('servers/roleplay', {
      title: `Sistema de Rol - ${guild.name}`,
      guild,
      req,
      serverConfig,
      channels
    });
  } catch (error) {
    console.error('Error al obtener la configuración de rol:', error);
    res.redirect('/error?message=Error al cargar la configuración de rol&status=500');
  }
});

// Actualizar configuración de rol
router.post('/:guildId/roleplay', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Obtener configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    if (!serverConfig) {
      return res.redirect('/error?message=No se encontró la configuración del servidor&status=404');
    }
    
    // Actualizar configuración de roleplay
    serverConfig.roleplay.enabled = req.body.roleplayEnabled === 'on';
    serverConfig.roleplay.startingCurrency = parseInt(req.body.startingCurrency) || 100;
    
    // Actualizar razas disponibles
    serverConfig.roleplay.races = req.body.races
      ? req.body.races.split(',').map(race => race.trim())
      : ['Humano', 'Elfo', 'Enano', 'Orco', 'Tiefling'];
    
    // Actualizar clases disponibles
    serverConfig.roleplay.classes = req.body.classes
      ? req.body.classes.split(',').map(cls => cls.trim())
      : ['Guerrero', 'Mago', 'Ladrón', 'Clérigo', 'Bardo'];
    
    // Actualizar canales de rol
    serverConfig.roleplay.questChannels = Array.isArray(req.body.questChannels)
      ? req.body.questChannels
      : req.body.questChannels
        ? [req.body.questChannels]
        : [];
    
    serverConfig.roleplay.roleplayChannels = Array.isArray(req.body.roleplayChannels)
      ? req.body.roleplayChannels
      : req.body.roleplayChannels
        ? [req.body.roleplayChannels]
        : [];
    
    // Actualizar la fecha de modificación
    serverConfig.updatedAt = Date.now();
    
    await serverConfig.save();
    
    res.redirect(`/servers/${guildId}/roleplay?success=true`);
  } catch (error) {
    console.error('Error al actualizar la configuración de rol:', error);
    res.redirect(`/servers/${req.params.guildId}/roleplay?error=true`);
  }
});

// Configuración del sistema de entretenimiento
router.get('/:guildId/entertainment', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener canales para los selectores
    const channels = guild.channels.cache
      .filter(c => c.type === 0) // Solo canales de texto
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    res.render('servers/entertainment', {
      title: `Sistema de Entretenimiento - ${guild.name}`,
      guild,
      req,
      serverConfig,
      channels
    });
  } catch (error) {
    console.error('Error al obtener la configuración de entretenimiento:', error);
    res.redirect('/error?message=Error al cargar la configuración de entretenimiento&status=500');
  }
});

// Actualizar configuración de entretenimiento
router.post('/:guildId/entertainment', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Obtener configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    if (!serverConfig) {
      return res.redirect('/error?message=No se encontró la configuración del servidor&status=404');
    }
    
    // Actualizar configuración de entretenimiento
    serverConfig.entertainment.enabled = req.body.entertainmentEnabled === 'on';
    serverConfig.entertainment.welcomeChannel = req.body.welcomeChannel || '';
    
    // Actualizar canales de entretenimiento
    serverConfig.entertainment.musicChannels = Array.isArray(req.body.musicChannels)
      ? req.body.musicChannels
      : req.body.musicChannels
        ? [req.body.musicChannels]
        : [];
    
    serverConfig.entertainment.gameChannels = Array.isArray(req.body.gameChannels)
      ? req.body.gameChannels
      : req.body.gameChannels
        ? [req.body.gameChannels]
        : [];
    
    // Manejar comandos personalizados
    // (Esto se manejaría con ajax en una implementación real para mejor UX)
    
    // Actualizar la fecha de modificación
    serverConfig.updatedAt = Date.now();
    
    await serverConfig.save();
    
    res.redirect(`/servers/${guildId}/entertainment?success=true`);
  } catch (error) {
    console.error('Error al actualizar la configuración de entretenimiento:', error);
    res.redirect(`/servers/${req.params.guildId}/entertainment?error=true`);
  }
});

// Gestión de perfiles de rol
router.get('/:guildId/profiles', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener todos los perfiles del servidor
    const profiles = await Profile.find({ serverId: guildId });
    
    // Si no hay perfiles, mostrar mensaje
    if (profiles.length === 0) {
      return res.render('servers/profiles', {
        title: `Perfiles - ${guild.name}`,
        guild,
        req,
        profiles: [],
        message: 'No hay perfiles creados en este servidor todavía.'
      });
    }
    
    // Enriquecer los perfiles con información de miembros del servidor
    const enrichedProfiles = [];
    
    for (const profile of profiles) {
      try {
        // Intentar obtener el miembro del servidor
        const member = await guild.members.fetch(profile.userId).catch(() => null);
        
        enrichedProfiles.push({
          ...profile.toObject(),
          user: member ? {
            tag: `${member.user.username}${member.user.discriminator ? `#${member.user.discriminator}` : ''}`,
            avatar: member.user.displayAvatarURL(),
            isInServer: true
          } : {
            tag: 'Usuario desconocido',
            avatar: '/assets/img/default-avatar.png',
            isInServer: false
          }
        });
      } catch (err) {
        console.error(`Error al obtener miembro ${profile.userId}:`, err);
        
        // Añadir el perfil con información mínima
        enrichedProfiles.push({
          ...profile.toObject(),
          user: {
            tag: 'Usuario desconocido',
            avatar: '/assets/img/default-avatar.png',
            isInServer: false
          }
        });
      }
    }
    
    res.render('servers/profiles', {
      title: `Perfiles - ${guild.name}`,
      req,
      guild,
      profiles: enrichedProfiles
    });
  } catch (error) {
    console.error('Error al obtener los perfiles:', error);
    res.redirect('/error?message=Error al cargar los perfiles&status=500');
  }
});

// Ver un perfil específico
router.get('/:guildId/profiles/:profileId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, profileId } = req.params;
    const guild = req.guild;
    
    // Obtener el perfil
    const profile = await Profile.findById(profileId);
    
    if (!profile || profile.serverId !== guildId) {
      return res.redirect('/error?message=Perfil no encontrado&status=404');
    }
    
    // Obtener información del usuario
    let user = {
      tag: 'Usuario desconocido',
      avatar: '/assets/img/default-avatar.png',
      isInServer: false
    };
    
    try {
      const member = await guild.members.fetch(profile.userId).catch(() => null);
      if (member) {
        user = {
          tag: `${member.user.username}${member.user.discriminator ? `#${member.user.discriminator}` : ''}`,
          avatar: member.user.displayAvatarURL(),
          isInServer: true
        };
      }
    } catch (err) {
      console.error(`Error al obtener miembro ${profile.userId}:`, err);
    }
    
    // Obtener la configuración del servidor para razas y clases disponibles
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    res.render('servers/profileView', {
      title: `Perfil de ${profile.character.name || user.tag}`,
      guild,
      profile,
      req,
      user,
      serverConfig
    });
  } catch (error) {
    console.error('Error al obtener el perfil:', error);
    res.redirect('/error?message=Error al cargar el perfil&status=500');
  }
});

// Editar un perfil específico
router.get('/:guildId/profiles/:profileId/edit', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, profileId } = req.params;
    const guild = req.guild;
    
    // Obtener el perfil
    const profile = await Profile.findById(profileId);
    
    if (!profile || profile.serverId !== guildId) {
      return res.redirect('/error?message=Perfil no encontrado&status=404');
    }
    
    // Obtener información del usuario
    let user = {
      tag: 'Usuario desconocido',
      avatar: '/assets/img/default-avatar.png',
      isInServer: false
    };
    
    try {
      const member = await guild.members.fetch(profile.userId).catch(() => null);
      if (member) {
        user = {
          tag: `${member.user.username}${member.user.discriminator ? `#${member.user.discriminator}` : ''}`,
          avatar: member.user.displayAvatarURL(),
          isInServer: true
        };
      }
    } catch (err) {
      console.error(`Error al obtener miembro ${profile.userId}:`, err);
    }
    
    // Obtener la configuración del servidor para razas y clases disponibles
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    res.render('servers/profileEdit', {
      title: `Editar Perfil - ${profile.character.name || user.tag}`,
      guild,
      profile,
      req,
      user,
      serverConfig
    });
  } catch (error) {
    console.error('Error al obtener el perfil para editar:', error);
    res.redirect('/error?message=Error al cargar el perfil para editar&status=500');
  }
});

// Actualizar un perfil específico
router.post('/:guildId/profiles/:profileId/edit', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, profileId } = req.params;
    
    // Obtener el perfil
    const profile = await Profile.findById(profileId);
    
    if (!profile || profile.serverId !== guildId) {
      return res.redirect('/error?message=Perfil no encontrado&status=404');
    }
    
    // Actualizar datos del personaje
    profile.character.name = req.body.characterName || profile.character.name;
    profile.character.avatar = req.body.characterAvatar || profile.character.avatar;
    profile.character.race = req.body.race || profile.character.race;
    profile.character.class = req.body.class || profile.character.class;
    profile.character.age = parseInt(req.body.age) || profile.character.age;
    profile.character.level = parseInt(req.body.level) || profile.character.level;
    profile.character.experience = parseInt(req.body.experience) || profile.character.experience;
    profile.character.health.current = parseInt(req.body.currentHealth) || profile.character.health.current;
    profile.character.health.max = parseInt(req.body.maxHealth) || profile.character.health.max;
    profile.character.currency = parseInt(req.body.currency) || profile.character.currency;
    profile.character.bio = req.body.bio || profile.character.bio;
    
    // Actualizar la fecha de modificación
    profile.updatedAt = Date.now();
    
    await profile.save();
    
    res.redirect(`/servers/${guildId}/profiles/${profileId}?success=true`);
  } catch (error) {
    console.error('Error al actualizar el perfil:', error);
    res.redirect(`/servers/${req.params.guildId}/profiles/${req.params.profileId}/edit?error=true`);
  }
});

// Eliminar un perfil específico
router.post('/:guildId/profiles/:profileId/delete', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, profileId } = req.params;
    
    // Obtener el perfil
    const profile = await Profile.findById(profileId);
    
    if (!profile || profile.serverId !== guildId) {
      return res.redirect('/error?message=Perfil no encontrado&status=404');
    }
    
    // Eliminar el perfil
    await Profile.findByIdAndDelete(profileId);
    
    res.redirect(`/servers/${guildId}/profiles?deleted=true`);
  } catch (error) {
    console.error('Error al eliminar el perfil:', error);
    res.redirect(`/servers/${req.params.guildId}/profiles?error=true`);
  }
});

// Página de perfil para usuarios normales
router.get('/:guildId/profile', checkBotInGuild, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Buscar el perfil del usuario
    const profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    res.render('servers/userProfile', {
      title: profile ? 'Mi Perfil' : 'Crear Perfil',
      guild,
      req,
      profile,
      serverConfig
    });
  } catch (error) {
    console.error('Error al obtener el perfil del usuario:', error);
    res.redirect('/error?message=Error al cargar tu perfil&status=500');
  }
});

// Crear/Actualizar el perfil del usuario
router.post('/:guildId/profile', checkBotInGuild, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Buscar el perfil existente
    let profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    if (!serverConfig) {
      return res.redirect('/error?message=No se encontró la configuración del servidor&status=404');
    }
    
    // Verificar si se permite la edición de perfiles
    if (profile && !serverConfig.config.allowProfileEditing) {
      // Verificar si el usuario es admin o tiene un rol admin/mod
      const guild = req.guild;
      const member = await guild.members.fetch(req.user.id).catch(() => null);
      
      if (!member || 
          !(member.permissions.has('ADMINISTRATOR') || 
            serverConfig.config.adminRoles.some(role => member.roles.cache.has(role)) ||
            serverConfig.config.modRoles.some(role => member.roles.cache.has(role)))) {
        return res.render('servers/userProfile', {
          title: 'Mi Perfil',
          guild,
          req,
          profile,
          serverConfig,
          error: 'La edición de perfiles está desactivada en este servidor.'
        });
      }
    }
    
    // Guardar los datos anteriores para el registro de cambios
    const previousData = profile ? {
      name: profile.character.name,
      race: profile.character.race,
      class: profile.character.class,
      avatar: profile.character.avatar,
      bio: profile.character.bio
    } : null;
    
    // Si no existe el perfil, crear uno nuevo
    const isNewProfile = !profile;
    if (isNewProfile) {
      // Verificar restricciones de raza/clase si se están configurando
      const selectedRace = req.body.race;
      const selectedClass = req.body.class;
      
      // Comprobar si hay restricciones de clase por raza
      if (selectedRace && selectedClass && 
          serverConfig.roleplay.raceClassRestrictions && 
          serverConfig.roleplay.raceClassRestrictions.has(selectedRace)) {
        
        const allowedClasses = serverConfig.roleplay.raceClassRestrictions.get(selectedRace);
        
        // Si hay restricciones y la clase seleccionada no está permitida para esta raza
        if (allowedClasses.length > 0 && !allowedClasses.includes(selectedClass)) {
          return res.render('servers/userProfile', {
            title: 'Crear Perfil',
            guild: req.guild,
            req,
            profile: null,
            serverConfig,
            formData: req.body,
            error: `La raza ${selectedRace} no puede tener la clase ${selectedClass}. Clases permitidas: ${allowedClasses.join(', ')}`
          });
        }
      }
      
      // Inicializar un nuevo perfil
      profile = new Profile({
        userId: req.user.id,
        serverId: guildId,
        character: {
          // Inicializar con valores base de la raza, si existen
          currency: serverConfig.roleplay.startingCurrency || 100,
          level: serverConfig.roleplay.startingLevel || 1,
          health: {
            current: 100,
            max: 100
          },
          mana: {
            current: 50,
            max: 50
          },
          stats: {
            strength: 10,
            intelligence: 10,
            dexterity: 10,
            defense: 10
          },
          inventory: [],
          skills: []
        },
        progress: {
          activeMissions: [],
          activeAdventures: [],
          completedMissions: [],
          completedAdventures: []
        },
        stats: {
          wins: 0,
          losses: 0,
          quests: {
            completed: 0,
            failed: 0
          }
        },
        preferences: {
          theme: 'default',
          visibility: 'public',
          notifications: true
        }
      });
    }
    
    // Actualizar datos del personaje
    profile.character.name = req.body.characterName || profile.character.name;
    profile.character.avatar = req.body.characterAvatar || profile.character.avatar;
    profile.character.race = req.body.race || profile.character.race;
    profile.character.class = req.body.class || profile.character.class;
    profile.character.age = parseInt(req.body.age) || profile.character.age;
    profile.character.bio = req.body.bio || profile.character.bio;
    
    // Actualizar preferencias
    if (req.body.theme) {
      profile.preferences.theme = req.body.theme;
    }
    
    if (req.body.visibility) {
      profile.preferences.visibility = req.body.visibility;
    }
    
    if (req.body.customTitle) {
      profile.preferences.customTitle = req.body.customTitle;
    }
    
    profile.preferences.notifications = req.body.notifications === 'on';
    
    // Actualizar la fecha de modificación
    profile.updatedAt = Date.now();
    
    // Si se están creando stats base según la raza y la clase
    if (isNewProfile && profile.character.race && profile.character.class) {
      // Obtener información de la raza y clase si existe en la DB
      try {
        
        // Buscar la raza seleccionada
        const raceInfo = await Race.findOne({
          serverId: guildId,
          name: profile.character.race,
          enabled: true
        });
        
        // Buscar la clase seleccionada
        const classInfo = await Class.findOne({
          serverId: guildId,
          name: profile.character.class,
          enabled: true
        });
        
        // Aplicar stats base de la raza si existen
        if (raceInfo && raceInfo.baseStats) {
          profile.character.health.max = raceInfo.baseStats.health || 100;
          profile.character.health.current = profile.character.health.max;
          profile.character.mana.max = raceInfo.baseStats.mana || 50;
          profile.character.mana.current = profile.character.mana.max;
          profile.character.stats.strength = raceInfo.baseStats.strength || 10;
          profile.character.stats.intelligence = raceInfo.baseStats.intelligence || 10;
          profile.character.stats.dexterity = raceInfo.baseStats.dexterity || 10;
          profile.character.stats.defense = raceInfo.baseStats.defense || 10;
        }
        
        // Aplicar modificadores de la clase si existen
        if (classInfo && classInfo.statModifiers) {
          profile.character.health.max += classInfo.statModifiers.health || 0;
          profile.character.health.current = profile.character.health.max;
          profile.character.mana.max += classInfo.statModifiers.mana || 0;
          profile.character.mana.current = profile.character.mana.max;
          profile.character.stats.strength += classInfo.statModifiers.strength || 0;
          profile.character.stats.intelligence += classInfo.statModifiers.intelligence || 0;
          profile.character.stats.dexterity += classInfo.statModifiers.dexterity || 0;
          profile.character.stats.defense += classInfo.statModifiers.defense || 0;
        }
        
        // Añadir habilidades raciales si existen
        if (raceInfo && raceInfo.racialSkills && raceInfo.racialSkills.length > 0) {
          for (const skillId of raceInfo.racialSkills) {
            if (!profile.character.skills.some(s => s.skillId === skillId)) {
              profile.character.skills.push({
                skillId,
                level: 1,
                usesLeft: null,
                cooldownUntil: null
              });
            }
          }
        }
        
        // Añadir habilidades de clase si existen
        if (classInfo && classInfo.classSkills && classInfo.classSkills.length > 0) {
          for (const skillId of classInfo.classSkills) {
            if (!profile.character.skills.some(s => s.skillId === skillId)) {
              profile.character.skills.push({
                skillId,
                level: 1,
                usesLeft: null,
                cooldownUntil: null
              });
            }
          }
        }
      } catch (err) {
        console.error('Error al aplicar stats base:', err);
      }
    }
    
    // Guardar el perfil
    await profile.save();
    
    // Actualizar o crear el canal de perfil si está habilitado
    if (serverConfig.config.autoCreateProfileChannels || serverConfig.config.profilesChannel) {
      const channelId = await profileUtils.createOrUpdateProfileChannel(guildId, req.user.id, profile);
      
      // Si se creó un canal individual, actualizar el ID en el perfil
      if (channelId && channelId !== serverConfig.config.profilesChannel) {
        profile.profileChannelId = channelId;
        await profile.save();
      }
      
      // Actualizar también el canal general de perfiles
      if (serverConfig.config.profilesChannel) {
        await profileUtils.updateGeneralProfilesChannel(guildId);
      }
    }

    // Registrar la actividad
    if (global.logger) {
      if (isNewProfile) {
        global.logger.logProfile(
          guildId,
          req.user.id,
          'create',
          profile._id.toString(),
          {
            name: profile.character.name,
            race: profile.character.race,
            class: profile.character.class
          }
        );
      } else {
        global.logger.logProfile(
          guildId,
          req.user.id,
          'update',
          profile._id.toString(),
          {
            previous: previousData,
            current: {
              name: profile.character.name,
              race: profile.character.race,
              class: profile.character.class,
              avatar: profile.character.avatar,
              bio: profile.character.bio
            }
          }
        );
      }
    }
    
    res.redirect(`/servers/${guildId}/profile?success=true`);
  } catch (error) {
    console.error('Error al actualizar el perfil del usuario:', error);
    res.redirect(`/servers/${req.params.guildId}/profile?error=true`);
  }
});

router.get('/:guildId/logs', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener parámetros de filtrado y paginación
    const page = parseInt(req.query.page) || 1;
    const perPage = 20;
    const skip = (page - 1) * perPage;
    
    // Construir los filtros
    const filters = {};
    
    if (req.query.type) {
      filters.type = req.query.type;
    }
    
    if (req.query.user) {
      // Buscar por usuario (ID o parte del nombre/tag)
      filters.$or = [
        { userId: { $regex: req.query.user, $options: 'i' } },
        { 'user.tag': { $regex: req.query.user, $options: 'i' } }
      ];
    }
    
    if (req.query.date) {
      // Filtrar por fecha
      const date = new Date(req.query.date);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      
      filters.timestamp = {
        $gte: date,
        $lt: nextDay
      };
    }
    
    // Siempre filtrar por el servidor actual
    filters.serverId = guildId;
    
    // Obtener los logs con paginación
    const logs = await Logs.find(filters)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(perPage);
    
    // Obtener conteo total para la paginación
    const totalItems = await Logs.countDocuments(filters);
    
    // Información de paginación
    const pagination = {
      currentPage: page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage)
    };
    
    // Pasar los filtros actuales para mantenerlos en la paginación
    const queryFilters = {
      type: req.query.type,
      user: req.query.user,
      date: req.query.date
    };
    
    // Filtrar los campos vacíos
    Object.keys(queryFilters).forEach(key => {
      if (!queryFilters[key]) {
        delete queryFilters[key];
      }
    });
    
    res.render('servers/logs', {
      title: `Registros - ${guild.name}`,
      guild,
      req,
      logs,
      pagination,
      filters: queryFilters
    });
  } catch (error) {
    console.error('Error al obtener los registros:', error);
    res.redirect('/error?message=Error al cargar los registros de actividad&status=500');
  }
});

// Exportar logs
router.get('/:guildId/logs/export', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { format = 'json' } = req.query;
    
    // Construir los filtros (similar a la ruta anterior)
    const filters = { serverId: guildId };
    
    if (req.query.type) {
      filters.type = req.query.type;
    }
    
    if (req.query.user) {
      filters.$or = [
        { userId: { $regex: req.query.user, $options: 'i' } },
        { 'user.tag': { $regex: req.query.user, $options: 'i' } }
      ];
    }
    
    if (req.query.date) {
      const date = new Date(req.query.date);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      
      filters.timestamp = {
        $gte: date,
        $lt: nextDay
      };
    }
    
    // Obtener todos los logs que coincidan con los filtros (sin paginación para exportar todos)
    const logs = await Logs.find(filters)
      .sort({ timestamp: -1 })
      .lean();
    
    // Preparar los datos para exportar
    const exportData = logs.map(log => ({
      timestamp: new Date(log.timestamp).toISOString(),
      userId: log.userId,
      userTag: log.user ? log.user.tag : 'Unknown',
      type: log.type,
      action: log.action,
      details: log.details
    }));
    
    // Exportar según el formato solicitado
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=logs-${guildId}-${Date.now()}.csv`);
      
      // Crear CSV
      const csvRows = [];
      
      // Encabezados
      csvRows.push(['Timestamp', 'User ID', 'User Tag', 'Type', 'Action', 'Details'].join(','));
      
      // Datos
      exportData.forEach(log => {
        // Manejar detalles para CSV (convertir objeto a string si es necesario)
        let details = log.details;
        if (typeof details === 'object') {
          details = JSON.stringify(details).replace(/"/g, '""');
        }
        
        const row = [
          log.timestamp,
          log.userId,
          `"${log.userTag.replace(/"/g, '""')}"`,
          log.type,
          `"${log.action.replace(/"/g, '""')}"`,
          `"${details}"`
        ];
        
        csvRows.push(row.join(','));
      });
      
      return res.send(csvRows.join('\n'));
    } else {
      // Por defecto, exportar como JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=logs-${guildId}-${Date.now()}.json`);
      return res.json(exportData);
    }
  } catch (error) {
    console.error('Error al exportar los registros:', error);
    res.status(500).json({ error: 'Error al exportar los registros' });
  }
});

// Exportar perfiles
router.get('/:guildId/profiles/export', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { format = 'json' } = req.query;
    
    // Obtener perfiles del servidor
    const profiles = await Profile.find({ serverId: guildId }).lean();
    
    // Preparar datos para exportar
    const exportData = profiles.map(profile => ({
      userId: profile.userId,
      character: {
        name: profile.character.name,
        race: profile.character.race,
        class: profile.character.class,
        age: profile.character.age,
        level: profile.character.level,
        experience: profile.character.experience,
        health: profile.character.health,
        currency: profile.character.currency,
        bio: profile.character.bio,
        // Simplificar inventario para la exportación
        inventory: profile.character.inventory ? profile.character.inventory.map(item => ({
          item: item.item,
          quantity: item.quantity
        })) : [],
        // Simplificar habilidades para la exportación
        skills: profile.character.skills ? profile.character.skills.map(skill => ({
          name: skill.name,
          level: skill.level
        })) : []
      },
      stats: {
        wins: profile.stats.wins,
        losses: profile.stats.losses,
        quests: profile.stats.quests
      },
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    }));
    
    // Exportar según el formato solicitado
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=profiles-${guildId}-${Date.now()}.csv`);
      
      // Crear CSV
      const csvRows = [];
      
      // Encabezados
      csvRows.push(['User ID', 'Name', 'Race', 'Class', 'Age', 'Level', 'Experience', 'Health Current', 'Health Max', 'Currency', 'Wins', 'Losses', 'Created At'].join(','));
      
      // Datos
      exportData.forEach(profile => {
        const row = [
          profile.userId,
          `"${profile.character.name.replace(/"/g, '""')}"`,
          profile.character.race,
          profile.character.class,
          profile.character.age,
          profile.character.level,
          profile.character.experience,
          profile.character.health.current,
          profile.character.health.max,
          profile.character.currency,
          profile.stats.wins,
          profile.stats.losses,
          new Date(profile.createdAt).toISOString()
        ];
        
        csvRows.push(row.join(','));
      });
      
      return res.send(csvRows.join('\n'));
    } else {
      // Por defecto, exportar como JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=profiles-${guildId}-${Date.now()}.json`);
      return res.json(exportData);
    }
  } catch (error) {
    console.error('Error al exportar los perfiles:', error);
    res.status(500).json({ error: 'Error al exportar los perfiles' });
  }
});

// Exportar estadísticas del servidor
router.get('/:guildId/stats/export', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { format = 'json' } = req.query;
    
    // Obtener configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    if (!serverConfig) {
      return res.status(404).json({ error: 'Servidor no encontrado' });
    }
    
    // Obtener estadísticas adicionales
    const totalProfiles = await Profile.countDocuments({ serverId: guildId });
    const activeProfiles = await Profile.countDocuments({
      serverId: guildId,
      updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Activos en los últimos 30 días
    });
    
    // Exportar estadísticas
    const statsData = {
      serverId: guildId,
      serverName: serverConfig.name,
      totalMessages: serverConfig.stats.totalMessages,
      activeUsers: serverConfig.stats.activeUsers,
      totalProfiles,
      activeProfiles,
      commandUsage: Object.fromEntries(serverConfig.stats.commandUsage),
      topUsers: serverConfig.stats.topUsers,
      exportedAt: new Date()
    };
    
    // Exportar según el formato solicitado
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=stats-${guildId}-${Date.now()}.csv`);
      
      // Crear CSV
      const csvRows = [];
      
      // Sección principal de estadísticas
      csvRows.push(['Server ID', 'Server Name', 'Total Messages', 'Active Users', 'Total Profiles', 'Active Profiles', 'Exported At'].join(','));
      csvRows.push([
        guildId,
        `"${serverConfig.name.replace(/"/g, '""')}"`,
        serverConfig.stats.totalMessages,
        serverConfig.stats.activeUsers,
        totalProfiles,
        activeProfiles,
        new Date().toISOString()
      ].join(','));
      
      // Sección de uso de comandos
      csvRows.push(['', '']);
      csvRows.push(['Command', 'Usage Count']);
      
      for (const [command, count] of serverConfig.stats.commandUsage.entries()) {
        csvRows.push([`"${command}"`, count]);
      }
      
      // Sección de usuarios top
      csvRows.push(['', '']);
      csvRows.push(['User ID', 'Activity']);
      
      serverConfig.stats.topUsers.forEach(user => {
        csvRows.push([user.userId, user.activity]);
      });
      
      return res.send(csvRows.join('\n'));
    } else {
      // Por defecto, exportar como JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=stats-${guildId}-${Date.now()}.json`);
      return res.json(statsData);
    }
  } catch (error) {
    console.error('Error al exportar las estadísticas:', error);
    res.status(500).json({ error: 'Error al exportar las estadísticas' });
  }
});

router.get('/:guildId/inventory', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener todos los items del servidor
    const items = await Item.find({ serverId: guildId });
    
    // Obtener parámetros de filtrado
    const filter = req.query.filter || 'all';
    const search = req.query.search || '';
    
    // Filtrar items según parámetros
    let filteredItems = items;
    
    if (search) {
      filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(search.toLowerCase()) || 
        item.description.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (filter !== 'all') {
      filteredItems = filteredItems.filter(item => item.type === filter);
    }
    
    res.render('servers/inventory', {
      title: 'Gestión de Inventario',
      guild,
      req,
      serverConfig,
      items: filteredItems,
      filter,
      search
    });
  } catch (error) {
    console.error('Error al cargar la gestión de inventario:', error);
    res.redirect('/error?message=Error al cargar la gestión de inventario&status=500');
  }
});

// Página para crear un nuevo item
router.get('/:guildId/inventory/new', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor para razas y clases disponibles
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    res.render('servers/inventoryNew', {
      title: 'Crear Nuevo Item',
      guild,
      req,
      serverConfig,
      item: null
    });
  } catch (error) {
    console.error('Error al cargar la página de nuevo item:', error);
    res.redirect('/error?message=Error al cargar la página de nuevo item&status=500');
  }
});

// Procesar la creación de un nuevo item
router.post('/:guildId/inventory/new', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Validar datos del formulario
    const {
      name,
      description,
      price,
      type,
      equipmentSlot,
      raceRestrictions,
      classRestrictions,
      levelRequired,
      purchaseLimit,
      consumable,
      maxUses,
      image,
      effectsHealth,
      effectsMana,
      effectsStrength,
      effectsIntelligence,
      effectsDexterity,
      effectsDefense
    } = req.body;
    
    // Crear el nuevo item
    const item = new Item({
      name,
      description,
      price: parseInt(price) || 0,
      type: type || 'collectable',
      equipmentSlot: type === 'equipment' ? (equipmentSlot || 'none') : 'none',
      raceRestrictions: Array.isArray(raceRestrictions) ? raceRestrictions : (raceRestrictions ? [raceRestrictions] : []),
      classRestrictions: Array.isArray(classRestrictions) ? classRestrictions : (classRestrictions ? [classRestrictions] : []),
      levelRequired: parseInt(levelRequired) || 1,
      purchaseLimit: parseInt(purchaseLimit) || 0,
      consumable: consumable === 'on',
      maxUses: parseInt(maxUses) || 1,
      image: image || null,
      effects: {
        health: parseInt(effectsHealth) || 0,
        mana: parseInt(effectsMana) || 0,
        strength: parseInt(effectsStrength) || 0,
        intelligence: parseInt(effectsIntelligence) || 0,
        dexterity: parseInt(effectsDexterity) || 0,
        defense: parseInt(effectsDefense) || 0
      },
      serverId: guildId,
      createdBy: req.user.id
    });
    
    await item.save();
    
    res.redirect(`/servers/${guildId}/inventory?success=true`);
  } catch (error) {
    console.error('Error al crear el item:', error);
    res.redirect(`/servers/${req.params.guildId}/inventory/new?error=true`);
  }
});

// Ver/Editar un item existente
router.get('/:guildId/inventory/:itemId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, itemId } = req.params;
    const guild = req.guild;
    
    // Obtener el item
    const item = await Item.findById(itemId);
    
    if (!item || item.serverId !== guildId) {
      return res.redirect('/error?message=Item no encontrado&status=404');
    }
    
    // Obtener la configuración del servidor para razas y clases disponibles
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    res.render('servers/inventoryEdit', {
      title: `Editar Item - ${item.name}`,
      guild,
      req,
      serverConfig,
      item
    });
  } catch (error) {
    console.error('Error al cargar el item para editar:', error);
    res.redirect('/error?message=Error al cargar el item&status=500');
  }
});

// Actualizar un item existente
router.post('/:guildId/inventory/:itemId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, itemId } = req.params;
    
    // Obtener el item
    const item = await Item.findById(itemId);
    
    if (!item || item.serverId !== guildId) {
      return res.redirect('/error?message=Item no encontrado&status=404');
    }
    
    // Actualizar los datos del item
    const {
      name,
      description,
      price,
      type,
      equipmentSlot,
      raceRestrictions,
      classRestrictions,
      levelRequired,
      purchaseLimit,
      consumable,
      maxUses,
      image,
      effectsHealth,
      effectsMana,
      effectsStrength,
      effectsIntelligence,
      effectsDexterity,
      effectsDefense,
      enabled
    } = req.body;
    
    item.name = name || item.name;
    item.description = description || item.description;
    item.price = parseInt(price) || 0;
    item.type = type || 'collectable';
    item.equipmentSlot = type === 'equipment' ? (equipmentSlot || 'none') : 'none';
    item.raceRestrictions = Array.isArray(raceRestrictions) ? raceRestrictions : (raceRestrictions ? [raceRestrictions] : []);
    item.classRestrictions = Array.isArray(classRestrictions) ? classRestrictions : (classRestrictions ? [classRestrictions] : []);
    item.levelRequired = parseInt(levelRequired) || 1;
    item.purchaseLimit = parseInt(purchaseLimit) || 0;
    item.consumable = consumable === 'on';
    item.maxUses = parseInt(maxUses) || 1;
    item.image = image || item.image;
    item.effects = {
      health: parseInt(effectsHealth) || 0,
      mana: parseInt(effectsMana) || 0,
      strength: parseInt(effectsStrength) || 0,
      intelligence: parseInt(effectsIntelligence) || 0,
      dexterity: parseInt(effectsDexterity) || 0,
      defense: parseInt(effectsDefense) || 0
    };
    item.enabled = enabled === 'on';
    
    await item.save();
    
    res.redirect(`/servers/${guildId}/inventory?updated=true`);
  } catch (error) {
    console.error('Error al actualizar el item:', error);
    res.redirect(`/servers/${req.params.guildId}/inventory/${req.params.itemId}?error=true`);
  }
});

// Eliminar un item
router.post('/:guildId/inventory/:itemId/delete', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, itemId } = req.params;
    
    // Obtener el item
    const item = await Item.findById(itemId);
    
    if (!item || item.serverId !== guildId) {
      return res.redirect('/error?message=Item no encontrado&status=404');
    }
    
    // Verificar si algún perfil tiene este item
    const profilesWithItem = await Profile.find({
      serverId: guildId,
      "character.inventory.itemId": itemId
    });
    
    if (profilesWithItem.length > 0) {
      // Si hay perfiles con este item, opcionalmente podemos deshabilitarlo en lugar de eliminarlo
      item.enabled = false;
      await item.save();
      
      return res.redirect(`/servers/${guildId}/inventory?disabled=true`);
    }
    
    // Si no hay perfiles con este item, podemos eliminarlo
    await Item.findByIdAndDelete(itemId);
    
    res.redirect(`/servers/${guildId}/inventory?deleted=true`);
  } catch (error) {
    console.error('Error al eliminar el item:', error);
    res.redirect(`/servers/${req.params.guildId}/inventory?error=true`);
  }
});

router.get('/:guildId/skills', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener todas las habilidades del servidor
    const skills = await Skill.find({ serverId: guildId });
    
    // Obtener parámetros de filtrado
    const filter = req.query.filter || 'all';
    const search = req.query.search || '';
    const raceFilter = req.query.race || 'all';
    const classFilter = req.query.class || 'all';
    
    // Filtrar habilidades según parámetros
    let filteredSkills = skills;
    
    if (search) {
      filteredSkills = skills.filter(skill => 
        skill.name.toLowerCase().includes(search.toLowerCase()) || 
        skill.description.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (filter !== 'all') {
      filteredSkills = filteredSkills.filter(skill => skill.category === filter);
    }
    
    if (raceFilter !== 'all') {
      filteredSkills = filteredSkills.filter(skill => 
        skill.raceRestrictions.length === 0 || 
        skill.raceRestrictions.includes(raceFilter)
      );
    }
    
    if (classFilter !== 'all') {
      filteredSkills = filteredSkills.filter(skill => 
        skill.classRestrictions.length === 0 || 
        skill.classRestrictions.includes(classFilter)
      );
    }
    
    res.render('servers/skills', {
      title: 'Gestión de Habilidades',
      guild,
      req,
      serverConfig,
      skills: filteredSkills,
      filter,
      search,
      raceFilter,
      classFilter
    });
  } catch (error) {
    console.error('Error al cargar la gestión de habilidades:', error);
    res.redirect('/error?message=Error al cargar la gestión de habilidades&status=500');
  }
});

// Página para crear una nueva habilidad
router.get('/:guildId/skills/new', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor para razas y clases disponibles
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    res.render('servers/skillNew', {
      title: 'Crear Nueva Habilidad',
      guild,
      req,
      serverConfig,
      skill: null
    });
  } catch (error) {
    console.error('Error al cargar la página de nueva habilidad:', error);
    res.redirect('/error?message=Error al cargar la página de nueva habilidad&status=500');
  }
});

// Procesar la creación de una nueva habilidad
router.post('/:guildId/skills/new', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Validar datos del formulario
    const {
      name,
      description,
      category,
      targetType,
      raceRestrictions,
      classRestrictions,
      levelRequired,
      manaCost,
      cooldown,
      maxUses,
      usesPerDay,
      image,
      effectsDamage,
      effectsHealing,
      effectsBuffStrength,
      effectsBuffIntelligence,
      effectsBuffDexterity,
      effectsBuffDefense,
      effectsDuration
    } = req.body;
    
    // Crear la nueva habilidad
    const skill = new Skill({
      name,
      description,
      category: category || 'utility',
      targetType: targetType || 'self',
      raceRestrictions: Array.isArray(raceRestrictions) ? raceRestrictions : (raceRestrictions ? [raceRestrictions] : []),
      classRestrictions: Array.isArray(classRestrictions) ? classRestrictions : (classRestrictions ? [classRestrictions] : []),
      levelRequired: parseInt(levelRequired) || 1,
      manaCost: parseInt(manaCost) || 0,
      cooldown: parseInt(cooldown) || 0,
      maxUses: parseInt(maxUses) || 0,
      usesPerDay: parseInt(usesPerDay) || 0,
      image: image || null,
      effects: {
        damage: parseInt(effectsDamage) || 0,
        healing: parseInt(effectsHealing) || 0,
        buffStrength: parseInt(effectsBuffStrength) || 0,
        buffIntelligence: parseInt(effectsBuffIntelligence) || 0,
        buffDexterity: parseInt(effectsBuffDexterity) || 0,
        buffDefense: parseInt(effectsBuffDefense) || 0,
        duration: parseInt(effectsDuration) || 0
      },
      serverId: guildId,
      createdBy: req.user.id
    });
    
    await skill.save();
    
    res.redirect(`/servers/${guildId}/skills?success=true`);
  } catch (error) {
    console.error('Error al crear la habilidad:', error);
    res.redirect(`/servers/${req.params.guildId}/skills/new?error=true`);
  }
});

// Ver/Editar una habilidad existente
router.get('/:guildId/skills/:skillId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, skillId } = req.params;
    const guild = req.guild;
    
    // Obtener la habilidad
    const skill = await Skill.findById(skillId);
    
    if (!skill || skill.serverId !== guildId) {
      return res.redirect('/error?message=Habilidad no encontrada&status=404');
    }
    
    // Obtener la configuración del servidor para razas y clases disponibles
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    res.render('servers/skillEdit', {
      title: `Editar Habilidad - ${skill.name}`,
      guild,
      req,
      serverConfig,
      skill
    });
  } catch (error) {
    console.error('Error al cargar la habilidad para editar:', error);
    res.redirect('/error?message=Error al cargar la habilidad&status=500');
  }
});

// Actualizar una habilidad existente
router.post('/:guildId/skills/:skillId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, skillId } = req.params;
    
    // Obtener la habilidad
    const skill = await Skill.findById(skillId);
    
    if (!skill || skill.serverId !== guildId) {
      return res.redirect('/error?message=Habilidad no encontrada&status=404');
    }
    
    // Actualizar los datos de la habilidad
    const {
      name,
      description,
      category,
      targetType,
      raceRestrictions,
      classRestrictions,
      levelRequired,
      manaCost,
      cooldown,
      maxUses,
      usesPerDay,
      image,
      effectsDamage,
      effectsHealing,
      effectsBuffStrength,
      effectsBuffIntelligence,
      effectsBuffDexterity,
      effectsBuffDefense,
      effectsDuration,
      enabled
    } = req.body;
    
    skill.name = name || skill.name;
    skill.description = description || skill.description;
    skill.category = category || 'utility';
    skill.targetType = targetType || 'self';
    skill.raceRestrictions = Array.isArray(raceRestrictions) ? raceRestrictions : (raceRestrictions ? [raceRestrictions] : []);
    skill.classRestrictions = Array.isArray(classRestrictions) ? classRestrictions : (classRestrictions ? [classRestrictions] : []);
    skill.levelRequired = parseInt(levelRequired) || 1;
    skill.manaCost = parseInt(manaCost) || 0;
    skill.cooldown = parseInt(cooldown) || 0;
    skill.maxUses = parseInt(maxUses) || 0;
    skill.usesPerDay = parseInt(usesPerDay) || 0;
    skill.image = image || skill.image;
    skill.effects = {
      damage: parseInt(effectsDamage) || 0,
      healing: parseInt(effectsHealing) || 0,
      buffStrength: parseInt(effectsBuffStrength) || 0,
      buffIntelligence: parseInt(effectsBuffIntelligence) || 0,
      buffDexterity: parseInt(effectsBuffDexterity) || 0,
      buffDefense: parseInt(effectsBuffDefense) || 0,
      duration: parseInt(effectsDuration) || 0
    };
    skill.enabled = enabled === 'on';
    
    await skill.save();
    
    res.redirect(`/servers/${guildId}/skills?updated=true`);
  } catch (error) {
    console.error('Error al actualizar la habilidad:', error);
    res.redirect(`/servers/${req.params.guildId}/skills/${req.params.skillId}?error=true`);
  }
});

// Eliminar una habilidad
router.post('/:guildId/skills/:skillId/delete', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, skillId } = req.params;
    
    // Obtener la habilidad
    const skill = await Skill.findById(skillId);
    
    if (!skill || skill.serverId !== guildId) {
      return res.redirect('/error?message=Habilidad no encontrada&status=404');
    }
    
    // Verificar si algún perfil tiene esta habilidad
    const profilesWithSkill = await Profile.find({
      serverId: guildId,
      "character.skills.skillId": skillId
    });
    
    if (profilesWithSkill.length > 0) {
      // Si hay perfiles con esta habilidad, opcionalmente podemos deshabilitarla en lugar de eliminarla
      skill.enabled = false;
      await skill.save();
      
      return res.redirect(`/servers/${guildId}/skills?disabled=true`);
    }
    
    // Si no hay perfiles con esta habilidad, podemos eliminarla
    await Skill.findByIdAndDelete(skillId);
    
    res.redirect(`/servers/${guildId}/skills?deleted=true`);
  } catch (error) {
    console.error('Error al eliminar la habilidad:', error);
    res.redirect(`/servers/${req.params.guildId}/skills?error=true`);
  }
});

// =========================
// RUTAS PARA MISIONES
// =========================

// Lista de misiones del servidor
router.get('/:guildId/missions', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener todas las misiones del servidor
    const missions = await Mission.find({ serverId: guildId });
    
    // Obtener parámetros de filtrado
    const filter = req.query.filter || 'all';
    const search = req.query.search || '';
    const statusFilter = req.query.status || 'all';
    
    // Filtrar misiones según parámetros
    let filteredMissions = missions;
    
    if (search) {
      filteredMissions = missions.filter(mission => 
        mission.title.toLowerCase().includes(search.toLowerCase()) || 
        mission.description.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (filter !== 'all') {
      filteredMissions = filteredMissions.filter(mission => mission.type === filter);
    }
    
    if (statusFilter !== 'all') {
      filteredMissions = filteredMissions.filter(mission => mission.status === statusFilter);
    }
    
    res.render('servers/missions', {
      title: 'Gestión de Misiones',
      guild,
      req,
      serverConfig,
      missions: filteredMissions,
      filter,
      search,
      statusFilter
    });
  } catch (error) {
    console.error('Error al cargar la gestión de misiones:', error);
    res.redirect('/error?message=Error al cargar la gestión de misiones&status=500');
  }
});

// Página para crear una nueva misión
router.get('/:guildId/missions/new', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor para razas y clases disponibles
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener los items disponibles para recompensas
    const items = await Item.find({ serverId: guildId, enabled: true });
    
    // Obtener las habilidades disponibles para recompensas
    const skills = await Skill.find({ serverId: guildId, enabled: true });
    
    res.render('servers/missionNew', {
      title: 'Crear Nueva Misión',
      guild,
      req,
      serverConfig,
      items,
      skills,
      mission: null
    });
  } catch (error) {
    console.error('Error al cargar la página de nueva misión:', error);
    res.redirect('/error?message=Error al cargar la página de nueva misión&status=500');
  }
});

// Procesar la creación de una nueva misión
router.post('/:guildId/missions/new', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Validar datos del formulario
    const {
      title,
      description,
      type,
      difficulty,
      levelRequired,
      raceRestrictions,
      classRestrictions,
      restrictionReasons,
      duration,
      cooldown,
      maxParticipants,
      rewardExperience,
      rewardCurrency,
      rewardItems,
      rewardItemsQuantity,
      rewardSkills,
      costCurrency,
      costItems,
      costItemsQuantity,
      availableFrom,
      availableUntil,
      stages,
      image,
      status,
      featured
    } = req.body;
    
    // Preparar las restricciones de raza/clase y sus razones
    const raceRestrictionArray = Array.isArray(raceRestrictions) ? raceRestrictions : (raceRestrictions ? [raceRestrictions] : []);
    const classRestrictionArray = Array.isArray(classRestrictions) ? classRestrictions : (classRestrictions ? [classRestrictions] : []);
    
    // Crear un Map para las razones de restricción
    const restrictionReasonsMap = new Map();
    
    if (restrictionReasons && typeof restrictionReasons === 'object') {
      Object.entries(restrictionReasons).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          restrictionReasonsMap.set(key, value);
        }
      });
    }
    
    // Preparar los items de recompensa
    const rewardItemsArray = [];
    if (rewardItems) {
      const itemIds = Array.isArray(rewardItems) ? rewardItems : [rewardItems];
      const quantities = Array.isArray(rewardItemsQuantity) ? rewardItemsQuantity : [rewardItemsQuantity];
      
      itemIds.forEach((itemId, index) => {
        const quantity = parseInt(quantities[index]) || 1;
        if (itemId && itemId.trim() !== '') {
          rewardItemsArray.push({
            itemId,
            quantity
          });
        }
      });
    }
    
    // Preparar los items de costo
    const costItemsArray = [];
    if (costItems) {
      const itemIds = Array.isArray(costItems) ? costItems : [costItems];
      const quantities = Array.isArray(costItemsQuantity) ? costItemsQuantity : [costItemsQuantity];
      
      itemIds.forEach((itemId, index) => {
        const quantity = parseInt(quantities[index]) || 1;
        if (itemId && itemId.trim() !== '') {
          costItemsArray.push({
            itemId,
            quantity
          });
        }
      });
    }
    
    // Preparar las etapas de la misión
    const stagesArray = [];
    if (stages && typeof stages === 'object') {
      const stageNames = stages.name || [];
      const stageDescriptions = stages.description || [];
      const stageTaskTypes = stages.taskType || [];
      const stageTargetAmounts = stages.targetAmount || [];
      const stageCompletionMessages = stages.completionMessage || [];
      
      // Convertir a arrays si no lo son
      const namesArray = Array.isArray(stageNames) ? stageNames : [stageNames];
      const descArray = Array.isArray(stageDescriptions) ? stageDescriptions : [stageDescriptions];
      const taskTypesArray = Array.isArray(stageTaskTypes) ? stageTaskTypes : [stageTaskTypes];
      const targetAmountsArray = Array.isArray(stageTargetAmounts) ? stageTargetAmounts : [stageTargetAmounts];
      const completionMsgsArray = Array.isArray(stageCompletionMessages) ? stageCompletionMessages : [stageCompletionMessages];
      
      for (let i = 0; i < namesArray.length; i++) {
        if (namesArray[i] && descArray[i]) {
          stagesArray.push({
            name: namesArray[i],
            description: descArray[i],
            taskType: taskTypesArray[i] || 'custom',
            targetAmount: parseInt(targetAmountsArray[i]) || 1,
            completionMessage: completionMsgsArray[i] || ''
          });
        }
      }
    }
    
    // Crear la nueva misión
    const mission = new Mission({
      title,
      description,
      type: type || 'custom',
      difficulty: difficulty || 'medium',
      levelRequired: parseInt(levelRequired) || 1,
      raceRestrictions: raceRestrictionArray,
      classRestrictions: classRestrictionArray,
      restrictionReasons: restrictionReasonsMap,
      duration: parseInt(duration) || 0,
      cooldown: parseInt(cooldown) || 0,
      maxParticipants: parseInt(maxParticipants) || 0,
      rewards: {
        experience: parseInt(rewardExperience) || 0,
        currency: parseInt(rewardCurrency) || 0,
        items: rewardItemsArray,
        skills: Array.isArray(rewardSkills) ? rewardSkills : (rewardSkills ? [rewardSkills] : [])
      },
      costs: {
        currency: parseInt(costCurrency) || 0,
        items: costItemsArray
      },
      availableFrom: availableFrom ? new Date(availableFrom) : null,
      availableUntil: availableUntil ? new Date(availableUntil) : null,
      stages: stagesArray,
      image: image || null,
      status: status || 'draft',
      featured: featured === 'on',
      serverId: guildId,
      createdBy: req.user.id
    });
    
    await mission.save();
    
    res.redirect(`/servers/${guildId}/missions?success=true`);
  } catch (error) {
    console.error('Error al crear la misión:', error);
    res.redirect(`/servers/${req.params.guildId}/missions/new?error=true`);
  }
});

// Ver/Editar una misión existente
router.get('/:guildId/missions/:missionId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, missionId } = req.params;
    const guild = req.guild;
    
    // Obtener la misión
    const mission = await Mission.findById(missionId);
    
    if (!mission || mission.serverId !== guildId) {
      return res.redirect('/error?message=Misión no encontrada&status=404');
    }
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener los items disponibles para recompensas
    const items = await Item.find({ serverId: guildId });
    
    // Obtener las habilidades disponibles para recompensas
    const skills = await Skill.find({ serverId: guildId });
    
    res.render('servers/missionEdit', {
      title: `Editar Misión - ${mission.title}`,
      guild,
      req,
      serverConfig,
      mission,
      items,
      skills
    });
  } catch (error) {
    console.error('Error al cargar la misión para editar:', error);
    res.redirect('/error?message=Error al cargar la misión&status=500');
  }
});

// Actualizar una misión existente
router.post('/:guildId/missions/:missionId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, missionId } = req.params;
    
    // Obtener la misión
    const mission = await Mission.findById(missionId);
    
    if (!mission || mission.serverId !== guildId) {
      return res.redirect('/error?message=Misión no encontrada&status=404');
    }
    
    // El resto del código es similar al de creación de misión, pero actualizando el objeto existente
    // Validar datos del formulario
    const {
      title,
      description,
      type,
      difficulty,
      levelRequired,
      raceRestrictions,
      classRestrictions,
      restrictionReasons,
      duration,
      cooldown,
      maxParticipants,
      rewardExperience,
      rewardCurrency,
      rewardItems,
      rewardItemsQuantity,
      rewardSkills,
      costCurrency,
      costItems,
      costItemsQuantity,
      availableFrom,
      availableUntil,
      stages,
      image,
      status,
      featured
    } = req.body;
    
    // Actualizar campos básicos
    mission.title = title || mission.title;
    mission.description = description || mission.description;
    mission.type = type || 'custom';
    mission.difficulty = difficulty || 'medium';
    mission.levelRequired = parseInt(levelRequired) || 1;
    mission.raceRestrictions = Array.isArray(raceRestrictions) ? raceRestrictions : (raceRestrictions ? [raceRestrictions] : []);
    mission.classRestrictions = Array.isArray(classRestrictions) ? classRestrictions : (classRestrictions ? [classRestrictions] : []);
    
    // Actualizar razones de restricción
    const restrictionReasonsMap = new Map();
    if (restrictionReasons && typeof restrictionReasons === 'object') {
      Object.entries(restrictionReasons).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          restrictionReasonsMap.set(key, value);
        }
      });
    }
    mission.restrictionReasons = restrictionReasonsMap;
    
    // Actualizar configuración de tiempo y participantes
    mission.duration = parseInt(duration) || 0;
    mission.cooldown = parseInt(cooldown) || 0;
    mission.maxParticipants = parseInt(maxParticipants) || 0;
    mission.availableFrom = availableFrom ? new Date(availableFrom) : null;
    mission.availableUntil = availableUntil ? new Date(availableUntil) : null;
    
    // Actualizar recompensas
    const rewardItemsArray = [];
    if (rewardItems) {
      const itemIds = Array.isArray(rewardItems) ? rewardItems : [rewardItems];
      const quantities = Array.isArray(rewardItemsQuantity) ? rewardItemsQuantity : [rewardItemsQuantity];
      
      itemIds.forEach((itemId, index) => {
        const quantity = parseInt(quantities[index]) || 1;
        if (itemId && itemId.trim() !== '') {
          rewardItemsArray.push({
            itemId,
            quantity
          });
        }
      });
    }
    
    mission.rewards = {
      experience: parseInt(rewardExperience) || 0,
      currency: parseInt(rewardCurrency) || 0,
      items: rewardItemsArray,
      skills: Array.isArray(rewardSkills) ? rewardSkills : (rewardSkills ? [rewardSkills] : [])
    };
    
    // Actualizar costos
    const costItemsArray = [];
    if (costItems) {
      const itemIds = Array.isArray(costItems) ? costItems : [costItems];
      const quantities = Array.isArray(costItemsQuantity) ? costItemsQuantity : [costItemsQuantity];
      
      itemIds.forEach((itemId, index) => {
        const quantity = parseInt(quantities[index]) || 1;
        if (itemId && itemId.trim() !== '') {
          costItemsArray.push({
            itemId,
            quantity
          });
        }
      });
    }
    
    mission.costs = {
      currency: parseInt(costCurrency) || 0,
      items: costItemsArray
    };
    
    // Actualizar etapas
    if (stages && typeof stages === 'object') {
      const stagesArray = [];
      const stageNames = stages.name || [];
      const stageDescriptions = stages.description || [];
      const stageTaskTypes = stages.taskType || [];
      const stageTargetAmounts = stages.targetAmount || [];
      const stageCompletionMessages = stages.completionMessage || [];
      
      // Convertir a arrays si no lo son
      const namesArray = Array.isArray(stageNames) ? stageNames : [stageNames];
      const descArray = Array.isArray(stageDescriptions) ? stageDescriptions : [stageDescriptions];
      const taskTypesArray = Array.isArray(stageTaskTypes) ? stageTaskTypes : [stageTaskTypes];
      const targetAmountsArray = Array.isArray(stageTargetAmounts) ? stageTargetAmounts : [stageTargetAmounts];
      const completionMsgsArray = Array.isArray(stageCompletionMessages) ? stageCompletionMessages : [stageCompletionMessages];
      
      for (let i = 0; i < namesArray.length; i++) {
        if (namesArray[i] && descArray[i]) {
          stagesArray.push({
            name: namesArray[i],
            description: descArray[i],
            taskType: taskTypesArray[i] || 'custom',
            targetAmount: parseInt(targetAmountsArray[i]) || 1,
            completionMessage: completionMsgsArray[i] || ''
          });
        }
      }
      
      mission.stages = stagesArray;
    }
    
    // Actualizar otros campos
    mission.image = image || mission.image;
    mission.status = status || 'draft';
    mission.featured = featured === 'on';
    
    await mission.save();
    
    res.redirect(`/servers/${guildId}/missions?updated=true`);
  } catch (error) {
    console.error('Error al actualizar la misión:', error);
    res.redirect(`/servers/${req.params.guildId}/missions/${req.params.missionId}?error=true`);
  }
});

// Eliminar una misión
router.post('/:guildId/missions/:missionId/delete', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, missionId } = req.params;
    
    // Obtener la misión
    const mission = await Mission.findById(missionId);
    
    if (!mission || mission.serverId !== guildId) {
      return res.redirect('/error?message=Misión no encontrada&status=404');
    }
    
    // Verificar si la misión se está utilizando en alguna aventura
    const adventuresWithMission = await Adventure.find({
      serverId: guildId,
      'missions.missionId': missionId
    });
    
    if (adventuresWithMission.length > 0) {
      // Si la misión está en uso, cambiar estado a "disabled" en lugar de eliminar
      mission.status = 'disabled';
      await mission.save();
      
      return res.redirect(`/servers/${guildId}/missions?disabled=true`);
    }
    
    // Verificar si algún perfil tiene esta misión activa
    const profilesWithMission = await Profile.find({
      serverId: guildId,
      'progress.activeMissions.missionId': missionId
    });
    
    if (profilesWithMission.length > 0) {
      // Si hay perfiles con esta misión activa, cambiar estado a "expired" en lugar de eliminar
      mission.status = 'expired';
      await mission.save();
      
      return res.redirect(`/servers/${guildId}/missions?expired=true`);
    }
    
    // Si no hay referencias a la misión, eliminarla
    await Mission.findByIdAndDelete(missionId);
    
    res.redirect(`/servers/${guildId}/missions?deleted=true`);
  } catch (error) {
    console.error('Error al eliminar la misión:', error);
    res.redirect(`/servers/${req.params.guildId}/missions?error=true`);
  }
});

// =========================
// RUTAS PARA AVENTURAS
// =========================

// Lista de aventuras del servidor
router.get('/:guildId/adventures', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener todas las aventuras del servidor
    const adventures = await Adventure.find({ serverId: guildId });
    
    // Obtener parámetros de filtrado
    const search = req.query.search || '';
    const statusFilter = req.query.status || 'all';
    
    // Filtrar aventuras según parámetros
    let filteredAdventures = adventures;
    
    if (search) {
      filteredAdventures = adventures.filter(adventure => 
        adventure.title.toLowerCase().includes(search.toLowerCase()) || 
        adventure.description.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (statusFilter !== 'all') {
      filteredAdventures = filteredAdventures.filter(adventure => adventure.status === statusFilter);
    }
    
    res.render('servers/adventures', {
      title: 'Gestión de Aventuras',
      guild,
      req,
      serverConfig,
      adventures: filteredAdventures,
      search,
      statusFilter
    });
  } catch (error) {
    console.error('Error al cargar la gestión de aventuras:', error);
    res.redirect('/error?message=Error al cargar la gestión de aventuras&status=500');
  }
});

// Página para crear una nueva aventura
router.get('/:guildId/adventures/new', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener todas las misiones disponibles
    const missions = await Mission.find({ 
      serverId: guildId,
      status: { $in: ['active', 'draft'] }
    });
    
    // Obtener los items disponibles para recompensas
    const items = await Item.find({ serverId: guildId, enabled: true });
    
    // Obtener las habilidades disponibles para recompensas
    const skills = await Skill.find({ serverId: guildId, enabled: true });
    
    res.render('servers/adventureNew', {
      title: 'Crear Nueva Aventura',
      guild,
      req,
      serverConfig,
      missions,
      items,
      skills,
      adventure: null
    });
  } catch (error) {
    console.error('Error al cargar la página de nueva aventura:', error);
    res.redirect('/error?message=Error al cargar la página de nueva aventura&status=500');
  }
});

// Procesar la creación de una nueva aventura
router.post('/:guildId/adventures/new', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Validar datos del formulario
    const {
      title,
      description,
      levelRequired,
      raceRestrictions,
      classRestrictions,
      restrictionReasons,
      missionIds,
      missionRequired,
      rewardExperience,
      rewardCurrency,
      rewardItems,
      rewardItemsQuantity,
      rewardSkills,
      availableFrom,
      availableUntil,
      image,
      status,
      featured
    } = req.body;
    
    // Preparar las restricciones de raza/clase y sus razones
    const raceRestrictionArray = Array.isArray(raceRestrictions) ? raceRestrictions : (raceRestrictions ? [raceRestrictions] : []);
    const classRestrictionArray = Array.isArray(classRestrictions) ? classRestrictions : (classRestrictions ? [classRestrictions] : []);
    
    // Crear un Map para las razones de restricción
    const restrictionReasonsMap = new Map();
    
    if (restrictionReasons && typeof restrictionReasons === 'object') {
      Object.entries(restrictionReasons).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          restrictionReasonsMap.set(key, value);
        }
      });
    }
    
    // Preparar las misiones de la aventura
    const missionsArray = [];
    if (missionIds) {
      const ids = Array.isArray(missionIds) ? missionIds : [missionIds];
      const required = Array.isArray(missionRequired) ? missionRequired : [missionRequired];
      
      ids.forEach((missionId, index) => {
        if (missionId && missionId.trim() !== '') {
          missionsArray.push({
            missionId,
            required: required.includes(missionId) || required.includes(index.toString())
          });
        }
      });
    }
    
    // Preparar las recompensas de finalización
    const rewardItemsArray = [];
    if (rewardItems) {
      const itemIds = Array.isArray(rewardItems) ? rewardItems : [rewardItems];
      const quantities = Array.isArray(rewardItemsQuantity) ? rewardItemsQuantity : [rewardItemsQuantity];
      
      itemIds.forEach((itemId, index) => {
        const quantity = parseInt(quantities[index]) || 1;
        if (itemId && itemId.trim() !== '') {
          rewardItemsArray.push({
            itemId,
            quantity
          });
        }
      });
    }
    
    // Crear la nueva aventura
    const adventure = new Adventure({
      title,
      description,
      levelRequired: parseInt(levelRequired) || 1,
      raceRestrictions: raceRestrictionArray,
      classRestrictions: classRestrictionArray,
      restrictionReasons: restrictionReasonsMap,
      missions: missionsArray,
      completionRewards: {
        experience: parseInt(rewardExperience) || 0,
        currency: parseInt(rewardCurrency) || 0,
        items: rewardItemsArray,
        skills: Array.isArray(rewardSkills) ? rewardSkills : (rewardSkills ? [rewardSkills] : [])
      },
      availableFrom: availableFrom ? new Date(availableFrom) : null,
      availableUntil: availableUntil ? new Date(availableUntil) : null,
      image: image || null,
      status: status || 'draft',
      featured: featured === 'on',
      serverId: guildId,
      createdBy: req.user.id
    });
    
    await adventure.save();
    
    res.redirect(`/servers/${guildId}/adventures?success=true`);
  } catch (error) {
    console.error('Error al crear la aventura:', error);
    res.redirect(`/servers/${req.params.guildId}/adventures/new?error=true`);
  }
});

// Ver/Editar una aventura existente
router.get('/:guildId/adventures/:adventureId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, adventureId } = req.params;
    const guild = req.guild;
    
    // Obtener la aventura
    const adventure = await Adventure.findById(adventureId);
    
    if (!adventure || adventure.serverId !== guildId) {
      return res.redirect('/error?message=Aventura no encontrada&status=404');
    }
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener todas las misiones disponibles
    const missions = await Mission.find({ 
      serverId: guildId,
      status: { $in: ['active', 'draft'] }
    });
    
    // Obtener los items disponibles para recompensas
    const items = await Item.find({ serverId: guildId });
    
    // Obtener las habilidades disponibles para recompensas
    const skills = await Skill.find({ serverId: guildId });
    
    res.render('servers/adventureEdit', {
      title: `Editar Aventura - ${adventure.title}`,
      guild,
      req,
      serverConfig,
      adventure,
      missions,
      items,
      skills
    });
  } catch (error) {
    console.error('Error al cargar la aventura para editar:', error);
    res.redirect('/error?message=Error al cargar la aventura&status=500');
  }
});

// Actualizar una aventura existente
router.post('/:guildId/adventures/:adventureId', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, adventureId } = req.params;
    
    // Obtener la aventura
    const adventure = await Adventure.findById(adventureId);
    
    if (!adventure || adventure.serverId !== guildId) {
      return res.redirect('/error?message=Aventura no encontrada&status=404');
    }
    
    // Validar datos del formulario (similar a la creación)
    const {
      title,
      description,
      levelRequired,
      raceRestrictions,
      classRestrictions,
      restrictionReasons,
      missionIds,
      missionRequired,
      rewardExperience,
      rewardCurrency,
      rewardItems,
      rewardItemsQuantity,
      rewardSkills,
      availableFrom,
      availableUntil,
      image,
      status,
      featured
    } = req.body;
    
    // Actualizar campos básicos
    adventure.title = title || adventure.title;
    adventure.description = description || adventure.description;
    adventure.levelRequired = parseInt(levelRequired) || 1;
    adventure.raceRestrictions = Array.isArray(raceRestrictions) ? raceRestrictions : (raceRestrictions ? [raceRestrictions] : []);
    adventure.classRestrictions = Array.isArray(classRestrictions) ? classRestrictions : (classRestrictions ? [classRestrictions] : []);
    
    // Actualizar razones de restricción
    const restrictionReasonsMap = new Map();
    if (restrictionReasons && typeof restrictionReasons === 'object') {
      Object.entries(restrictionReasons).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          restrictionReasonsMap.set(key, value);
        }
      });
    }
    adventure.restrictionReasons = restrictionReasonsMap;
    
    // Actualizar misiones
    const missionsArray = [];
    if (missionIds) {
      const ids = Array.isArray(missionIds) ? missionIds : [missionIds];
      const required = Array.isArray(missionRequired) ? missionRequired : [missionRequired];
      
      ids.forEach((missionId, index) => {
        if (missionId && missionId.trim() !== '') {
          missionsArray.push({
            missionId,
            required: required.includes(missionId) || required.includes(index.toString())
          });
        }
      });
      
      adventure.missions = missionsArray;
    }
    
    // Actualizar recompensas
    const rewardItemsArray = [];
    if (rewardItems) {
      const itemIds = Array.isArray(rewardItems) ? rewardItems : [rewardItems];
      const quantities = Array.isArray(rewardItemsQuantity) ? rewardItemsQuantity : [rewardItemsQuantity];
      
      itemIds.forEach((itemId, index) => {
        const quantity = parseInt(quantities[index]) || 1;
        if (itemId && itemId.trim() !== '') {
          rewardItemsArray.push({
            itemId,
            quantity
          });
        }
      });
    }
    
    adventure.completionRewards = {
      experience: parseInt(rewardExperience) || 0,
      currency: parseInt(rewardCurrency) || 0,
      items: rewardItemsArray,
      skills: Array.isArray(rewardSkills) ? rewardSkills : (rewardSkills ? [rewardSkills] : [])
    };
    
    // Actualizar disponibilidad
    adventure.availableFrom = availableFrom ? new Date(availableFrom) : null;
    adventure.availableUntil = availableUntil ? new Date(availableUntil) : null;
    
    // Actualizar otros campos
    adventure.image = image || adventure.image;
    adventure.status = status || 'draft';
    adventure.featured = featured === 'on';
    
    await adventure.save();
    
    res.redirect(`/servers/${guildId}/adventures?updated=true`);
  } catch (error) {
    console.error('Error al actualizar la aventura:', error);
    res.redirect(`/servers/${req.params.guildId}/adventures/${req.params.adventureId}?error=true`);
  }
});

// Eliminar una aventura
router.post('/:guildId/adventures/:adventureId/delete', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId, adventureId } = req.params;
    
    // Obtener la aventura
    const adventure = await Adventure.findById(adventureId);
    
    if (!adventure || adventure.serverId !== guildId) {
      return res.redirect('/error?message=Aventura no encontrada&status=404');
    }
    
    // Verificar si algún perfil tiene esta aventura activa
    const profilesWithAdventure = await Profile.find({
      serverId: guildId,
      'progress.activeAdventures.adventureId': adventureId
    });
    
    if (profilesWithAdventure.length > 0) {
      // Si hay perfiles con esta aventura activa, cambiar estado a "expired" en lugar de eliminar
      adventure.status = 'expired';
      await adventure.save();
      
      return res.redirect(`/servers/${guildId}/adventures?expired=true`);
    }
    
    // Si no hay referencias a la aventura, eliminarla
    await Adventure.findByIdAndDelete(adventureId);
    
    res.redirect(`/servers/${guildId}/adventures?deleted=true`);
  } catch (error) {
    console.error('Error al eliminar la aventura:', error);
    res.redirect(`/servers/${req.params.guildId}/adventures?error=true`);
  }
});

// =========================
// RUTAS PARA GESTIÓN DE RAZAS Y CLASES
// =========================

// Ver página de gestión de razas y clases
router.get('/:guildId/race-class', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    const races = await Race.find({ serverId: guildId });
    const classes = await Class.find({ serverId: guildId });
    
    res.render('servers/raceClass', {
      title: 'Configuración de Razas y Clases',
      guild,
      req,
      serverConfig,
      races,
      classes
    });
  } catch (error) {
    console.error('Error al cargar la configuración de razas y clases:', error);
    res.redirect('/error?message=Error al cargar la configuración de razas y clases&status=500');
  }
});

// Guardar configuración de razas y clases
router.post('/:guildId/race-class', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Obtener datos del formulario
    const {
      races,
      raceDescriptions,
      classes,
      classDescriptions,
      raceClassRestrictions
    } = req.body;
    
    // Actualizar configuración de roleplay
    
    // Actualizar razas disponibles
    if (races) {
      serverConfig.roleplay.races = Array.isArray(races) ? races : races.split(',').map(race => race.trim());
    }
    
    // Actualizar clases disponibles
    if (classes) {
      serverConfig.roleplay.classes = Array.isArray(classes) ? classes : classes.split(',').map(cls => cls.trim());
    }
    
    // Actualizar descripciones de razas
    if (raceDescriptions && typeof raceDescriptions === 'object') {
      const raceDescMap = new Map();
      
      Object.entries(raceDescriptions).forEach(([race, description]) => {
        if (description && description.trim() !== '') {
          raceDescMap.set(race, description);
        }
      });
      
      serverConfig.roleplay.raceDescriptions = raceDescMap;
    }
    
    // Actualizar descripciones de clases
    if (classDescriptions && typeof classDescriptions === 'object') {
      const classDescMap = new Map();
      
      Object.entries(classDescriptions).forEach(([cls, description]) => {
        if (description && description.trim() !== '') {
          classDescMap.set(cls, description);
        }
      });
      
      serverConfig.roleplay.classDescriptions = classDescMap;
    }
    
    // Actualizar restricciones de raza-clase
    if (raceClassRestrictions && typeof raceClassRestrictions === 'object') {
      const restrictionsMap = new Map();
      
      Object.entries(raceClassRestrictions).forEach(([race, allowedClasses]) => {
        if (allowedClasses) {
          restrictionsMap.set(race, Array.isArray(allowedClasses) ? allowedClasses : [allowedClasses]);
        }
      });
      
      serverConfig.roleplay.raceClassRestrictions = restrictionsMap;
    }
    
    // Guardar los cambios
    await serverConfig.save();
    
    res.redirect(`/servers/${guildId}/race-class?success=true`);
  } catch (error) {
    console.error('Error al guardar la configuración de razas y clases:', error);
    res.redirect(`/servers/${req.params.guildId}/race-class?error=true`);
  }
});

// =========================
// RUTA PARA GESTIÓN DEL CANAL DE PERFILES
// =========================

// Configurar canal de perfiles
router.post('/:guildId/profile-channel', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Actualizar configuración del canal de perfiles
    const {
      profilesChannel,
      autoCreateProfileChannels,
      profileChannelCategory
    } = req.body;
    
    serverConfig.config.profilesChannel = profilesChannel || null;
    serverConfig.config.autoCreateProfileChannels = autoCreateProfileChannels === 'on';
    serverConfig.config.profileChannelCategory = profileChannelCategory || null;
    
    await serverConfig.save();
    
    res.redirect(`/servers/${guildId}/settings?success=true`);
  } catch (error) {
    console.error('Error al configurar el canal de perfiles:', error);
    res.redirect(`/servers/${req.params.guildId}/settings?error=true`);
  }
});

// Regenerar canal de perfiles
router.post('/:guildId/regenerate-profiles', checkBotInGuild, isGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId: guildId });
    
    // Verificar si existe el canal de perfiles
    if (!serverConfig.config.profilesChannel) {
      return res.redirect(`/servers/${guildId}/settings?error=No hay un canal de perfiles configurado`);
    }
    
    // Obtener el canal
    const profilesChannel = guild.channels.cache.get(serverConfig.config.profilesChannel);
    
    if (!profilesChannel) {
      return res.redirect(`/servers/${guildId}/settings?error=No se pudo encontrar el canal de perfiles`);
    }
    
    // Obtener todos los perfiles del servidor
    const profiles = await Profile.find({ serverId: guildId });
    
    // Generar mensaje con los perfiles
    let message = '# Perfiles de personajes\n\n';
    
    for (const profile of profiles) {
      try {
        const member = await guild.members.fetch(profile.userId).catch(() => null);
        
        message += `## ${profile.character.name || 'Sin nombre'}\n`;
        
        if (profile.character.avatar) {
          message += `![Avatar](${profile.character.avatar})\n\n`;
        }
        
        message += `**Usuario:** ${member ? member.user.tag : 'Usuario desconocido'}\n`;
        message += `**Raza:** ${profile.character.race || 'No especificada'}\n`;
        message += `**Clase:** ${profile.character.class || 'No especificada'}\n`;
        message += `**Nivel:** ${profile.character.level}\n\n`;
        
        if (profile.character.bio) {
          message += `**Biografía:** ${profile.character.bio}\n\n`;
        }
        
        message += '---\n\n';
      } catch (err) {
        console.error(`Error al procesar perfil ${profile._id}:`, err);
      }
    }
    
    // Limpiar el canal y enviar el nuevo mensaje
    await profilesChannel.bulkDelete(100).catch(() => {});
    
    // Dividir el mensaje si es demasiado largo (Discord tiene un límite de 2000 caracteres)
    const messageParts = [];
    let currentPart = '';
    
    message.split('\n\n').forEach(paragraph => {
      if ((currentPart + paragraph).length > 1900) {
        messageParts.push(currentPart);
        currentPart = paragraph + '\n\n';
      } else {
        currentPart += paragraph + '\n\n';
      }
    });
    
    if (currentPart) {
      messageParts.push(currentPart);
    }
    
    // Enviar cada parte como un mensaje separado
    for (const part of messageParts) {
      await profilesChannel.send(part);
    }
    
    res.redirect(`/servers/${guildId}/settings?success=Canal de perfiles regenerado correctamente`);
  } catch (error) {
    console.error('Error al regenerar el canal de perfiles:', error);
    res.redirect(`/servers/${req.params.guildId}/settings?error=Error al regenerar el canal de perfiles`);
  }
});

// Ruta para ver misiones activas del usuario
router.get('/:guildId/missions-active', checkBotInGuild, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = req.guild;
    
    // Buscar el perfil del usuario
    const profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    if (!profile) {
      return res.redirect(`/servers/${guildId}/profile?error=No tienes un perfil en este servidor`);
    }
    
    // Si no tiene misiones activas
    if (!profile.progress.activeMissions || profile.progress.activeMissions.length === 0) {
      return res.render('servers/mission-empty', {
        title: 'Misiones Activas',
        guild,
        req,
        message: 'No tienes misiones activas. Acepta nuevas misiones para comenzar tu aventura.',
        type: 'active'
      });
    }
    
    // Obtener misiones activas con detalles
    const missionIds = profile.progress.activeMissions.map(m => m.missionId);
    const missions = await Mission.find({
      _id: { $in: missionIds },
      serverId: guildId
    });
    
    // Mapear misiones con su progreso
    const activeMissions = missions.map(mission => {
      const progress = profile.progress.activeMissions.find(m => m.missionId === mission._id.toString());
      return {
        mission,
        progress
      };
    });
    
    res.render('servers/mission-active', {
      title: 'Misiones Activas',
      guild,
      req,
      profile,
      activeMissions
    });
    
  } catch (error) {
    console.error('Error al cargar misiones activas:', error);
    res.redirect(`/servers/${req.params.guildId}?error=Error al cargar misiones activas`);
  }
});

// Ruta para ver detalles de una misión activa específica
router.get('/:guildId/missions/:missionId/progress', checkBotInGuild, async (req, res) => {
  try {
    const { guildId, missionId } = req.params;
    const guild = req.guild;
    
    // Buscar el perfil del usuario
    const profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    if (!profile) {
      return res.redirect(`/servers/${guildId}/profile?error=No tienes un perfil en este servidor`);
    }
    
    // Buscar la misión activa
    const activeMission = profile.progress.activeMissions.find(m => m.missionId === missionId);
    
    if (!activeMission) {
      return res.redirect(`/servers/${guildId}/missions/active?error=No tienes esa misión activa`);
    }
    
    // Obtener detalles de la misión
    const mission = await Mission.findById(missionId);
    
    if (!mission || mission.serverId !== guildId) {
      return res.redirect(`/servers/${guildId}/missions/active?error=Misión no encontrada`);
    }
    
    res.render('servers/mission-progress', {
      title: `Misión: ${mission.title}`,
      guild,
      req,
      profile,
      mission,
      activeMission
    });
    
  } catch (error) {
    console.error('Error al cargar progreso de misión:', error);
    res.redirect(`/servers/${req.params.guildId}/missions/active?error=Error al cargar progreso`);
  }
});

// Ruta para iniciar un desafío específico
router.get('/:guildId/missions/:missionId/challenge/:type', checkBotInGuild, async (req, res) => {
  try {
    const { guildId, missionId, type } = req.params;
    const guild = req.guild;
    
    // Buscar el perfil del usuario
    const profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    if (!profile) {
      return res.redirect(`/servers/${guildId}/profile?error=No tienes un perfil en este servidor`);
    }
    
    // Buscar la misión activa
    const activeMissionIndex = profile.progress.activeMissions.findIndex(m => m.missionId === missionId);
    
    if (activeMissionIndex === -1) {
      return res.redirect(`/servers/${guildId}/missions/active?error=No tienes esa misión activa`);
    }
    
    const activeMission = profile.progress.activeMissions[activeMissionIndex];
    
    // Si la misión ya está completada
    if (activeMission.completed) {
      return res.redirect(`/servers/${guildId}/missions/${missionId}/progress?error=Esta misión ya está completada`);
    }
    
    // Obtener detalles de la misión
    const mission = await Mission.findById(missionId);
    
    if (!mission || mission.serverId !== guildId) {
      return res.redirect(`/servers/${guildId}/missions/active?error=Misión no encontrada`);
    }
    
    // Verificar que la etapa actual tenga un desafío del tipo especificado
    const currentStage = mission.stages[activeMission.currentStage];
    
    if (!currentStage || currentStage.taskType !== type) {
      return res.redirect(`/servers/${guildId}/missions/${missionId}/progress?error=Tipo de desafío incorrecto`);
    }
    
    // Renderizar la vista apropiada según el tipo de desafío
    switch (type) {
      case 'combat':
        return res.render('servers/challenge-combat', {
          title: `Combate: ${currentStage.name}`,
          guild,
          req,
          profile,
          mission,
          activeMission,
          currentStage
        });
        
      case 'puzzle':
        return res.render('servers/challenge-puzzle', {
          title: `Puzzle: ${currentStage.name}`,
          guild,
          req,
          profile,
          mission,
          activeMission,
          currentStage
        });
        
      case 'minigame':
        return res.render('servers/challenge-minigame', {
          title: `Minijuego: ${currentStage.name}`,
          guild,
          req,
          profile,
          mission,
          activeMission,
          currentStage
        });
        
      case 'dialogue':
        return res.render('servers/challenge-dialogue', {
          title: `Diálogo: ${currentStage.name}`,
          guild,
          req,
          profile,
          mission,
          activeMission,
          currentStage
        });
        
      default:
        return res.redirect(`/servers/${guildId}/missions/${missionId}/progress?error=Tipo de desafío no soportado`);
    }
    
  } catch (error) {
    console.error('Error al iniciar desafío:', error);
    res.redirect(`/servers/${req.params.guildId}/missions/active?error=Error al iniciar desafío`);
  }
});

// Ruta POST para completar un desafío
router.post('/:guildId/missions/:missionId/challenge/:type/complete', checkBotInGuild, async (req, res) => {
  try {
    const { guildId, missionId, type } = req.params;
    const { success, data } = req.body;
    
    // Buscar el perfil del usuario
    const profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    if (!profile) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }
    
    // Buscar la misión activa
    const activeMissionIndex = profile.progress.activeMissions.findIndex(m => m.missionId === missionId);
    
    if (activeMissionIndex === -1) {
      return res.status(404).json({ error: 'Misión no encontrada' });
    }
    
    const activeMission = profile.progress.activeMissions[activeMissionIndex];
    
    // Obtener detalles de la misión
    const mission = await Mission.findById(missionId);
    
    if (!mission || mission.serverId !== guildId) {
      return res.status(404).json({ error: 'Misión no encontrada en el servidor' });
    }
    
    // Si el desafío fue completado con éxito
    if (success) {
      // Marcar la etapa actual como completada
      activeMission.progress = 100;
      
      // Verificar si hay más etapas
      if (activeMission.currentStage < mission.stages.length - 1) {
        // Avanzar a la siguiente etapa
        activeMission.currentStage++;
        activeMission.progress = 0;
      } else {
        // Marcar la misión como completada
        activeMission.completed = true;
      }
      
      // Guardar cambios en el perfil
      await profile.save();
      
      return res.json({
        success: true,
        completed: activeMission.completed,
        nextStage: activeMission.currentStage,
        message: activeMission.completed ? 
          '¡Has completado todas las etapas de la misión!' : 
          `Has avanzado a la etapa ${activeMission.currentStage + 1}`
      });
    } else {
      // Si el desafío no fue completado
      return res.json({
        success: false,
        message: 'No has completado el desafío. Inténtalo de nuevo.'
      });
    }
    
  } catch (error) {
    console.error('Error al completar desafío:', error);
    res.status(500).json({ error: 'Error al procesar el desafío' });
  }
});

// Ruta para completar misión y reclamar recompensas
router.get('/:guildId/missions/:missionId/complete', checkBotInGuild, async (req, res) => {
  try {
    const { guildId, missionId } = req.params;
    const guild = req.guild;
    
    // Buscar el perfil del usuario
    const profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    if (!profile) {
      return res.redirect(`/servers/${guildId}/profile?error=No tienes un perfil en este servidor`);
    }
    
    // Buscar la misión activa
    const activeMissionIndex = profile.progress.activeMissions.findIndex(m => m.missionId === missionId);
    
    if (activeMissionIndex === -1) {
      return res.redirect(`/servers/${guildId}/missions/active?error=No tienes esa misión activa`);
    }
    
    const activeMission = profile.progress.activeMissions[activeMissionIndex];
    
    // Verificar que la misión esté completada
    if (!activeMission.completed) {
      return res.redirect(`/servers/${guildId}/missions/${missionId}/progress?error=Esta misión no está completada`);
    }
    
    // Obtener detalles de la misión
    const mission = await Mission.findById(missionId);
    
    if (!mission || mission.serverId !== guildId) {
      return res.redirect(`/servers/${guildId}/missions/active?error=Misión no encontrada`);
    }
    
    // Renderizar vista de confirmación para reclamar recompensas
    res.render('servers/mission-complete', {
      title: `Completar Misión: ${mission.title}`,
      guild,
      req,
      profile,
      mission,
      activeMission
    });
    
  } catch (error) {
    console.error('Error al cargar página de completar misión:', error);
    res.redirect(`/servers/${req.params.guildId}/missions/active?error=Error al cargar página de completar`);
  }
});

// Ruta POST para reclamar recompensas
router.post('/:guildId/missions/:missionId/claim-rewards', checkBotInGuild, async (req, res) => {
  try {
    const { guildId, missionId } = req.params;
    
    // Buscar el perfil del usuario
    const profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    if (!profile) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }
    
    // Buscar la misión activa
    const activeMissionIndex = profile.progress.activeMissions.findIndex(m => m.missionId === missionId);
    
    if (activeMissionIndex === -1) {
      return res.status(404).json({ error: 'Misión no encontrada' });
    }
    
    const activeMission = profile.progress.activeMissions[activeMissionIndex];
    
    // Verificar que la misión esté completada
    if (!activeMission.completed) {
      return res.status(400).json({ error: 'Esta misión no está completada' });
    }
    
    // Obtener detalles de la misión
    const mission = await Mission.findById(missionId);
    
    if (!mission || mission.serverId !== guildId) {
      return res.status(404).json({ error: 'Misión no encontrada en el servidor' });
    }
    
    // Aplicar recompensas
    const rewards = {
      experience: 0,
      currency: 0,
      items: [],
      skills: []
    };
    
    // Experiencia
    if (mission.rewards.experience > 0) {
      profile.character.experience += mission.rewards.experience;
      rewards.experience = mission.rewards.experience;
      
      // Verificar si sube de nivel
      const oldLevel = profile.character.level;
      
      // Fórmula de nivel: cada nivel requiere un 20% más de experiencia que el anterior
      let expRequired = 100;
      let currentLevel = 1;
      let remainingExp = profile.character.experience;
      
      while (remainingExp >= expRequired) {
        remainingExp -= expRequired;
        currentLevel++;
        expRequired = Math.floor(expRequired * 1.2);
      }
      
      profile.character.level = currentLevel;
      
      if (currentLevel > oldLevel) {
        rewards.levelUp = {
          from: oldLevel,
          to: currentLevel
        };
      }
    }
    
    // Monedas
    if (mission.rewards.currency > 0) {
      profile.character.currency += mission.rewards.currency;
      rewards.currency = mission.rewards.currency;
    }
    
    // Items
    if (mission.rewards.items && mission.rewards.items.length > 0) {
      for (const rewardItem of mission.rewards.items) {
        const item = await Item.findById(rewardItem.itemId);
        
        if (item) {
          // Añadir el item al inventario
          const existingItemIndex = profile.character.inventory.findIndex(i => i.itemId === rewardItem.itemId);
          
          if (existingItemIndex !== -1) {
            profile.character.inventory[existingItemIndex].quantity += rewardItem.quantity;
          } else {
            profile.character.inventory.push({
              itemId: rewardItem.itemId,
              quantity: rewardItem.quantity,
              equipped: false,
              uses: item.maxUses > 0 ? item.maxUses : null
            });
          }
          
          rewards.items.push({
            name: item.name,
            quantity: rewardItem.quantity,
            item
          });
        }
      }
    }
    
    // Habilidades
    if (mission.rewards.skills && mission.rewards.skills.length > 0) {
      for (const skillId of mission.rewards.skills) {
        const skill = await Skill.findById(skillId);
        
        if (skill) {
          // Verificar si ya tiene la habilidad
          const existingSkillIndex = profile.character.skills.findIndex(s => s.skillId === skillId);
          
          if (existingSkillIndex === -1) {
            // Añadir la nueva habilidad
            profile.character.skills.push({
              skillId: skillId,
              level: 1,
              usesLeft: skill.maxUses > 0 ? skill.maxUses : null,
              cooldownUntil: null
            });
            
            rewards.skills.push({
              name: skill.name,
              skill
            });
          }
        }
      }
    }
    
    // Mover la misión de activas a completadas
    profile.progress.completedMissions.push({
      missionId: missionId,
      completedAt: new Date()
    });
    
    // Eliminar la misión de activas
    profile.progress.activeMissions.splice(activeMissionIndex, 1);
    
    // Actualizar estadísticas de misiones
    profile.stats.quests.completed += 1;
    
    // Verificar si la misión forma parte de una aventura
    const adventures = await Adventure.find({
      serverId: guildId,
      'missions.missionId': missionId,
      status: 'active'
    });
    
    const adventureUpdates = [];
    
    for (const adventure of adventures) {
      // Verificar si el usuario tiene la aventura activa
      const activeAdventureIndex = profile.progress.activeAdventures.findIndex(a => a.adventureId === adventure._id.toString());
      
      if (activeAdventureIndex !== -1) {
        const activeAdventure = profile.progress.activeAdventures[activeAdventureIndex];
        
        // Marcar la misión como completada en la aventura
        if (!activeAdventure.completedMissions.includes(missionId)) {
          activeAdventure.completedMissions.push(missionId);
          
          // Verificar si se ha completado la aventura
          const requiredMissions = adventure.missions.filter(m => m.required).map(m => m.missionId);
          const allRequiredCompleted = requiredMissions.every(m => activeAdventure.completedMissions.includes(m));
          
          if (allRequiredCompleted) {
            activeAdventure.completed = true;
            adventureUpdates.push({
              title: adventure.title,
              id: adventure._id,
              completed: true
            });
          } else {
            const remainingRequired = requiredMissions.filter(m => !activeAdventure.completedMissions.includes(m)).length;
            adventureUpdates.push({
              title: adventure.title,
              id: adventure._id,
              completed: false,
              remainingMissions: remainingRequired
            });
          }
        }
      }
    }
    
    // Guardar cambios en el perfil
    await profile.save();
    
    res.json({
      success: true,
      rewards,
      adventureUpdates
    });
    
  } catch (error) {
    console.error('Error al reclamar recompensas:', error);
    res.status(500).json({ error: 'Error al reclamar recompensas' });
  }
});

module.exports = router;