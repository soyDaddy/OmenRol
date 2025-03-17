const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');
const Item = require('../../../models/Items');
const Server = require('../../../models/Server');
const activityLogger = require('../../../utils/activityLogger');

// Crear un logger específico para este comando
const logger = activityLogger.createCommandLogger('inventario');

module.exports = {
  name: 'inventario',
  aliases: ['inv', 'items'],
  description: 'Muestra tu inventario o el de otro usuario',
  category: 'roleplay',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('inventario')
    .setDescription('Muestra tu inventario o el de otro usuario')
    .addUserOption(option => 
      option.setName('usuario')
      .setDescription('Usuario cuyo inventario quieres ver')
      .setRequired(false)),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client) {
    
    try {
      // Buscar configuración del servidor
      const serverConfig = await Server.findOne({ serverId: message.guild.id });
      
      if (!serverConfig || !serverConfig.roleplay.enabled) {
        // Registrar comando fallido
        await logger.execute(message, args, null, false);
        return message.reply('El sistema de roleplay no está habilitado en este servidor.');
      }
      
      // Determinar el usuario objetivo
      let targetUser = message.author;
      
      if (args.length > 0) {
        const mentionedUser = message.mentions.users.first();
        if (mentionedUser) {
          targetUser = mentionedUser;
        }
      }
      
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ 
        userId: targetUser.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        // Registrar comando fallido
        await logger.execute(message, args, null, false);
        return message.reply(targetUser.id === message.author.id ? 
          'No tienes un perfil de roleplay. Crea uno con el comando `!perfil`.' : 
          'Este usuario no tiene un perfil de roleplay.');
      }
      
      // Si el inventario está vacío
      if (!profile.character.inventory || profile.character.inventory.length === 0) {
        // Registrar comando exitoso pero sin inventario
        await logger.execute(message, args, profile, true);
        return message.reply(targetUser.id === message.author.id ? 
          'Tu inventario está vacío.' : 
          'El inventario de este usuario está vacío.');
      }
      
      // Buscar información de los items
      const itemIds = profile.character.inventory.map(item => item.itemId);
      const items = await Item.find({ 
        _id: { $in: itemIds },
        serverId: message.guild.id
      });
      
      // Crear mensaje de inventario
      const characterName = profile.character.name || targetUser.username;
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`Inventario de ${characterName}`)
        .setDescription(`Monedas: ${profile.character.currency}`)
        .setThumbnail(profile.character.avatar || targetUser.displayAvatarURL())
      
      // Agrupar items por tipo
      const equipmentItems = [];
      const consumableItems = [];
      const collectableItems = [];
      
      profile.character.inventory.forEach(inventoryItem => {
        const itemInfo = items.find(i => i._id.toString() === inventoryItem.itemId);
        
        if (!itemInfo) return; // Skip if item info not found
        
        let statusText = '';
        if (inventoryItem.equipped) {
          statusText = ' (Equipado)';
        } else if (inventoryItem.uses !== null && itemInfo.maxUses > 0) {
          statusText = ` (${inventoryItem.uses}/${itemInfo.maxUses} usos)`;
        }
        
        const itemEntry = {
          name: `${itemInfo.name} x${inventoryItem.quantity}${statusText}`,
          value: itemInfo.description || 'Sin descripción',
          inline: true
        };
        
        if (itemInfo.type === 'equipment') {
          equipmentItems.push(itemEntry);
        } else if (itemInfo.type === 'usable' || itemInfo.consumable) {
          consumableItems.push(itemEntry);
        } else {
          collectableItems.push(itemEntry);
        }
      });
      
      // Añadir secciones al embed
      if (equipmentItems.length > 0) {
        embed.addFields({ name: '⚔️ Equipamiento', value: '\u200B' });
        equipmentItems.forEach(item => {
          embed.addFields(item);
        });
      }
      
      if (consumableItems.length > 0) {
        embed.addFields({ name: '🧪 Consumibles', value: '\u200B' });
        consumableItems.forEach(item => {
          embed.addFields(item);
        });
      }
      
      if (collectableItems.length > 0) {
        embed.addFields({ name: '🏆 Coleccionables', value: '\u200B' });
        collectableItems.forEach(item => {
          embed.addFields(item);
        });
      }
      
      // Registrar comando exitoso
      await logger.execute(message, args, profile, true);
      
      message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error al mostrar inventario:', error);
      
      // Registrar comando fallido
      await logger.execute(message, args, null, false);
      
      message.reply('Ha ocurrido un error al mostrar el inventario.');
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client) {
    
    try {
      // Buscar configuración del servidor
      const serverConfig = await Server.findOne({ serverId: interaction.guild.id });
      
      if (!serverConfig || !serverConfig.roleplay.enabled) {
        // Registrar comando fallido
        await logger.executeSlash(interaction, null, false);
        return interaction.reply({ content: 'El sistema de roleplay no está habilitado en este servidor.', ephemeral: true });
      }
      
      // Determinar el usuario objetivo
      let targetUser = interaction.options.getUser('usuario') || interaction.user;
      
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ 
        userId: targetUser.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        // Registrar comando fallido
        await logger.executeSlash(interaction, null, false);
        return interaction.reply({ 
          content: targetUser.id === interaction.user.id ? 
            'No tienes un perfil de roleplay. Crea uno con el comando `/perfil`.' : 
            'Este usuario no tiene un perfil de roleplay.',
          ephemeral: true
        });
      }
      
      // Si el inventario está vacío
      if (!profile.character.inventory || profile.character.inventory.length === 0) {
        // Registrar comando exitoso pero sin inventario
        await logger.executeSlash(interaction, profile, true);
        return interaction.reply({
          content: targetUser.id === interaction.user.id ? 
            'Tu inventario está vacío.' : 
            'El inventario de este usuario está vacío.',
          ephemeral: true
        });
      }
      
      // Buscar información de los items
      const itemIds = profile.character.inventory.map(item => item.itemId);
      const items = await Item.find({ 
        _id: { $in: itemIds },
        serverId: interaction.guild.id
      });
      
      // Crear mensaje de inventario
      const characterName = profile.character.name || targetUser.username;
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`Inventario de ${characterName}`)
        .setDescription(`Monedas: ${profile.character.currency}`)
        .setThumbnail(profile.character.avatar || targetUser.displayAvatarURL())
      
      // Agrupar items por tipo
      const equipmentItems = [];
      const consumableItems = [];
      const collectableItems = [];
      
      profile.character.inventory.forEach(inventoryItem => {
        const itemInfo = items.find(i => i._id.toString() === inventoryItem.itemId);
        
        if (!itemInfo) return; // Skip if item info not found
        
        let statusText = '';
        if (inventoryItem.equipped) {
          statusText = ' (Equipado)';
        } else if (inventoryItem.uses !== null && itemInfo.maxUses > 0) {
          statusText = ` (${inventoryItem.uses}/${itemInfo.maxUses} usos)`;
        }
        
        const itemEntry = {
          name: `${itemInfo.name} x${inventoryItem.quantity}${statusText}`,
          value: itemInfo.description || 'Sin descripción',
          inline: true
        };
        
        if (itemInfo.type === 'equipment') {
          equipmentItems.push(itemEntry);
        } else if (itemInfo.type === 'usable' || itemInfo.consumable) {
          consumableItems.push(itemEntry);
        } else {
          collectableItems.push(itemEntry);
        }
      });
      
      // Añadir secciones al embed
      if (equipmentItems.length > 0) {
        embed.addFields({ name: '⚔️ Equipamiento', value: '\u200B' });
        equipmentItems.forEach(item => {
          embed.addFields(item);
        });
      }
      
      if (consumableItems.length > 0) {
        embed.addFields({ name: '🧪 Consumibles', value: '\u200B' });
        consumableItems.forEach(item => {
          embed.addFields(item);
        });
      }
      
      if (collectableItems.length > 0) {
        embed.addFields({ name: '🏆 Coleccionables', value: '\u200B' });
        collectableItems.forEach(item => {
          embed.addFields(item);
        });
      }
      
      // Registrar comando exitoso
      await logger.executeSlash(interaction, profile, true);
      
      interaction.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error al mostrar inventario:', error);
      
      // Registrar comando fallido
      await logger.executeSlash(interaction, null, false);
      
      interaction.reply({ content: 'Ha ocurrido un error al mostrar el inventario.', ephemeral: true });
    }
  }
};