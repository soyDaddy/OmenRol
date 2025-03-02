// profileUtils.js
const botClient = require('../bot/index');
const Server = require('../models/Server');

async function createOrUpdateProfileChannel(serverId, userId, profile) {
  try {
    // Verificar si el bot está disponible
    if (!botClient) {
      console.error('Bot no disponible para crear canal de perfil');
      return null;
    }
    
    // Obtener el servidor de Discord
    const guild = botClient.guilds.cache.get(serverId);
    
    if (!guild) {
      console.error(`Servidor ${serverId} no encontrado`);
      return null;
    }
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId });
    
    if (!serverConfig || !serverConfig.config.autoCreateProfileChannels) {
      return null; // La creación automática está desactivada
    }
    
    // Verificar si existe una categoría para los perfiles
    let category;
    if (serverConfig.config.profileChannelCategory) {
      category = guild.channels.cache.get(serverConfig.config.profileChannelCategory);
    }
    
    // Si no hay categoría configurada o no se encontró, usar el canal general de perfiles
    if (!category && serverConfig.config.profilesChannel) {
      // En este caso, no creamos un canal individual sino que actualizamos el canal general
      await updateGeneralProfilesChannel(serverId);
      return serverConfig.config.profilesChannel;
    }
    
    // Verificar si ya existe un canal de perfil para este usuario
    if (profile.profileChannelId) {
      const existingChannel = guild.channels.cache.get(profile.profileChannelId);
      
      if (existingChannel) {
        // Actualizar el canal existente
        await updateProfileChannel(existingChannel, userId, profile, guild);
        return profile.profileChannelId;
      }
    }
    
    // Si llegamos aquí, necesitamos crear un nuevo canal
    // Primero obtener el miembro para sus permisos
    const member = await guild.members.fetch(userId).catch(() => null);
    
    if (!member) {
      console.error(`Miembro ${userId} no encontrado en el servidor ${serverId}`);
      return null;
    }
    
    // Crear el canal
    const characterName = profile.character.name || `Perfil-${member.user.username}`;
    const sanitizedName = characterName.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 30);
    
    const channelOptions = {
      type: 0, // Canal de texto
      topic: `Perfil de rol de ${characterName} (${member.user.tag})`,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          allow: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
          deny: ['SEND_MESSAGES']
        },
        {
          id: userId,
          allow: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
          deny: ['SEND_MESSAGES']
        },
        {
          id: botClient.user.id, // El bot
          allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_MESSAGES', 'READ_MESSAGE_HISTORY']
        }
      ]
    };
    
    // Si hay categoría, añadirla a las opciones
    if (category) {
      channelOptions.parent = category.id;
    }
    
    const channel = await guild.channels.create(`perfil-${sanitizedName}`, channelOptions);
    
    // Actualizar el nuevo canal con la información del perfil
    await updateProfileChannel(channel, userId, profile, guild);
    
    return channel.id;
  } catch (error) {
    console.error('Error al crear/actualizar canal de perfil:', error);
    return null;
  }
}

/**
 * Actualiza el contenido de un canal de perfil individual
 * @param {object} channel - Objeto de canal de Discord
 * @param {string} userId - ID del usuario
 * @param {object} profile - Objeto de perfil
 * @param {object} guild - Objeto del servidor de Discord
 */
