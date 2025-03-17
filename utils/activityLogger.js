const Activity = require('../models/Activity');

async function logCommand(options) {
  try {
    return await Activity.logActivity({
      userId: options.userId,
      serverId: options.serverId,
      serverName: options.serverName || 'Desconocido',
      type: 'command',
      action: `Has usado el comando <code>${options.command}</code>`,
      details: {
        command: options.command,
        params: options.params || []
      },
      character: options.character || null,
      success: true
    });
  } catch (error) {
    console.error('Error logging command activity:', error);
    return null;
  }
}

async function logQuest(options) {
  try {
    const actionText = options.success 
      ? `Has completado la misión <strong>"${options.questName}"</strong>`
      : `Has fallado la misión <strong>"${options.questName}"</strong>`;
    
    return await Activity.logActivity({
      userId: options.userId,
      serverId: options.serverId,
      serverName: options.serverName || 'Desconocido',
      type: 'quest',
      action: actionText,
      details: {
        questId: options.questId,
        questName: options.questName,
        description: options.description || ''
      },
      character: options.character || null,
      rewards: options.rewards || [],
      success: options.success
    });
  } catch (error) {
    console.error('Error logging quest activity:', error);
    return null;
  }
}

async function logCombat(options) {
  try {
    const actionText = options.success 
      ? `Has <strong>ganado</strong> un combate contra <strong>${options.enemyName}</strong>`
      : `Has <strong>perdido</strong> un combate contra <strong>${options.enemyName}</strong>`;
    
    return await Activity.logActivity({
      userId: options.userId,
      serverId: options.serverId,
      serverName: options.serverName || 'Desconocido',
      type: 'combat',
      action: actionText,
      details: {
        enemyName: options.enemyName,
        enemyLevel: options.enemyLevel || null,
        combatLog: options.combatLog || []
      },
      character: options.character || null,
      rewards: options.rewards || [],
      success: options.success
    });
  } catch (error) {
    console.error('Error logging combat activity:', error);
    return null;
  }
}

async function logLevelUp(options) {
  try {
    return await Activity.logActivity({
      userId: options.userId,
      serverId: options.serverId,
      serverName: options.serverName || 'Desconocido',
      type: 'levelup',
      action: `Tu personaje <strong>${options.character.name}</strong> ha subido al nivel ${options.newLevel}`,
      details: {
        previousLevel: options.previousLevel || options.newLevel - 1,
        newLevel: options.newLevel,
        statsGained: options.statsGained || {}
      },
      character: options.character,
      success: true
    });
  } catch (error) {
    console.error('Error logging level up activity:', error);
    return null;
  }
}

async function logItemActivity(options) {
  try {
    let actionText = '';
    let actionType = 'item';
    
    // Definir la acción según el tipo
    switch (options.itemAction) {
      case 'buy':
        actionText = `Has comprado <strong>${options.itemName}</strong>`;
        if (options.price) {
          actionText += ` por <strong>${options.price} monedas</strong>`;
        }
        break;
      case 'sell':
        actionText = `Has vendido <strong>${options.itemName}</strong>`;
        if (options.price) {
          actionText += ` por <strong>${options.price} monedas</strong>`;
        }
        break;
      case 'use':
        actionText = `Has usado <strong>${options.itemName}</strong>`;
        if (options.effect) {
          actionText += ` y ${options.effect}`;
        }
        break;
      case 'gain':
        actionText = `Has obtenido <strong>${options.itemName}</strong>`;
        break;
      case 'lose':
        actionText = `Has perdido <strong>${options.itemName}</strong>`;
        break;
      default:
        actionText = `Interacción con <strong>${options.itemName}</strong>`;
    }
    
    if (options.quantity && options.quantity > 1) {
      actionText = actionText.replace(options.itemName, `${options.itemName} x${options.quantity}`);
    }
    
    return await Activity.logActivity({
      userId: options.userId,
      serverId: options.serverId,
      serverName: options.serverName || 'Desconocido',
      type: actionType,
      action: actionText,
      details: {
        itemName: options.itemName,
        itemId: options.itemId || null,
        quantity: options.quantity || 1,
        price: options.price || null,
        itemAction: options.itemAction,
        itemType: options.itemType || 'misc'
      },
      character: options.character || null,
      success: true
    });
  } catch (error) {
    console.error('Error logging item activity:', error);
    return null;
  }
}

async function logCurrencyActivity(options) {
  try {
    const actionText = options.action === 'gain'
      ? `Has ganado <strong>${options.amount} monedas</strong>`
      : `Has gastado <strong>${options.amount} monedas</strong>`;
    
    const fullActionText = options.reason 
      ? `${actionText} por ${options.reason}`
      : actionText;
    
    const rewards = options.action === 'gain' 
      ? [{ type: 'currency', name: 'Monedas', value: options.amount }]
      : [];
    
    return await Activity.logActivity({
      userId: options.userId,
      serverId: options.serverId,
      serverName: options.serverName || 'Desconocido',
      type: 'currency',
      action: fullActionText,
      details: {
        amount: options.amount,
        action: options.action,
        reason: options.reason || '',
        balance: options.balance || null
      },
      character: options.character || null,
      rewards,
      success: true
    });
  } catch (error) {
    console.error('Error logging currency activity:', error);
    return null;
  }
}

function createCommandLogger(commandName) {
  return {
    execute: async (message, args, profile = null, success = true) => {
      return await logCommand({
        userId: message.author.id,
        serverId: message.guild.id,
        serverName: message.guild.name,
        command: commandName,
        params: args,
        character: profile?.character || null,
        success
      });
    },
    
    executeSlash: async (interaction, profile = null, success = true) => {
      // Extraer los parámetros de la interacción
      const params = [];
      if (interaction.options) {
        const options = interaction.options;
        const subCommand = options.getSubcommand(false);
        if (subCommand) params.push(subCommand);
        
        // Extraer otros parámetros
        options.data?.options?.forEach(option => {
          params.push(`${option.name}:${option.value}`);
        });
      }
      
      return await logCommand({
        userId: interaction.user.id,
        serverId: interaction.guild.id,
        serverName: interaction.guild.name,
        command: commandName,
        params,
        character: profile?.character || null,
        success
      });
    },
   
    quest: async (user, guild, mission, profile = null, success = true, rewards = []) => {
      return await logQuest({
        userId: user.id,
        serverId: guild.id,
        serverName: guild.name,
        questId: mission._id.toString(),
        questName: mission.title,
        description: mission.description,
        success,
        character: profile?.character || null,
        rewards
      });
    },
    
    useItem: async (user, guild, item, profile = null, options = {}) => {
      return await logItemActivity({
        userId: user.id,
        serverId: guild.id,
        serverName: guild.name,
        itemName: item.name,
        itemId: item._id.toString(),
        quantity: options.quantity || 1,
        itemAction: 'use',
        itemType: item.type || 'misc',
        effect: options.effect || null,
        character: profile?.character || null
      });
    },
    
    currency: async (user, guild, amount, action, profile = null, reason = '') => {
      return await logCurrencyActivity({
        userId: user.id,
        serverId: guild.id,
        serverName: guild.name,
        amount,
        action,
        reason,
        balance: profile?.character?.currency || null,
        character: profile?.character || null
      });
    }
  };
}

module.exports = {
  logCommand,
  logQuest,
  logCombat,
  logLevelUp,
  logItemActivity,
  logCurrencyActivity,
  createCommandLogger
};