const botClient = require('../bot/index');
const Server = require('../models/Server');
const Item = require('../models/Items');
const Skill = require('../models/Skill');
const { Mission } = require('../models/Missions');
const { PermissionsBitField, EmbedBuilder } = require('discord.js');

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
    const characterName = profile?.character?.name || member?.user?.username || `perfil-${userId}`;
    
    const sanitizedName = characterName.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 30) || `perfil-${userId}`;
    
    const channelOptions = {
      name: sanitizedName,
      type: 0, // Canal de texto
      topic: `Perfil de rol de ${characterName} (${member.user.tag})`,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
          deny: [PermissionsBitField.Flags.SendMessages]
        },
        {
          id: userId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
          deny: [PermissionsBitField.Flags.SendMessages]
        },
        {
          id: botClient.user.id, // El bot
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    };
    
    // Si hay categoría, añadirla a las opciones
    if (category) {
      channelOptions.parent = category.id;
    }
    
    const channel = await guild.channels.create(channelOptions);
    
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
    const username = member ? member.user.globalName || member.user.username : 'Usuario desconocido';

    // Crear el embed principal
    const embed = new EmbedBuilder()
      .setTitle(`📜 Perfil de ${profile.character.name || 'Sin nombre'}`)
      .setColor(0x7289DA) // Color del embed (puedes personalizarlo)
      .setThumbnail((profile.character.avatar && profile.character.avatar.startsWith('http')) ? profile.character.avatar : ('https://roleplay.pulsey.xyz'+profile.character.avatar) || guild.iconURL())
      .addFields(
        { name: '👤 Usuario Discord', value: username, inline: true },
        { name: '🧝 Raza', value: profile?.character?.race || 'No especificada', inline: true },
        { name: '⚔️ Clase', value: profile?.character?.class || 'No especificada', inline: true },
        { name: '📊 Nivel', value: `${profile?.character?.level}`, inline: true },
        { name: '⭐ Experiencia', value: `${profile?.character?.experience}`, inline: true },
        { name: '💰 Monedas', value: `${profile?.character?.currency}`, inline: true }
      )
      .addFields(
        { name: '❤️ Salud', value: `${profile?.character?.health?.current}/${profile?.character?.health?.max}`, inline: true },
        { name: '🔮 Maná', value: `${profile?.character?.mana?.current}/${profile?.character?.mana?.max}`, inline: true },
        { name: '💪 Fuerza', value: `${profile?.character?.stats?.strength}`, inline: true },
        { name: '🧠 Inteligencia', value: `${profile?.character?.stats?.intelligence}`, inline: true },
        { name: '🏹 Destreza', value: `${profile?.character?.stats?.dexterity}`, inline: true },
        { name: '🛡️ Defensa', value: `${profile?.character?.stats?.defense}`, inline: true }
      );

    // Añadir biografía si existe
    if (profile.character.bio) {
      const bio = profile.character.bio.length > 2048 ? profile.character.bio.slice(0, 2040) + '...' : profile.character.bio;
      embed.setDescription('📖 Biografía: \n\n'+ bio);
    }

   // Añadir habilidades
  if (profile.character.skills && profile.character.skills.length > 0) {
    const skillPromises = profile.character.skills.map(async skillData => {
      const skill = await Skill.findById(skillData.skillId);
      return `- **${skill.name}** (Nivel ${skillData.level})`;
    });
    
    // Esperar a que todas las promesas se resuelvan
    const skills = await Promise.all(skillPromises);
    embed.addFields({ name: '🔹 Habilidades', value: skills.join('\n') });
  }

  // Añadir inventario
  if (profile.character.inventory && profile.character.inventory.length > 0) {
    const inventoryPromises = profile.character.inventory.map(async itemData => {
      const item = await Item.findById(itemData.itemId);
      let status = '';
      if (itemData.equipped) status = ' (Equipado)';
      else if (itemData.uses !== null) status = ` (Usos: ${itemData.uses})`;
      return `- **${item.name}** x${itemData.quantity}${status}`;
    });
    
    // Esperar a que todas las promesas se resuelvan
    const inventory = await Promise.all(inventoryPromises);
    embed.addFields({ name: '🎒 Inventario', value: inventory.join('\n') });
  }

  // Añadir misiones activas
  if (profile.progress.activeMissions && profile.progress.activeMissions.length > 0) {
    const missionPromises = profile.progress.activeMissions.map(async missionData => {
      const mission = await Mission.findById(missionData.missionId);
      const status = missionData.completed ? '✅ Completada' : `⌛ En progreso (${missionData.generalProgress}%)`;
      return `- **${mission.title}** - ${status}`;
    });
    
    // Esperar a que todas las promesas se resuelvan
    const missions = await Promise.all(missionPromises);
    embed.addFields({ name: '📜 Misiones activas', value: missions.join('\n') });
  }

    // Enviar el embed
    await channel.send({ embeds: [embed] });

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