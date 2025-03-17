const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'batalla',
  aliases: ['duelo', 'pelea', 'battle'],
  description: 'Desafía a otro jugador a una batalla con tus personajes',
  category: 'rpg',
  cooldown: 10,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('batalla')
    .setDescription('Desafía a otro jugador a una batalla con tus personajes')
    .addUserOption(option => 
      option.setName('oponente')
        .setDescription('El jugador al que quieres desafiar')
        .setRequired(false))
    .addIntegerOption(option => 
      option.setName('apuesta')
        .setDescription('Cantidad de monedas para apostar (opcional)')
        .setRequired(false)
        .setMinValue(10))
    .addStringOption(option =>
      option.setName('modo')
        .setDescription('Tipo de batalla')
        .setRequired(false)
        .addChoices(
          { name: '⚔️ Normal (basado en estadísticas)', value: 'normal' },
          { name: '🎭 Avanzado (con habilidades)', value: 'avanzado' },
          { name: '🎲 Aleatorio (resultados impredecibles)', value: 'aleatorio' }
        )),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    // Verificar si el usuario tiene perfil
    const profile = await Profile.findOne({
      userId: message.author.id,
      serverId: message.guild.id
    });
    
    if (!profile) {
      return message.reply(`❌ No tienes un perfil. Crea uno usando \`${serverConfig.prefix}perfil\`.`);
    }
    
    // Verificar si el personaje tiene nivel mínimo para luchar
    if (profile.character.level < 3) {
      return message.reply('❌ Tu personaje debe ser al menos nivel 3 para participar en batallas.');
    }
    
    // Determinar modo
    const battleModes = ['normal', 'avanzado', 'aleatorio'];
    let mode = args[0]?.toLowerCase() || 'normal';
    
    if (!battleModes.includes(mode)) {
      // Si el primer argumento no es un modo válido, asumimos que es un usuario mencionado
      mode = 'normal';
    } else {
      // Si el primer argumento es un modo, lo eliminamos para procesar correctamente los siguientes
      args.shift();
    }
    
    // Determinar apuesta (si la hay)
    let amount = 0;
    if (args.length > 0 && !isNaN(parseInt(args[0]))) {
      amount = parseInt(args[0]);
      if (amount < 0) amount = 0;
      args.shift();
    }
    
    // Verificar si hay apuesta y si tiene suficientes monedas
    if (amount > 0 && profile.character.currency < amount) {
      return message.reply(`❌ No tienes suficientes monedas para apostar ${amount}. Tienes ${profile.character.currency} monedas.`);
    }
    
    // Buscar oponente (usuario mencionado)
    let opponent;
    if (message.mentions.users.size > 0) {
      opponent = message.mentions.users.first();
    } else if (args.length > 0) {
      // Intentar buscar usuario por nombre/ID
      const potentialUsername = args.join(' ');
      opponent = client.users.cache.find(u => 
        u.username.toLowerCase().includes(potentialUsername.toLowerCase()) || 
        u.id === potentialUsername
      );
    }
    
    if (opponent) {
      // Si se especificó un oponente, iniciar desafío
      return this.initiateChallenge(message, opponent, amount, mode, profile, serverConfig);
    }
    
    // Si no se especificó oponente, mostrar selector de usuarios
    const selectUserMenu = new ActionRowBuilder()
      .addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`batalla:select:${message.author.id}:${amount}:${mode}`)
          .setPlaceholder('Selecciona a tu oponente')
          .setMaxValues(1)
      );
    
    const selectEmbed = new EmbedBuilder()
      .setTitle('⚔️ BATALLA - SELECCIÓN DE OPONENTE')
      .setDescription(`
${message.author} quiere desafiar a alguien a una batalla.

**Modo:** ${this.getModeName(mode)}
${amount > 0 ? `**Apuesta:** ${amount} monedas` : '**Sin apuesta**'}
      `)
      .setColor('#ff5500')
      .setFooter({ text: 'El oponente debe aceptar el desafío' });
    
    const selectMsg = await message.reply({ embeds: [selectEmbed], components: [selectUserMenu] });
    
    // Crear collector para la selección de usuario
    const filter = i => {
      const [command, action, userId] = i.customId.split(':');
      return command === 'batalla' && action === 'select' && i.user.id === message.author.id;
    };
    
    const collector = selectMsg.createMessageComponentCollector({ 
      filter,
      time: 60000
    });
    
    collector.on('collect', async i => {
      const targetUserId = i.values[0];
      const targetUser = await client.users.fetch(targetUserId);
      
      // Verificar que no está desafiando a sí mismo o a un bot
      if (targetUserId === message.author.id) {
        await i.reply({ content: '❌ No puedes desafiarte a ti mismo.', ephemeral: true });
        return;
      }
      
      if (targetUser.bot) {
        await i.reply({ content: '❌ No puedes desafiar a un bot.', ephemeral: true });
        return;
      }
      
      // Iniciar desafío
      await i.update({ content: 'Preparando el desafío...', embeds: [], components: [] });
      this.initiateChallenge(message, targetUser, amount, mode, profile, serverConfig, selectMsg);
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        // Tiempo expirado sin selección
        const expiredEmbed = new EmbedBuilder()
          .setTitle('⏰ SELECCIÓN EXPIRADA')
          .setDescription('No se seleccionó ningún oponente a tiempo.')
          .setColor('#999999');
        
        await selectMsg.edit({ embeds: [expiredEmbed], components: [] });
      }
    });
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const opponent = interaction.options.getUser('oponente');
    const amount = interaction.options.getInteger('apuesta') || 0;
    const mode = interaction.options.getString('modo') || 'normal';
    
    // Verificar si el usuario tiene perfil
    const profile = await Profile.findOne({
      userId: interaction.user.id,
      serverId: interaction.guild.id
    });
    
    if (!profile) {
      return interaction.reply({ 
        content: `❌ No tienes un perfil. Crea uno usando \`${serverConfig.prefix}perfil\`.`, 
        ephemeral: true 
      });
    }
    
    // Verificar si el personaje tiene nivel mínimo para luchar
    if (profile.character.level < 3) {
      return interaction.reply({ 
        content: '❌ Tu personaje debe ser al menos nivel 3 para participar en batallas.', 
        ephemeral: true 
      });
    }
    
    // Verificar si hay apuesta y si tiene suficientes monedas
    if (amount > 0 && profile.character.currency < amount) {
      return interaction.reply({ 
        content: `❌ No tienes suficientes monedas para apostar ${amount}. Tienes ${profile.character.currency} monedas.`, 
        ephemeral: true 
      });
    }
    
    if (opponent) {
      // Si se especificó un oponente, iniciar desafío
      await interaction.reply(`⚔️ Desafiando a ${opponent} a una batalla...`);
      return this.initiateChallenge(interaction, opponent, amount, mode, profile, serverConfig);
    }
    
    // Si no se especificó oponente, mostrar selector de usuarios
    const selectUserMenu = new ActionRowBuilder()
      .addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`batalla:select:${interaction.user.id}:${amount}:${mode}`)
          .setPlaceholder('Selecciona a tu oponente')
          .setMaxValues(1)
      );
    
    const selectEmbed = new EmbedBuilder()
      .setTitle('⚔️ BATALLA - SELECCIÓN DE OPONENTE')
      .setDescription(`
${interaction.user} quiere desafiar a alguien a una batalla.

**Modo:** ${this.getModeName(mode)}
${amount > 0 ? `**Apuesta:** ${amount} monedas` : '**Sin apuesta**'}
      `)
      .setColor('#ff5500')
      .setFooter({ text: 'El oponente debe aceptar el desafío' });
    
    await interaction.reply({ embeds: [selectEmbed], components: [selectUserMenu] });
    
    // Crear collector para la selección de usuario
    const filter = i => {
      const [command, action, userId] = i.customId.split(':');
      return command === 'batalla' && action === 'select' && i.user.id === interaction.user.id;
    };
    
    const collector = interaction.channel.createMessageComponentCollector({ 
      filter,
      time: 60000
    });
    
    collector.on('collect', async i => {
      const targetUserId = i.values[0];
      const targetUser = await client.users.fetch(targetUserId);
      
      // Verificar que no está desafiando a sí mismo o a un bot
      if (targetUserId === interaction.user.id) {
        await i.reply({ content: '❌ No puedes desafiarte a ti mismo.', ephemeral: true });
        return;
      }
      
      if (targetUser.bot) {
        await i.reply({ content: '❌ No puedes desafiar a un bot.', ephemeral: true });
        return;
      }
      
      // Iniciar desafío
      await i.update({ content: 'Preparando el desafío...', embeds: [], components: [] });
      this.initiateChallenge(interaction, targetUser, amount, mode, profile, serverConfig);
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        // Tiempo expirado sin selección
        const expiredEmbed = new EmbedBuilder()
          .setTitle('⏰ SELECCIÓN EXPIRADA')
          .setDescription('No se seleccionó ningún oponente a tiempo.')
          .setColor('#999999');
        
        await interaction.editReply({ embeds: [expiredEmbed], components: [] });
      }
    });
  },
  
  // Método para iniciar un desafío
  async initiateChallenge(context, opponent, amount, mode, initiatorProfile, serverConfig, existingMessage = null) {
    // Verificar si el oponente tiene perfil
    const opponentProfile = await Profile.findOne({
      userId: opponent.id,
      serverId: context.guild.id
    });
    
    if (!opponentProfile) {
      const noProfileMsg = `❌ ${opponent.tag} no tiene un perfil en este servidor.`;
      
      if (existingMessage) {
        await existingMessage.edit({ content: noProfileMsg, embeds: [], components: [] });
      } else if (context.replied || context.deferred) {
        await context.followUp(noProfileMsg);
      } else {
        await context.reply(noProfileMsg);
      }
      return;
    }
    
    // Verificar si el oponente tiene nivel mínimo para luchar
    if (opponentProfile.character.level < 3) {
      const lowLevelMsg = `❌ El personaje de ${opponent.tag} debe ser al menos nivel 3 para participar en batallas.`;
      
      if (existingMessage) {
        await existingMessage.edit({ content: lowLevelMsg, embeds: [], components: [] });
      } else if (context.replied || context.deferred) {
        await context.followUp(lowLevelMsg);
      } else {
        await context.reply(lowLevelMsg);
      }
      return;
    }
    
    // Verificar si tiene suficientes monedas (si hay apuesta)
    if (amount > 0 && opponentProfile.character.currency < amount) {
      const notEnoughMoneyMsg = `❌ ${opponent.tag} no tiene suficientes monedas para la apuesta. Tiene ${opponentProfile.character.currency} monedas.`;
      
      if (existingMessage) {
        await existingMessage.edit({ content: notEnoughMoneyMsg, embeds: [], components: [] });
      } else if (context.replied || context.deferred) {
        await context.followUp(notEnoughMoneyMsg);
      } else {
        await context.reply(notEnoughMoneyMsg);
      }
      return;
    }
    
    // Enviar solicitud de desafío
    const challengeButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`batalla:accept:${context.author ? context.author.id : context.user.id}:${opponent.id}:${amount}:${mode}`)
          .setLabel('ACEPTAR DESAFÍO')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`batalla:decline:${context.author ? context.author.id : context.user.id}:${opponent.id}:${amount}:${mode}`)
          .setLabel('RECHAZAR')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );
    
    // Crear descripción de personajes
    const initiatorChar = this.getCharacterDescription(initiatorProfile.character);
    const opponentChar = this.getCharacterDescription(opponentProfile.character);
    
    const challengeEmbed = new EmbedBuilder()
      .setTitle('⚔️ DESAFÍO DE BATALLA')
      .setDescription(`
${context.author ? context.author : context.user} te desafía a una batalla, ${opponent}!

**Modo:** ${this.getModeName(mode)}
${amount > 0 ? `**Apuesta:** ${amount} monedas` : '**Sin apuesta**'}

**TU PERSONAJE:**
${initiatorChar}

**PERSONAJE DEL OPONENTE:**
${opponentChar}

¿Aceptas el desafío?
      `)
      .setColor('#ff5500')
      .setFooter({ text: 'El desafío expira en 60 segundos' });
    
    // Enviar mensaje de desafío
    let messageToEdit;
    if (existingMessage) {
      messageToEdit = await existingMessage.edit({ embeds: [challengeEmbed], components: [challengeButtons] });
    } else if (context.replied || context.deferred) {
      messageToEdit = await context.followUp({ embeds: [challengeEmbed], components: [challengeButtons] });
    } else {
      messageToEdit = await context.reply({ embeds: [challengeEmbed], components: [challengeButtons] });
    }
    
    // Crear collector para la respuesta al desafío
    const filter = i => {
      const [command, action, challengerId, targetId] = i.customId.split(':');
      return command === 'batalla' && ['accept', 'decline'].includes(action) && 
            targetId === opponent.id && i.user.id === opponent.id;
    };
    
    const collector = context.channel.createMessageComponentCollector({ 
      filter, 
      time: 60000
    });
    
    collector.on('collect', async i => {
      const [, action, challengerId, targetId, betAmount, battleMode] = i.customId.split(':');
      
      if (action === 'decline') {
        // Desafío rechazado
        const declineEmbed = new EmbedBuilder()
          .setTitle('❌ DESAFÍO RECHAZADO')
          .setDescription(`
${opponent} ha rechazado el desafío de ${context.author ? context.author : context.user}.

No se ha realizado ninguna apuesta.
          `)
          .setColor('#ff0000');
        
        await i.update({ embeds: [declineEmbed], components: [] });
        return;
      }
      
      if (action === 'accept') {
        // Aceptar desafío
        await i.update({ content: '⚔️ ¡Desafío aceptado! Preparando la batalla...', embeds: [], components: [] });
        
        // Verificar una última vez monedas (si hay apuesta)
        const realAmount = parseInt(betAmount);
        
        if (realAmount > 0) {
          // Verificar si ambos jugadores tienen suficientes monedas
          const updatedInitiator = await Profile.findById(initiatorProfile._id);
          const updatedOpponent = await Profile.findById(opponentProfile._id);
          
          if (updatedInitiator.character.currency < realAmount) {
            await messageToEdit.edit({
              content: `❌ ${context.author ? context.author.tag : context.user.tag} ya no tiene suficientes monedas para la apuesta.`,
              embeds: [],
              components: []
            });
            return;
          }
          
          if (updatedOpponent.character.currency < realAmount) {
            await messageToEdit.edit({
              content: `❌ ${opponent.tag} ya no tiene suficientes monedas para la apuesta.`,
              embeds: [],
              components: []
            });
            return;
          }
          
          // Restar monedas de la apuesta
          updatedInitiator.character.currency -= realAmount;
          updatedOpponent.character.currency -= realAmount;
          
          await updatedInitiator.save();
          await updatedOpponent.save();
          
          // Usar los perfiles actualizados
          initiatorProfile = updatedInitiator;
          opponentProfile = updatedOpponent;
        }
        
        // Iniciar la batalla
        this.startBattle(
          context, 
          context.author ? context.author : context.user, 
          opponent, 
          realAmount, 
          battleMode, 
          initiatorProfile, 
          opponentProfile,
          messageToEdit
        );
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        // Tiempo expirado sin respuesta
        const expiredEmbed = new EmbedBuilder()
          .setTitle('⏰ DESAFÍO EXPIRADO')
          .setDescription(`
${opponent} no respondió al desafío de ${context.author ? context.author : context.user} a tiempo.

No se ha realizado ninguna apuesta.
          `)
          .setColor('#999999');
        
        await messageToEdit.edit({ embeds: [expiredEmbed], components: [] });
      }
    });
  },
  
  // Método para obtener el nombre del modo
  getModeName(mode) {
    switch(mode) {
      case 'normal': return '⚔️ Normal (basado en estadísticas)';
      case 'avanzado': return '🎭 Avanzado (con habilidades)';
      case 'aleatorio': return '🎲 Aleatorio (resultados impredecibles)';
      default: return '⚔️ Normal (basado en estadísticas)';
    }
  },
  
  // Método para obtener la descripción de un personaje
  getCharacterDescription(character) {
    let description = `**${character.name || 'Sin nombre'}** (Nivel ${character.level || 1})`;
    
    // Añadir estadísticas básicas si existen
    if (character.stats) {
      const stats = character.stats;
      description += `\nHP: ${stats.hp || 100} | ATK: ${stats.attack || 10} | DEF: ${stats.defense || 5}`;
      
      if (stats.magic) {
        description += ` | MAG: ${stats.magic}`;
      }
      
      if (stats.speed) {
        description += ` | SPD: ${stats.speed}`;
      }
    } else {
      // Estadísticas por defecto
      description += `\nHP: 100 | ATK: 10 | DEF: 5`;
    }
    
    // Añadir clase/tipo si existe
    if (character.class) {
      description += `\nClase: ${character.class}`;
    }
    
    // Añadir equipamiento si existe
    if (character.equipment) {
      const equip = character.equipment;
      const equipItems = [];
      
      if (equip.weapon) equipItems.push(`Arma: ${equip.weapon}`);
      if (equip.armor) equipItems.push(`Armadura: ${equip.armor}`);
      if (equip.accessory) equipItems.push(`Accesorio: ${equip.accessory}`);
      
      if (equipItems.length > 0) {
        description += `\nEquipo: ${equipItems.join(' | ')}`;
      }
    }
    
    return description;
  },
  
  // Método para calcular las estadísticas completas con bonificadores de equipamiento
  calculateFullStats(character) {
    // Estadísticas base
    const baseStats = character.stats || {
      hp: 100,
      attack: 10,
      defense: 5,
      magic: 10,
      speed: 10
    };
    
    // Copiar estadísticas base para no modificarlas
    const stats = { ...baseStats };
    
    // Ajustar por nivel
    const levelBonus = character.level - 1 || 0;
    stats.hp += levelBonus * 10;
    stats.attack += levelBonus * 2;
    stats.defense += levelBonus * 1;
    stats.magic = (stats.magic || 10) + levelBonus * 2;
    stats.speed = (stats.speed || 10) + levelBonus * 1;
    
    // Bonificadores por equipamiento (si existe)
    if (character.equipment) {
      const equip = character.equipment;
      
      // Bonificadores de arma
      if (equip.weapon && character.inventory) {
        const weapon = character.inventory.find(item => item.item === equip.weapon);
        if (weapon && weapon.metadata) {
          stats.attack += weapon.metadata.attack || 0;
          stats.magic += weapon.metadata.magic || 0;
        }
      }
      
      // Bonificadores de armadura
      if (equip.armor && character.inventory) {
        const armor = character.inventory.find(item => item.item === equip.armor);
        if (armor && armor.metadata) {
          stats.defense += armor.metadata.defense || 0;
          stats.hp += armor.metadata.hp || 0;
        }
      }
      
      // Bonificadores de accesorio
      if (equip.accessory && character.inventory) {
        const accessory = character.inventory.find(item => item.item === equip.accessory);
        if (accessory && accessory.metadata) {
          stats.speed += accessory.metadata.speed || 0;
          stats.attack += accessory.metadata.attack || 0;
          stats.defense += accessory.metadata.defense || 0;
          stats.magic += accessory.metadata.magic || 0;
          stats.hp += accessory.metadata.hp || 0;
        }
      }
    }
    
    // Ajustar por clase si existe
    if (character.class) {
      switch(character.class.toLowerCase()) {
        case 'guerrero':
        case 'warrior':
          stats.attack *= 1.2;
          stats.defense *= 1.1;
          stats.magic *= 0.8;
          break;
        case 'mago':
        case 'wizard':
        case 'mage':
          stats.magic *= 1.3;
          stats.attack *= 0.8;
          stats.hp *= 0.9;
          break;
        case 'rogue':
        case 'ladron':
        case 'asesino':
          stats.speed *= 1.3;
          stats.attack *= 1.1;
          stats.defense *= 0.9;
          break;
        case 'paladin':
        case 'palad':
          stats.defense *= 1.2;
          stats.hp *= 1.1;
          stats.magic *= 1.1;
          break;
        // Otras clases...
      }
    }
    
    // Asegurar que las estadísticas sean números enteros
    Object.keys(stats).forEach(key => {
      stats[key] = Math.floor(stats[key]);
    });
    
    return stats;
  },
  
  // Método para iniciar la batalla
  async startBattle(context, initiator, opponent, amount, mode, initiatorProfile, opponentProfile, messageToEdit) {
    // Calcular estadísticas completas de ambos personajes
    const initiatorStats = this.calculateFullStats(initiatorProfile.character);
    const opponentStats = this.calculateFullStats(opponentProfile.character);
    
    // Estado de la batalla
    const initiatorName = initiatorProfile.character.name || initiator.username;
    const opponentName = opponentProfile.character.name || opponent.username;
    
    const battleState = {
      round: 0,
      initiator: {
        user: initiator,
        name: initiatorName,
        stats: { ...initiatorStats },
        currentHp: initiatorStats.hp,
        buffs: {},
        debuffs: {}
      },
      opponent: {
        user: opponent,
        name: opponentName,
        stats: { ...opponentStats },
        currentHp: opponentStats.hp,
        buffs: {},
        debuffs: {}
      },
      mode: mode,
      amount: amount,
      log: [],
      winner: null,
      battleActive: true,
      turnQueue: []
    };
    
    // Determinar el orden de los turnos en base a la velocidad
    if (initiatorStats.speed >= opponentStats.speed) {
      battleState.turnQueue = ['initiator', 'opponent'];
    } else {
      battleState.turnQueue = ['opponent', 'initiator'];
    }
    
    // Mensaje inicial con información de los combatientes
    const battleEmbed = this.createBattleEmbed(battleState);
    
    // Enviar mensaje inicial
    const battleMessage = await messageToEdit.edit({ 
      content: null,
      embeds: [battleEmbed], 
      components: [] 
    });
    
    // Ejecutar la batalla
    this.executeBattleRound(context, battleState, battleMessage);
  },
  
  // Método para crear el embed de batalla
  createBattleEmbed(battleState) {
    const initiator = battleState.initiator;
    const opponent = battleState.opponent;
    
    // Calcular porcentajes de HP para barras visuales
    const initiatorHpPercent = Math.max(0, Math.min(100, Math.floor((initiator.currentHp / initiator.stats.hp) * 100)));
    const opponentHpPercent = Math.max(0, Math.min(100, Math.floor((opponent.currentHp / opponent.stats.hp) * 100)));
    
    // Crear barras de HP
    const createHpBar = (percent) => {
      const barLength = 10;
      const filledSquares = Math.floor((percent / 100) * barLength);
      const emptySquares = barLength - filledSquares;
      
      return '█'.repeat(filledSquares) + '░'.repeat(emptySquares);
    };
    
    // Logs de batalla (mostrar solo los últimos 10)
    const battleLogs = battleState.log.slice(-10).join('\n');
    
    // Estilos adicionales según el modo
    let titleEmoji, color;
    switch(battleState.mode) {
      case 'avanzado':
        titleEmoji = '🎭';
        color = '#9900ff'; // Morado
        break;
      case 'aleatorio':
        titleEmoji = '🎲';
        color = '#ff9900'; // Naranja
        break;
      default: // normal
        titleEmoji = '⚔️';
        color = '#ff5500'; // Rojo-naranja
    }
    
    // Crear embed
    const embed = new EmbedBuilder()
      .setTitle(`${titleEmoji} BATALLA - RONDA ${battleState.round} ${titleEmoji}`)
      .setDescription(`
${battleState.amount > 0 ? `**Apuesta:** ${battleState.amount} monedas` : '**Batalla amistosa**'}

**${initiator.name}** (${initiator.user.tag})
HP: ${initiator.currentHp}/${initiator.stats.hp} [${createHpBar(initiatorHpPercent)}] ${initiatorHpPercent}%
ATK: ${initiator.stats.attack} | DEF: ${initiator.stats.defense} | MAG: ${initiator.stats.magic} | SPD: ${initiator.stats.speed}

**${opponent.name}** (${opponent.user.tag})
HP: ${opponent.currentHp}/${opponent.stats.hp} [${createHpBar(opponentHpPercent)}] ${opponentHpPercent}%
ATK: ${opponent.stats.attack} | DEF: ${opponent.stats.defense} | MAG: ${opponent.stats.magic} | SPD: ${opponent.stats.speed}
      `)
      .setColor(color);
      
    // Agregar logs de batalla
    if (battleLogs) {
      embed.addFields({ name: 'Logs de batalla', value: battleLogs });
    }
    
    return embed;
  },
  
  // Método para ejecutar una ronda de batalla
