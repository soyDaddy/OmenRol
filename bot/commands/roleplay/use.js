const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');
const Item = require('../../../models/Items');
const Server = require('../../../models/Server');
const activityLogger = require('../../../utils/activityLogger');

// Crear un logger específico para este comando
const logger = activityLogger.createCommandLogger('usar');

module.exports = {
  name: 'usar',
  aliases: ['use'],
  description: 'Usa un item de tu inventario',
  category: 'roleplay',
  cooldown: 3,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('usar')
    .setDescription('Usa un item de tu inventario')
    .addStringOption(option => 
      option.setName('item')
      .setDescription('Nombre o ID del item que quieres usar')
      .setRequired(true)),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client) {
    
    try {
      if (!args[0]) {
        // Registrar comando fallido
        await logger.execute(message, args, null, false);
        return message.reply('Debes especificar el nombre o ID del item que quieres usar.');
      }
      
      // Buscar configuración del servidor
      const serverConfig = await Server.findOne({ serverId: message.guild.id });
      
      if (!serverConfig || !serverConfig.roleplay.enabled) {
        // Registrar comando fallido
        await logger.execute(message, args, null, false);
        return message.reply('El sistema de roleplay no está habilitado en este servidor.');
      }
      
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ 
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        // Registrar comando fallido
        await logger.execute(message, args, null, false);
        return message.reply('No tienes un perfil de roleplay. Crea uno con el comando `!perfil`.');
      }
      
      // Buscar el item en el inventario
      const itemQuery = args.join(' ').toLowerCase();
      
      // Primero intentar buscar por ID
      let inventoryItemIndex = profile.character.inventory.findIndex(
        item => item.itemId.toLowerCase() === itemQuery
      );
      
      // Si no se encuentra por ID, buscar por nombre
      if (inventoryItemIndex === -1) {
        // Obtener todos los IDs de items en el inventario
        const itemIds = profile.character.inventory.map(item => item.itemId);
        
        // Buscar información de todos los items
        const items = await Item.find({
          _id: { $in: itemIds },
          serverId: message.guild.id
        });
        
        // Buscar por nombre
        const foundItem = items.find(item => 
          item.name.toLowerCase().includes(itemQuery)
        );
        
        if (foundItem) {
          inventoryItemIndex = profile.character.inventory.findIndex(
            item => item.itemId === foundItem._id.toString()
          );
        }
      }
      
      // Si no se encuentra el item
      if (inventoryItemIndex === -1) {
        // Registrar comando fallido
        await logger.execute(message, [...args, 'item_not_found'], profile, false);
        return message.reply('No tienes ese item en tu inventario.');
      }
      
      // Obtener el item del inventario
      const inventoryItem = profile.character.inventory[inventoryItemIndex];
      
      // Obtener información completa del item
      const itemInfo = await Item.findById(inventoryItem.itemId);
      
      if (!itemInfo) {
        // Registrar comando fallido
        await logger.execute(message, [...args, 'item_info_not_found'], profile, false);
        return message.reply('Error al obtener información del item.');
      }
      
      // Verificar si el item es usable
      if (itemInfo.type !== 'usable' && !itemInfo.consumable) {
        // Registrar comando fallido
        await logger.execute(message, [...args, 'item_not_usable'], profile, false);
        return message.reply('Este item no se puede usar. Solo los items consumibles o usables pueden ser utilizados.');
      }
      
      // Verificar si el item tiene usos restantes
      if (inventoryItem.uses !== null && inventoryItem.uses <= 0) {
        // Registrar comando fallido
        await logger.execute(message, [...args, 'item_no_uses_left'], profile, false);
        return message.reply('Este item ya no tiene usos restantes.');
      }
      
      // Aplicar efectos del item
      let effectsDescription = '';
      
      if (itemInfo.effects) {
        // Efectos de salud
        if (itemInfo.effects.health !== 0) {
          const newHealth = Math.min(
            profile.character.health.current + itemInfo.effects.health,
            profile.character.health.max
          );
          
          const healthChange = newHealth - profile.character.health.current;
          
          profile.character.health.current = newHealth;
          
          if (healthChange > 0) {
            effectsDescription += `• Recuperaste ${healthChange} puntos de salud.\n`;
          } else if (healthChange < 0) {
            effectsDescription += `• Perdiste ${Math.abs(healthChange)} puntos de salud.\n`;
          }
        }
        
        // Efectos de maná
        if (itemInfo.effects.mana !== 0) {
          const newMana = Math.min(
            profile.character.mana.current + itemInfo.effects.mana,
            profile.character.mana.max
          );
          
          const manaChange = newMana - profile.character.mana.current;
          
          profile.character.mana.current = newMana;
          
          if (manaChange > 0) {
            effectsDescription += `• Recuperaste ${manaChange} puntos de maná.\n`;
          } else if (manaChange < 0) {
            effectsDescription += `• Perdiste ${Math.abs(manaChange)} puntos de maná.\n`;
          }
        }
        
        // Efectos temporales de estadísticas
        const statEffects = [];
        
        if (itemInfo.effects.strength !== 0) {
          // Aquí podrías implementar un sistema de buffs temporales
          statEffects.push(`Fuerza ${itemInfo.effects.strength > 0 ? '+' : ''}${itemInfo.effects.strength}`);
        }
        
        if (itemInfo.effects.intelligence !== 0) {
          statEffects.push(`Inteligencia ${itemInfo.effects.intelligence > 0 ? '+' : ''}${itemInfo.effects.intelligence}`);
        }
        
        if (itemInfo.effects.dexterity !== 0) {
          statEffects.push(`Destreza ${itemInfo.effects.dexterity > 0 ? '+' : ''}${itemInfo.effects.dexterity}`);
        }
        
        if (itemInfo.effects.defense !== 0) {
          statEffects.push(`Defensa ${itemInfo.effects.defense > 0 ? '+' : ''}${itemInfo.effects.defense}`);
        }
        
        if (statEffects.length > 0) {
          effectsDescription += `• Efectos temporales: ${statEffects.join(', ')}.\n`;
        }
      }
      
      // Si no hay efectos descritos pero el item es usable
      if (!effectsDescription) {
        effectsDescription = '• Has usado este item, pero no tiene efectos mecánicos específicos.\n';
      }
      
      // Reducir usos si es consumible
      if (itemInfo.consumable) {
        inventoryItem.quantity--;
        
        if (inventoryItem.quantity <= 0) {
          // Eliminar el item del inventario si no quedan más
          profile.character.inventory.splice(inventoryItemIndex, 1);
        }
      } else if (inventoryItem.uses !== null) {
        // Reducir usos si tiene un contador de usos
        inventoryItem.uses--;
        
        if (inventoryItem.uses <= 0 && itemInfo.consumable) {
          // Eliminar el item si se acabaron los usos y es consumible
          profile.character.inventory.splice(inventoryItemIndex, 1);
        }
      }
      
      // Guardar cambios en el perfil
      await profile.save();
      
      // Registrar el uso del item
      await logger.useItem(message.author, message.guild, itemInfo, profile, {
        quantity: 1,
        effect: effectsDescription.replace(/•\s*/g, '').replace(/\n/g, ', ')
      });
      
      // Registrar comando exitoso
      await logger.execute(message, [...args, 'success'], profile, true);
      
      // Crear mensaje de respuesta
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`Usando ${itemInfo.name}`)
        .setDescription(`${itemInfo.description}\n\n**Efectos:**\n${effectsDescription}`)
        .setFooter({ text: itemInfo.consumable 
          ? `Item consumido. Quedan: ${inventoryItem ? inventoryItem.quantity : 0}`
          : (inventoryItem.uses !== null 
            ? `Usos restantes: ${inventoryItem.uses}/${itemInfo.maxUses}` 
            : 'Item utilizado')
        });
      
      message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error al usar item:', error);
      
      // Registrar comando fallido
      await logger.execute(message, [...args, 'error'], null, false);
      
      message.reply('Ha ocurrido un error al usar el item.');
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client) {
    const Profile = require('../../models/Profile');
    const Item = require('../../models/Item');
    const Server = require('../../models/Server');
    
    try {
      // Obtener el item a usar
      const itemQuery = interaction.options.getString('item').toLowerCase();
      
      // Buscar configuración del servidor
      const serverConfig = await Server.findOne({ serverId: interaction.guild.id });
      
      if (!serverConfig || !serverConfig.roleplay.enabled) {
        // Registrar comando fallido
        await logger.executeSlash(interaction, null, false);
        return interaction.reply({ content: 'El sistema de roleplay no está habilitado en este servidor.', ephemeral: true });
      }
      
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ 
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        // Registrar comando fallido
        await logger.executeSlash(interaction, null, false);
        return interaction.reply({ 
          content: 'No tienes un perfil de roleplay. Crea uno con el comando `/perfil`.',
          ephemeral: true
        });
      }
      
      // Primero intentar buscar por ID
      let inventoryItemIndex = profile.character.inventory.findIndex(
        item => item.itemId.toLowerCase() === itemQuery
      );
      
      // Si no se encuentra por ID, buscar por nombre
      if (inventoryItemIndex === -1) {
        // Obtener todos los IDs de items en el inventario
        const itemIds = profile.character.inventory.map(item => item.itemId);
        
        // Buscar información de todos los items
        const items = await Item.find({
          _id: { $in: itemIds },
          serverId: interaction.guild.id
        });
        
        // Buscar por nombre
        const foundItem = items.find(item => 
          item.name.toLowerCase().includes(itemQuery)
        );
        
        if (foundItem) {
          inventoryItemIndex = profile.character.inventory.findIndex(
            item => item.itemId === foundItem._id.toString()
          );
        }
      }
      
      // Si no se encuentra el item
      if (inventoryItemIndex === -1) {
        // Registrar comando fallido
        await logger.executeSlash(interaction, profile, false);
        return interaction.reply({ content: 'No tienes ese item en tu inventario.', ephemeral: true });
      }
      
      // Obtener el item del inventario
      const inventoryItem = profile.character.inventory[inventoryItemIndex];
      
      // Obtener información completa del item
      const itemInfo = await Item.findById(inventoryItem.itemId);
      
      if (!itemInfo) {
        // Registrar comando fallido
        await logger.executeSlash(interaction, profile, false);
        return interaction.reply({ content: 'Error al obtener información del item.', ephemeral: true });
      }
      
      // Verificar si el item es usable
      if (itemInfo.type !== 'usable' && !itemInfo.consumable) {
        // Registrar comando fallido
        await logger.executeSlash(interaction, profile, false);
        return interaction.reply({ 
          content: 'Este item no se puede usar. Solo los items consumibles o usables pueden ser utilizados.',
          ephemeral: true
        });
      }
      
      // Verificar si el item tiene usos restantes
      if (inventoryItem.uses !== null && inventoryItem.uses <= 0) {
        // Registrar comando fallido
        await logger.executeSlash(interaction, profile, false);
        return interaction.reply({ content: 'Este item ya no tiene usos restantes.', ephemeral: true });
      }
      
      // Aplicar efectos del item
      let effectsDescription = '';
      
      if (itemInfo.effects) {
        // Efectos de salud
        if (itemInfo.effects.health !== 0) {
          const newHealth = Math.min(
            profile.character.health.current + itemInfo.effects.health,
            profile.character.health.max
          );
          
          const healthChange = newHealth - profile.character.health.current;
          
          profile.character.health.current = newHealth;
          
          if (healthChange > 0) {
            effectsDescription += `• Recuperaste ${healthChange} puntos de salud.\n`;
          } else if (healthChange < 0) {
            effectsDescription += `• Perdiste ${Math.abs(healthChange)} puntos de salud.\n`;
          }
        }
        
        // Efectos de maná
        if (itemInfo.effects.mana !== 0) {
          const newMana = Math.min(
            profile.character.mana.current + itemInfo.effects.mana,
            profile.character.mana.max
          );
          
          const manaChange = newMana - profile.character.mana.current;
          
          profile.character.mana.current = newMana;
          
          if (manaChange > 0) {
            effectsDescription += `• Recuperaste ${manaChange} puntos de maná.\n`;
          } else if (manaChange < 0) {
            effectsDescription += `• Perdiste ${Math.abs(manaChange)} puntos de maná.\n`;
          }
        }
        
        // Efectos temporales de estadísticas
        const statEffects = [];
        
        if (itemInfo.effects.strength !== 0) {
          // Aquí podrías implementar un sistema de buffs temporales
          statEffects.push(`Fuerza ${itemInfo.effects.strength > 0 ? '+' : ''}${itemInfo.effects.strength}`);
        }
        
        if (itemInfo.effects.intelligence !== 0) {
          statEffects.push(`Inteligencia ${itemInfo.effects.intelligence > 0 ? '+' : ''}${itemInfo.effects.intelligence}`);
        }
        
        if (itemInfo.effects.dexterity !== 0) {
          statEffects.push(`Destreza ${itemInfo.effects.dexterity > 0 ? '+' : ''}${itemInfo.effects.dexterity}`);
        }
        
        if (itemInfo.effects.defense !== 0) {
          statEffects.push(`Defensa ${itemInfo.effects.defense > 0 ? '+' : ''}${itemInfo.effects.defense}`);
        }
        
        if (statEffects.length > 0) {
          effectsDescription += `• Efectos temporales: ${statEffects.join(', ')}.\n`;
        }
      }
      
      // Si no hay efectos descritos pero el item es usable
      if (!effectsDescription) {
        effectsDescription = '• Has usado este item, pero no tiene efectos mecánicos específicos.\n';
      }
      
      // Reducir usos si es consumible
      if (itemInfo.consumable) {
        inventoryItem.quantity--;
        
        if (inventoryItem.quantity <= 0) {
          // Eliminar el item del inventario si no quedan más
          profile.character.inventory.splice(inventoryItemIndex, 1);
        }
      } else if (inventoryItem.uses !== null) {
        // Reducir usos si tiene un contador de usos
        inventoryItem.uses--;
        
        if (inventoryItem.uses <= 0 && itemInfo.consumable) {
          // Eliminar el item si se acabaron los usos y es consumible
          profile.character.inventory.splice(inventoryItemIndex, 1);
        }
      }
      
      // Guardar cambios en el perfil
      await profile.save();
      
      // Registrar el uso del item
      await logger.useItem(interaction.user, interaction.guild, itemInfo, profile, {
        quantity: 1,
        effect: effectsDescription.replace(/•\s*/g, '').replace(/\n/g, ', ')
      });
      
      // Registrar comando exitoso
      await logger.executeSlash(interaction, profile, true);
      
      // Crear mensaje de respuesta
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`Usando ${itemInfo.name}`)
        .setDescription(`${itemInfo.description}\n\n**Efectos:**\n${effectsDescription}`)
        .setFooter({ text: itemInfo.consumable 
          ? `Item consumido. Quedan: ${inventoryItem ? inventoryItem.quantity : 0}`
          : (inventoryItem.uses !== null 
            ? `Usos restantes: ${inventoryItem.uses}/${itemInfo.maxUses}` 
            : 'Item utilizado')
        });
      
      interaction.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error al usar item:', error);
      
      // Registrar comando fallido
      await logger.executeSlash(interaction, null, false);
      
      interaction.reply({ content: 'Ha ocurrido un error al usar el item.', ephemeral: true });
    }
  }
};