async function updateProfileChannel(channel, userId, profile, guild) {
  try {
    // Limpiar el canal
    await channel.bulkDelete(100).catch(() => {});
    
    // Obtener el miembro
    const member = await guild.members.fetch(userId).catch(() => null);
    const username = member ? member.user.tag : 'Usuario desconocido';
    
    // Crear mensaje de perfil
    let message = `# Perfil de ${profile.character.name || 'Sin nombre'}\n\n`;
    
    if (profile.character.avatar) {
      message += `![Avatar](${profile.character.avatar})\n\n`;
    }
    
    message += `**Usuario Discord:** ${username}\n`;
    message += `**Raza:** ${profile.character.race || 'No especificada'}\n`;
    message += `**Clase:** ${profile.character.class || 'No especificada'}\n`;
    message += `**Nivel:** ${profile.character.level}\n`;
    message += `**Experiencia:** ${profile.character.experience}\n`;
    
    // Añadir estadísticas
    message += `\n## Estadísticas\n\n`;
    message += `**Salud:** ${profile.character.health.current}/${profile.character.health.max}\n`;
    message += `**Maná:** ${profile.character.mana.current}/${profile.character.mana.max}\n`;
    message += `**Fuerza:** ${profile.character.stats.strength}\n`;
    message += `**Inteligencia:** ${profile.character.stats.intelligence}\n`;
    message += `**Destreza:** ${profile.character.stats.dexterity}\n`;
    message += `**Defensa:** ${profile.character.stats.defense}\n`;
    message += `**Monedas:** ${profile.character.currency}\n`;
    
    // Añadir biografía si existe
    if (profile.character.bio) {
      message += `\n## Biografía\n\n${profile.character.bio}\n`;
    }
    
    // Añadir habilidades
    if (profile.character.skills && profile.character.skills.length > 0) {
      message += `\n## Habilidades\n\n`;
      
      for (const skill of profile.character.skills) {
        message += `- **${skill.skillId}** (Nivel ${skill.level})\n`;
      }
    }
    
    // Añadir inventario
    if (profile.character.inventory && profile.character.inventory.length > 0) {
      message += `\n## Inventario\n\n`;
      
      for (const item of profile.character.inventory) {
        let itemStatus = '';
        if (item.equipped) {
          itemStatus = ' (Equipado)';
        } else if (item.uses !== null) {
          itemStatus = ` (Usos: ${item.uses})`;
        }
        
        message += `- **${item.itemId}** x${item.quantity}${itemStatus}\n`;
      }
    }
    
    // Añadir misiones activas
    if (profile.progress.activeMissions && profile.progress.activeMissions.length > 0) {
      message += `\n## Misiones activas\n\n`;
      
      for (const mission of profile.progress.activeMissions) {
        let status = mission.completed ? 'Completada' : `En progreso (${mission.progress}%)`;
        message += `- **${mission.missionId}** - ${status}\n`;
      }
    }
    
    // Enviar el mensaje
    await channel.send(message);
    
  } catch (error) {
    console.error('Error al actualizar canal de perfil:', error);
  }
}

/**
 * Actualiza el canal general de perfiles
 * @param {string} serverId - ID del servidor
 */
async function updateGeneralProfilesChannel(serverId) {
  try {
    // Verificar si el bot está disponible
    if (!botClient) {
      console.error('Bot no disponible para actualizar canal de perfiles');
      return;
    }
    
    // Obtener el servidor de Discord
    const guild = botClient.guilds.cache.get(serverId);
    
    if (!guild) {
      console.error(`Servidor ${serverId} no encontrado`);
      return;
    }
    
    // Obtener la configuración del servidor
    const serverConfig = await Server.findOne({ serverId });
    
    if (!serverConfig || !serverConfig.config.profilesChannel) {
      return; // No hay canal configurado
    }
    
    const channel = guild.channels.cache.get(serverConfig.config.profilesChannel);
    
    if (!channel) {
      console.error(`Canal de perfiles ${serverConfig.config.profilesChannel} no encontrado`);
      return;
    }
    
    // Obtener todos los perfiles del servidor
    const Profile = require('../models/Profile');
    const profiles = await Profile.find({ serverId });
    
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
          const shortBio = profile.character.bio.length > 100 
            ? profile.character.bio.substring(0, 100) + '...' 
            : profile.character.bio;
          message += `**Biografía:** ${shortBio}\n\n`;
        }
        
        // Añadir enlace al canal individual si existe
        if (profile.profileChannelId) {
          const profileChannel = guild.channels.cache.get(profile.profileChannelId);
          if (profileChannel) {
            message += `[Ver perfil completo](https://discord.com/channels/${serverId}/${profile.profileChannelId})\n\n`;
          }
        }
        
        message += '---\n\n';
      } catch (err) {
        console.error(`Error al procesar perfil ${profile._id}:`, err);
      }
    }
    
    // Limpiar el canal y enviar el nuevo mensaje
    await channel.bulkDelete(100).catch(() => {});
    
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
      await channel.send(part);
    }
    
  } catch (error) {
    console.error('Error al actualizar canal general de perfiles:', error);
  }
}

module.exports = {
  createOrUpdateProfileChannel,
  updateProfileChannel,
  updateGeneralProfilesChannel
};