async executeBattleRound(context, battleState, battleMessage) {
    if (!battleState.battleActive) return;
    
    // Incrementar contador de rondas
    battleState.round++;
    
    // Esperar un momento entre rondas para dar dramatismo
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Determinar acciones para esta ronda
    for (const side of battleState.turnQueue) {
      if (!battleState.battleActive) break;
      
      // Obtener datos del atacante y defensor
      const attacker = battleState[side];
      const defender = battleState[side === 'initiator' ? 'opponent' : 'initiator'];
      
      // Esperar un poco entre turnos
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Ejecutar acción según el modo de batalla
      switch (battleState.mode) {
        case 'avanzado':
          this.executeAdvancedAction(battleState, attacker, defender);
          break;
        case 'aleatorio':
          this.executeRandomAction(battleState, attacker, defender);
          break;
        default:
          this.executeNormalAction(battleState, attacker, defender);
      }
      
      // Comprobar si la batalla ha terminado
      if (attacker.currentHp <= 0 || defender.currentHp <= 0) {
        battleState.battleActive = false;
        battleState.winner = attacker.currentHp <= 0 ? 
          (side === 'initiator' ? 'opponent' : 'initiator') : side;
        
        // Añadir mensaje de victoria al log
        const winnerName = battleState.winner === 'initiator' ? 
          battleState.initiator.name : battleState.opponent.name;
        
        battleState.log.push(`🏆 **${winnerName}** es el ganador de la batalla!`);
        
        // Procesar recompensa
        if (battleState.amount > 0) {
          // Determinar el perfil ganador
          const winnerProfile = battleState.winner === 'initiator' ? 
            battleState.initiator.profile : battleState.opponent.profile;
          
          // Otorgar el premio
          winnerProfile.character.currency += battleState.amount * 2;
          await winnerProfile.save();
        }
        
        // Registrar estadísticas de batalla
        this.updateBattleStats(battleState);
        
        // Actualizar mensaje con resultado final
        const finalEmbed = this.createBattleEmbed(battleState);
        await battleMessage.edit({ embeds: [finalEmbed] });
        
        // Añadir botones para revancha
        const rematchButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`batalla:rematch:${battleState.initiator.user.id}:${battleState.opponent.user.id}:${battleState.amount}:${battleState.mode}`)
              .setLabel('🔄 REVANCHA')
              .setStyle(ButtonStyle.Primary)
          );
        
        await battleMessage.edit({ embeds: [finalEmbed], components: [rematchButtons] });
        
        // Configurar collector para revancha
        this.setupRematchCollector(context, battleMessage, battleState);
        return;
      }
      
      // Actualizar el mensaje después de cada acción
      const updatedEmbed = this.createBattleEmbed(battleState);
      await battleMessage.edit({ embeds: [updatedEmbed] });
    }
    
    // Si la batalla continúa, ejecutar la siguiente ronda
    if (battleState.battleActive) {
      this.executeBattleRound(context, battleState, battleMessage);
    }
  },
  
  // Método para ejecutar acción normal (basada en estadísticas)
  executeNormalAction(battleState, attacker, defender) {
    // Calcular daño base
    const baseDamage = attacker.stats.attack * (1 + Math.random() * 0.4 - 0.2); // ±20% variación aleatoria
    
    // Calcular modificador de defensa
    const defenseModifier = defender.stats.defense / (defender.stats.defense + 50); // Valor entre 0 y 1
    
    // Reducción por defensa (entre 0% y 70% de reducción)
    const damageReduction = Math.min(0.7, defenseModifier);
    
    // Calcular daño final
    const finalDamage = Math.max(1, Math.floor(baseDamage * (1 - damageReduction)));
    
    // Aplicar daño
    defender.currentHp = Math.max(0, defender.currentHp - finalDamage);
    
    // Añadir al log de batalla
    battleState.log.push(`⚔️ **${attacker.name}** ataca a **${defender.name}** por **${finalDamage}** de daño!`);
  },
  
  // Método para ejecutar acción avanzada (con habilidades y efectos)
  executeAdvancedAction(battleState, attacker, defender) {
    // Lista de posibles acciones
    const actions = [
      { type: 'attack', name: 'Ataque', weight: 60 },
      { type: 'skill', name: 'Habilidad', weight: 30 },
      { type: 'buff', name: 'Potenciación', weight: 10 }
    ];
    
    // Seleccionar acción basada en peso
    const totalWeight = actions.reduce((sum, action) => sum + action.weight, 0);
    let randomValue = Math.random() * totalWeight;
    
    let chosenAction;
    for (const action of actions) {
      if (randomValue < action.weight) {
        chosenAction = action;
        break;
      }
      randomValue -= action.weight;
    }
    
    // Si no se asignó ninguna acción, usar ataque por defecto
    if (!chosenAction) chosenAction = actions[0];
    
    // Ejecutar la acción seleccionada
    switch(chosenAction.type) {
      case 'attack':
        this.executeNormalAction(battleState, attacker, defender);
        break;
      case 'skill':
        this.executeSkill(battleState, attacker, defender);
        break;
      case 'buff':
        this.executeBuff(battleState, attacker, defender);
        break;
    }
  },
  
  // Método para ejecutar acción aleatoria (resultados impredecibles)
  executeRandomAction(battleState, attacker, defender) {
    // Lista de posibles eventos aleatorios
    const events = [
      { type: 'normal', name: 'Ataque normal', weight: 40, description: 'Realiza un ataque básico' },
      { type: 'critical', name: 'Golpe crítico', weight: 15, description: 'Realiza un ataque con daño aumentado' },
      { type: 'fail', name: 'Fallo', weight: 10, description: 'El ataque falla completamente' },
      { type: 'heal', name: 'Curación', weight: 10, description: 'Se cura a sí mismo' },
      { type: 'double', name: 'Doble golpe', weight: 10, description: 'Ataca dos veces seguidas' },
      { type: 'counter', name: 'Contraataque', weight: 5, description: 'Contraataca al recibir daño' },
      { type: 'wild', name: 'Efecto salvaje', weight: 10, description: 'Ocurre algo completamente inesperado' }
    ];
    
    // Seleccionar evento basado en peso
    const totalWeight = events.reduce((sum, event) => sum + event.weight, 0);
    let randomValue = Math.random() * totalWeight;
    
    let chosenEvent;
    for (const event of events) {
      if (randomValue < event.weight) {
        chosenEvent = event;
        break;
      }
      randomValue -= event.weight;
    }
    
    // Si no se asignó ningún evento, usar ataque normal por defecto
    if (!chosenEvent) chosenEvent = events[0];
    
    // Ejecutar el evento seleccionado
    switch(chosenEvent.type) {
      case 'normal':
        // Ataque normal
        this.executeNormalAction(battleState, attacker, defender);
        break;
      case 'critical':
        // Golpe crítico (doble daño)
        const critDamage = Math.floor(attacker.stats.attack * 2 * (1 + Math.random() * 0.3));
        defender.currentHp = Math.max(0, defender.currentHp - critDamage);
        battleState.log.push(`💥 ¡**CRÍTICO**! **${attacker.name}** asesta un golpe devastador a **${defender.name}** por **${critDamage}** de daño!`);
        break;
      case 'fail':
        // Fallo completo
        battleState.log.push(`❌ **${attacker.name}** intenta atacar pero falla por completo!`);
        break;
      case 'heal':
        // Curación
        const healAmount = Math.floor(attacker.stats.hp * 0.2);
        attacker.currentHp = Math.min(attacker.stats.hp, attacker.currentHp + healAmount);
        battleState.log.push(`💚 **${attacker.name}** se cura por **${healAmount}** puntos de salud!`);
        break;
      case 'double':
        // Doble ataque
        const damage1 = Math.floor(attacker.stats.attack * 0.7);
        const damage2 = Math.floor(attacker.stats.attack * 0.5);
        defender.currentHp = Math.max(0, defender.currentHp - damage1 - damage2);
        battleState.log.push(`🔄 **${attacker.name}** realiza un ataque doble contra **${defender.name}** por **${damage1 + damage2}** de daño total!`);
        break;
      case 'counter':
        // Preparar contraataque (para la próxima vez que reciba daño)
        battleState.log.push(`🔄 **${attacker.name}** se prepara para contraatacar!`);
        attacker.buffs.counter = true;
        break;
      case 'wild':
        // Efecto salvaje (totalmente aleatorio)
        const wildEffects = [
          // Efectos positivos para atacante
          () => {
            attacker.currentHp = attacker.stats.hp; // Curación completa
            battleState.log.push(`✨ ¡Un destello mágico restaura a **${attacker.name}** a plena salud!`);
          },
          // Efectos negativos para atacante
          () => {
            const selfDamage = Math.floor(attacker.currentHp * 0.3);
            attacker.currentHp = Math.max(1, attacker.currentHp - selfDamage);
            battleState.log.push(`🌪️ **${attacker.name}** es golpeado por un viento misterioso, perdiendo **${selfDamage}** HP!`);
          },
          // Efectos positivos para defensor
          () => {
            const healAmount = Math.floor(defender.stats.hp * 0.4);
            defender.currentHp = Math.min(defender.stats.hp, defender.currentHp + healAmount);
            battleState.log.push(`🌈 ¡Una luz brillante cura a **${defender.name}** por **${healAmount}** HP!`);
          },
          // Efectos negativos para defensor
          () => {
            const massiveDamage = Math.floor(defender.currentHp * 0.5);
            defender.currentHp = Math.max(0, defender.currentHp - massiveDamage);
            battleState.log.push(`⚡ ¡Un rayo cae del cielo y golpea a **${defender.name}** causando **${massiveDamage}** de daño!`);
          },
          // Intercambio de HP
          () => {
            const tempHp = attacker.currentHp;
            attacker.currentHp = defender.currentHp;
            defender.currentHp = tempHp;
            battleState.log.push(`🔄 ¡**${attacker.name}** y **${defender.name}** intercambian sus puntos de vida!`);
          }
        ];
        
        // Seleccionar un efecto aleatorio
        const randomEffect = wildEffects[Math.floor(Math.random() * wildEffects.length)];
        randomEffect();
        break;
    }
  },
  
  // Método para ejecutar una habilidad
  executeSkill(battleState, attacker, defender) {
    // Lista de posibles habilidades
    const skills = [
      { name: 'Golpe Poderoso', damage: 1.5, cost: 0, description: 'Un golpe con mayor fuerza' },
      { name: 'Bola de Fuego', damage: 2.0, cost: 0, magical: true, description: 'Lanza una bola de fuego mágica' },
      { name: 'Drenaje Vital', damage: 1.2, heal: 0.5, cost: 0, description: 'Drena vida del oponente' },
      { name: 'Golpe Preciso', damage: 1.3, critChance: 0.5, cost: 0, description: 'Un golpe con alta probabilidad de crítico' }
    ];
    
    // Seleccionar una habilidad aleatoria
    const skill = skills[Math.floor(Math.random() * skills.length)];
    
    // Calcular daño base
    let baseDamage;
    if (skill.magical) {
      baseDamage = attacker.stats.magic * skill.damage * (1 + Math.random() * 0.3 - 0.1);
    } else {
      baseDamage = attacker.stats.attack * skill.damage * (1 + Math.random() * 0.3 - 0.1);
    }
    
    // Comprobar si es crítico
    const isCritical = skill.critChance && Math.random() < skill.critChance;
    if (isCritical) {
      baseDamage *= 2;
    }
    
    // Aplicar defensa
    const defenseModifier = defender.stats.defense / (defender.stats.defense + 50);
    const damageReduction = Math.min(0.7, defenseModifier);
    const finalDamage = Math.max(1, Math.floor(baseDamage * (1 - damageReduction)));
    
    // Aplicar daño
    defender.currentHp = Math.max(0, defender.currentHp - finalDamage);
    
    // Añadir al log de batalla
    let message = `🔮 **${attacker.name}** usa **${skill.name}** contra **${defender.name}** causando **${finalDamage}** de daño`;
    
    if (isCritical) {
      message += " (¡CRÍTICO!)";
    }
    
    battleState.log.push(message);
    
    // Aplicar efectos adicionales
    if (skill.heal) {
      const healAmount = Math.floor(finalDamage * skill.heal);
      attacker.currentHp = Math.min(attacker.stats.hp, attacker.currentHp + healAmount);
      battleState.log.push(`💚 **${attacker.name}** se cura **${healAmount}** HP por el efecto de **${skill.name}**`);
    }
  },
  
  // Método para ejecutar un buff/potenciación
  executeBuff(battleState, attacker, defender) {
    // Lista de posibles buffs
    const buffs = [
      { name: 'Concentración', stat: 'attack', amount: 1.2, duration: 2, description: 'Aumenta el ataque' },
      { name: 'Reforzar Defensas', stat: 'defense', amount: 1.3, duration: 2, description: 'Aumenta la defensa' },
      { name: 'Agilidad', stat: 'speed', amount: 1.5, duration: 2, description: 'Aumenta la velocidad' },
      { name: 'Enfoque Arcano', stat: 'magic', amount: 1.4, duration: 2, description: 'Aumenta el poder mágico' }
    ];
    
    // Seleccionar un buff aleatorio
    const buff = buffs[Math.floor(Math.random() * buffs.length)];
    
    // Aplicar el buff
    if (!attacker.buffs[buff.stat]) {
      // Guardar valor original para poder restaurarlo
      attacker.buffs[buff.stat] = {
        original: attacker.stats[buff.stat],
        duration: buff.duration
      };
      
      // Aplicar modificador
      attacker.stats[buff.stat] = Math.floor(attacker.stats[buff.stat] * buff.amount);
    }
    
    // Añadir al log de batalla
    battleState.log.push(`✨ **${attacker.name}** usa **${buff.name}**, aumentando su **${this.translateStat(buff.stat)}** por ${Math.floor((buff.amount - 1) * 100)}%!`);
  },
  
  // Método para traducir nombres de estadísticas
  translateStat(stat) {
    const translations = {
      attack: 'Ataque',
      defense: 'Defensa',
      magic: 'Magia',
      speed: 'Velocidad',
      hp: 'Salud'
    };
    
    return translations[stat] || stat;
  },
  
  // Método para actualizar las estadísticas de batalla en los perfiles
  async updateBattleStats(battleState) {
    try {
      // Obtener perfiles actualizados
      const initiatorProfile = await Profile.findById(battleState.initiator.profile._id);
      const opponentProfile = await Profile.findById(battleState.opponent.profile._id);
      
      if (!initiatorProfile || !opponentProfile) return;
      
      // Determinar ganador y perdedor
      const initiatorWon = battleState.winner === 'initiator';
      
      // Actualizar estadísticas básicas
      if (initiatorWon) {
        initiatorProfile.stats.wins = (initiatorProfile.stats.wins || 0) + 1;
        opponentProfile.stats.losses = (opponentProfile.stats.losses || 0) + 1;
      } else {
        opponentProfile.stats.wins = (opponentProfile.stats.wins || 0) + 1;
        initiatorProfile.stats.losses = (initiatorProfile.stats.losses || 0) + 1;
      }
      
      // Actualizar estadísticas detalladas en inventario si existen
      this.updateDetailedBattleStats(initiatorProfile, initiatorWon, battleState);
      this.updateDetailedBattleStats(opponentProfile, !initiatorWon, battleState);
      
      // Guardar cambios
      await initiatorProfile.save();
      await opponentProfile.save();
    } catch (error) {
      console.error('Error al actualizar estadísticas de batalla:', error);
    }
  },
  
  // Método para actualizar estadísticas detalladas de batalla en inventario
  updateDetailedBattleStats(profile, isWinner, battleState) {
    if (!profile.character || !profile.character.inventory) return;
    
    // Buscar item de estadísticas de batalla
    let battleStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Batalla");
    
    // Si no existe, crearlo
    if (!battleStatsItem) {
      profile.character.inventory.push({
        item: "Estadísticas de Batalla",
        quantity: 1,
        description: "Registro de tus batallas contra otros jugadores"
      });
      battleStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
    }
    
    // Inicializar metadatos si no existen
    if (!battleStatsItem.metadata) {
      battleStatsItem.metadata = {
        battlesPlayed: 0,
        wins: 0,
        losses: 0,
        modeStats: {},
        opponentStats: {},
        longestBattle: 0,
        highestDamage: 0
      };
    }
    
    // Actualizar estadísticas básicas
    battleStatsItem.metadata.battlesPlayed = (battleStatsItem.metadata.battlesPlayed || 0) + 1;
    
    if (isWinner) {
      battleStatsItem.metadata.wins = (battleStatsItem.metadata.wins || 0) + 1;
    } else {
      battleStatsItem.metadata.losses = (battleStatsItem.metadata.losses || 0) + 1;
    }
    
    // Actualizar estadísticas por modo
    if (!battleStatsItem.metadata.modeStats) {
      battleStatsItem.metadata.modeStats = {};
    }
    
    if (!battleStatsItem.metadata.modeStats[battleState.mode]) {
      battleStatsItem.metadata.modeStats[battleState.mode] = {
        played: 0,
        wins: 0
      };
    }
    
    battleStatsItem.metadata.modeStats[battleState.mode].played += 1;
    if (isWinner) {
      battleStatsItem.metadata.modeStats[battleState.mode].wins += 1;
    }
    
    // Actualizar ronda más larga
    if (battleState.round > (battleStatsItem.metadata.longestBattle || 0)) {
      battleStatsItem.metadata.longestBattle = battleState.round;
    }
    
    // Actualizar descripción
    battleStatsItem.description = `Estadísticas de Batalla: ${battleStatsItem.metadata.wins}/${battleStatsItem.metadata.battlesPlayed} victorias, Batalla más larga: ${battleStatsItem.metadata.longestBattle} rondas`;
  },
  
  // Configurar collector para revancha
  setupRematchCollector(context, message, battleState) {
    const filter = i => {
      const [command, action, initiatorId, opponentId] = i.customId.split(':');
      return command === 'batalla' && action === 'rematch' && 
             (i.user.id === initiatorId || i.user.id === opponentId);
    };
    
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });
    
    collector.on('collect', async i => {
      const [, , initiatorId, opponentId, amount, mode] = i.customId.split(':');
      
      // Determinar quién pide la revancha
      const isInitiator = i.user.id === initiatorId;
      const otherUserId = isInitiator ? opponentId : initiatorId;
      const otherUser = await context.client.users.fetch(otherUserId);
      
      // Mostrar botones de aceptar/rechazar revancha
      const rematchButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`batalla:acceptRematch:${initiatorId}:${opponentId}:${amount}:${mode}`)
            .setLabel('ACEPTAR REVANCHA')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId(`batalla:declineRematch:${initiatorId}:${opponentId}:${amount}:${mode}`)
            .setLabel('RECHAZAR')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        );
      
      const rematchEmbed = new EmbedBuilder()
        .setTitle('🔄 PETICIÓN DE REVANCHA')
        .setDescription(`
  ${i.user} solicita una revancha con ${otherUser}!
  
  **Modo:** ${this.getModeName(mode)}
  ${parseInt(amount) > 0 ? `**Apuesta:** ${amount} monedas` : '**Sin apuesta**'}
  
  ¿Aceptas la revancha?
        `)
        .setColor('#ff5500')
        .setFooter({ text: 'La petición expira en 60 segundos' });
      
      await i.update({ embeds: [rematchEmbed], components: [rematchButtons] });
      
      // Crear collector para respuesta de revancha
      const rematchFilter = j => {
        const [command, action, initId, oppId] = j.customId.split(':');
        return command === 'batalla' && 
               ['acceptRematch', 'declineRematch'].includes(action) && 
               j.user.id === otherUserId;
      };
      
      const rematchCollector = message.createMessageComponentCollector({ 
        filter: rematchFilter, 
        time: 60000
      });
      
      rematchCollector.on('collect', async j => {
        const [, action] = j.customId.split(':');
        
        if (action === 'declineRematch') {
          // Revancha rechazada
          const declineEmbed = new EmbedBuilder()
            .setTitle('❌ REVANCHA RECHAZADA')
            .setDescription(`
  ${j.user} ha rechazado la petición de revancha.
            `)
            .setColor('#ff0000');
          
          await j.update({ embeds: [declineEmbed], components: [] });
          return;
        }
        
        if (action === 'acceptRematch') {
          await j.update({ content: '⚔️ ¡Revancha aceptada! Preparando la batalla...', embeds: [], components: [] });
          
          // Reactivar batalla
          const realAmount = parseInt(amount);
          
          // Obtener perfiles actualizados
          const initiator = await context.client.users.fetch(initiatorId);
          const opponent = await context.client.users.fetch(opponentId);
          
          const initiatorProfile = await Profile.findOne({
            userId: initiatorId,
            serverId: context.guild.id
          });
          
          const opponentProfile = await Profile.findOne({
            userId: opponentId,
            serverId: context.guild.id
          });
          
          // Verificar monedas si hay apuesta
          if (realAmount > 0) {
            if (!initiatorProfile || !opponentProfile || 
                initiatorProfile.character.currency < realAmount || 
                opponentProfile.character.currency < realAmount) {
              await j.channel.send('❌ Al menos uno de los jugadores no tiene suficientes monedas para la revancha.');
              return;
            }
            
            // Restar monedas de la apuesta
            initiatorProfile.character.currency -= realAmount;
            opponentProfile.character.currency -= realAmount;
            
            await initiatorProfile.save();
            await opponentProfile.save();
          }
          
          // Iniciar nueva batalla (invertir iniciador y oponente para variar)
          this.startBattle(
            context, 
            opponent, 
            initiator, 
            realAmount, 
            mode, 
            opponentProfile, 
            initiatorProfile,
            message
          );
        }
      });
      
      rematchCollector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          const expiredEmbed = new EmbedBuilder()
            .setTitle('⏰ PETICIÓN EXPIRADA')
            .setDescription(`
  ${otherUser} no respondió a la petición de revancha a tiempo.
            `)
            .setColor('#999999');
          
          await message.edit({ embeds: [expiredEmbed], components: [] });
        }
      });
    });
    
    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        // Tiempo expirado, quitar botones
        try {
          await message.edit({ components: [] });
        } catch (error) {
          // Ignorar errores al editar mensajes antiguos
        }
      }
    });
  }
}