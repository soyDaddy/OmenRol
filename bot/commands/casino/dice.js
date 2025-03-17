const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'dados',
  aliases: ['dice', 'dado'],
  description: 'Juega a los dados y gana monedas según tu predicción',
  category: 'casino',
  cooldown: 3,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('dados')
    .setDescription('Juega a los dados y gana monedas según tu predicción')
    .addSubcommand(subcommand =>
      subcommand
        .setName('simple')
        .setDescription('Apuesta al resultado de un dado de 6 caras')
        .addIntegerOption(option => 
          option.setName('apuesta')
            .setDescription('Cantidad de monedas para apostar')
            .setRequired(true)
            .setMinValue(5))
        .addIntegerOption(option => 
          option.setName('numero')
            .setDescription('Número al que quieres apostar (1-6)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(6)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('craps')
        .setDescription('Apuesta en juego de craps con 2 dados')
        .addIntegerOption(option => 
          option.setName('apuesta')
            .setDescription('Cantidad de monedas para apostar')
            .setRequired(true)
            .setMinValue(10))
        .addStringOption(option =>
          option.setName('tipo')
            .setDescription('Tipo de apuesta de craps')
            .setRequired(true)
            .addChoices(
              { name: 'Pass Line (2-3 pierdes, 7-11 ganas, otros establece punto)', value: 'pass' },
              { name: 'Don\'t Pass (2-3 ganas, 7-11 pierdes, otros establece punto)', value: 'dontpass' },
              { name: 'Número específico (Alta recompensa)', value: 'numero' }
            ))
        .addIntegerOption(option => 
          option.setName('numero')
            .setDescription('Número específico al que quieres apostar (2-12)')
            .setRequired(false)
            .setMinValue(2)
            .setMaxValue(12))),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    if (!args[0]) {
      return message.reply(`❌ Uso incorrecto. Prueba con \`${serverConfig.config.prefix}dados simple 50 4\` o \`${serverConfig.config.prefix}dados craps 100 pass\`.`);
    }
    
    const subcommand = args[0].toLowerCase();
    
    if (subcommand === 'simple') {
      // Modo simple: un solo dado
      if (!args[1] || !args[2]) {
        return message.reply(`❌ Uso incorrecto. Prueba con \`${serverConfig.config.prefix}dados simple 50 4\` donde 50 es la apuesta y 4 es el número al que apuestas.`);
      }
      
      const amount = parseInt(args[1]);
      const number = parseInt(args[2]);
      
      if (isNaN(amount) || amount < 5) {
        return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 5 monedas.');
      }
      
      if (isNaN(number) || number < 1 || number > 6) {
        return message.reply('❌ El número debe estar entre 1 y 6.');
      }
      
      // Verificar si el usuario tiene perfil
      const profile = await Profile.findOne({
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        return message.reply(`❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`);
      }
      
      // Verificar si tiene suficientes monedas
      if (profile.character.currency < amount) {
        return message.reply(`❌ No tienes suficientes monedas. Tienes ${profile.character.currency} monedas.`);
      }
      
      // Restar las monedas de la apuesta
      profile.character.currency -= amount;
      await profile.save();
      
      // Iniciar el juego
      this.playSimpleDice(message, amount, number, profile);
    } 
    else if (subcommand === 'craps') {
      // Modo craps: dos dados
      if (!args[1] || !args[2]) {
        return message.reply(`❌ Uso incorrecto. Prueba con \`${serverConfig.config.prefix}dados craps 100 pass\` o \`${serverConfig.config.prefix}dados craps 100 numero 7\`.`);
      }
      
      const amount = parseInt(args[1]);
      const betType = args[2].toLowerCase();
      let specificNumber = null;
      
      if (betType === 'numero' && args[3]) {
        specificNumber = parseInt(args[3]);
      }
      
      if (isNaN(amount) || amount < 10) {
        return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 10 monedas.');
      }
      
      if (!['pass', 'dontpass', 'numero'].includes(betType)) {
        return message.reply('❌ El tipo de apuesta debe ser "pass", "dontpass" o "numero".');
      }
      
      if (betType === 'numero') {
        if (isNaN(specificNumber) || specificNumber < 2 || specificNumber > 12) {
          return message.reply('❌ Para apostar a un número específico, debes indicar un número entre 2 y 12.');
        }
      }
      
      // Verificar si el usuario tiene perfil
      const profile = await Profile.findOne({
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        return message.reply(`❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`);
      }
      
      // Verificar si tiene suficientes monedas
      if (profile.character.currency < amount) {
        return message.reply(`❌ No tienes suficientes monedas. Tienes ${profile.character.currency} monedas.`);
      }
      
      // Restar las monedas de la apuesta
      profile.character.currency -= amount;
      await profile.save();
      
      // Iniciar el juego
      this.playCrapsDice(message, amount, betType, specificNumber, profile);
    } 
    else {
      return message.reply(`❌ Subcomando desconocido. Usa \`${serverConfig.config.prefix}dados simple\` o \`${serverConfig.config.prefix}dados craps\`.`);
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'simple') {
      const amount = interaction.options.getInteger('apuesta');
      const number = interaction.options.getInteger('numero');
      
      // Verificar si el usuario tiene perfil
      const profile = await Profile.findOne({
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        return interaction.reply({ content: `❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`, ephemeral: true });
      }
      
      // Verificar si tiene suficientes monedas
      if (profile.character.currency < amount) {
        return interaction.reply({ content: `❌ No tienes suficientes monedas. Tienes ${profile.character.currency} monedas.`, ephemeral: true });
      }
      
      // Restar las monedas de la apuesta
      profile.character.currency -= amount;
      await profile.save();
      
      // Iniciar el juego
      await interaction.reply(`🎲 **DADOS** - Apostando ${amount} monedas al número ${number}`);
      this.playSimpleDice(interaction, amount, number, profile);
    } 
    else if (subcommand === 'craps') {
      const amount = interaction.options.getInteger('apuesta');
      const betType = interaction.options.getString('tipo');
      const specificNumber = interaction.options.getInteger('numero');
      
      if (betType === 'numero' && !specificNumber) {
        return interaction.reply({ content: '❌ Para apostar a un número específico, debes indicar un número entre 2 y 12.', ephemeral: true });
      }
      
      // Verificar si el usuario tiene perfil
      const profile = await Profile.findOne({
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        return interaction.reply({ content: `❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`, ephemeral: true });
      }
      
      // Verificar si tiene suficientes monedas
      if (profile.character.currency < amount) {
        return interaction.reply({ content: `❌ No tienes suficientes monedas. Tienes ${profile.character.currency} monedas.`, ephemeral: true });
      }
      
      // Restar las monedas de la apuesta
      profile.character.currency -= amount;
      await profile.save();
      
      // Iniciar el juego
      let betTypeText = '';
      if (betType === 'pass') {
        betTypeText = 'Pass Line';
      } else if (betType === 'dontpass') {
        betTypeText = 'Don\'t Pass';
      } else {
        betTypeText = `número ${specificNumber}`;
      }
      
      await interaction.reply(`🎲 **CRAPS** - Apostando ${amount} monedas a ${betTypeText}`);
      this.playCrapsDice(interaction, amount, betType, specificNumber, profile);
    }
  },
  
  // Método para juego de dado simple
  async playSimpleDice(context, amount, number, profile) {
    // Emojis para los dados
    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    
    // Crear embed inicial
    const initialEmbed = new EmbedBuilder()
      .setTitle('🎲 LANZAMIENTO DE DADO 🎲')
      .setDescription(`
**Apuesta:** ${amount} monedas
**Tu predicción:** ${diceEmojis[number-1]} (${number})

Lanzando dado...
      `)
      .setColor('#9900ff');
    
    // Enviar mensaje inicial
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed] }) 
      : await context.reply({ embeds: [initialEmbed] });
    
    // Esperar un momento para crear suspense
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Tirar el dado (resultado aleatorio 1-6)
    const result = Math.floor(Math.random() * 6) + 1;
    const isWin = result === number;
    
    // Multiplicador según la apuesta (1/6 probabilidad = x5 multiplicador)
    const multiplier = 5;
    
    // Calcular ganancias
    let winnings = 0;
    if (isWin) {
      winnings = amount * multiplier;
      
      // Actualizar monedas del usuario
      profile.character.currency += winnings;
      profile.stats.wins += 1;
      
      // Actualizar estadísticas si existe en inventario
      if (profile.character.inventory) {
        let diceStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Dados");
        if (!diceStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Dados",
            quantity: 1,
            description: "Registro de tus lanzamientos de dados"
          });
          diceStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!diceStatsItem.metadata) {
          diceStatsItem.metadata = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            simpleGames: 0,
            crapsGames: 0,
            biggestWin: 0,
            luckyNumber: null,
            numberCounts: {}
          };
        }
        
        // Actualizar estadísticas
        diceStatsItem.metadata.gamesPlayed = (diceStatsItem.metadata.gamesPlayed || 0) + 1;
        diceStatsItem.metadata.wins = (diceStatsItem.metadata.wins || 0) + 1;
        diceStatsItem.metadata.simpleGames = (diceStatsItem.metadata.simpleGames || 0) + 1;
        
        // Inicializar conteo de números si no existe
        if (!diceStatsItem.metadata.numberCounts) {
          diceStatsItem.metadata.numberCounts = {};
        }
        
        // Actualizar conteo para el número resultado
        diceStatsItem.metadata.numberCounts[result] = (diceStatsItem.metadata.numberCounts[result] || 0) + 1;
        
        // Determinar número más frecuente (número de la suerte)
        let maxCount = 0;
        let luckyNumber = null;
        
        for (const [num, count] of Object.entries(diceStatsItem.metadata.numberCounts)) {
          if (count > maxCount) {
            maxCount = count;
            luckyNumber = parseInt(num);
          }
        }
        
        diceStatsItem.metadata.luckyNumber = luckyNumber;
        
        // Actualizar mayor victoria
        const profit = winnings - amount;
        if (profit > (diceStatsItem.metadata.biggestWin || 0)) {
          diceStatsItem.metadata.biggestWin = profit;
        }
        
        // Actualizar descripción
        diceStatsItem.description = `Estadísticas de Dados: ${diceStatsItem.metadata.wins}/${diceStatsItem.metadata.gamesPlayed} victorias, Mayor ganancia: ${diceStatsItem.metadata.biggestWin} monedas`;
      }
      
      await profile.save();
    } else {
      profile.stats.losses += 1;
      
      // Actualizar estadísticas si existe en inventario
      if (profile.character.inventory) {
        let diceStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Dados");
        if (!diceStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Dados",
            quantity: 1,
            description: "Registro de tus lanzamientos de dados"
          });
          diceStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!diceStatsItem.metadata) {
          diceStatsItem.metadata = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            simpleGames: 0,
            crapsGames: 0,
            biggestWin: 0,
            luckyNumber: null,
            numberCounts: {}
          };
        }
        
        // Actualizar estadísticas
        diceStatsItem.metadata.gamesPlayed = (diceStatsItem.metadata.gamesPlayed || 0) + 1;
        diceStatsItem.metadata.losses = (diceStatsItem.metadata.losses || 0) + 1;
        diceStatsItem.metadata.simpleGames = (diceStatsItem.metadata.simpleGames || 0) + 1;
        
        // Inicializar conteo de números si no existe
        if (!diceStatsItem.metadata.numberCounts) {
          diceStatsItem.metadata.numberCounts = {};
        }
        
        // Actualizar conteo para el número resultado
        diceStatsItem.metadata.numberCounts[result] = (diceStatsItem.metadata.numberCounts[result] || 0) + 1;
        
        // Determinar número más frecuente (número de la suerte)
        let maxCount = 0;
        let luckyNumber = null;
        
        for (const [num, count] of Object.entries(diceStatsItem.metadata.numberCounts)) {
          if (count > maxCount) {
            maxCount = count;
            luckyNumber = parseInt(num);
          }
        }
        
        diceStatsItem.metadata.luckyNumber = luckyNumber;
        
        // Actualizar descripción
        diceStatsItem.description = `Estadísticas de Dados: ${diceStatsItem.metadata.wins}/${diceStatsItem.metadata.gamesPlayed} victorias, Mayor ganancia: ${diceStatsItem.metadata.biggestWin} monedas`;
      }
      
      await profile.save();
    }
    
    // Obtener el resultado final
    let resultTitle, resultDescription, resultColor;
    
    if (isWin) {
      // Victoria
      resultTitle = '🎉 ¡HAS GANADO! 🎉';
      resultDescription = `
**Apuesta:** ${amount} monedas
**Tu predicción:** ${diceEmojis[number-1]} (${number})
**Resultado:** ${diceEmojis[result-1]} (${result})

**¡GANANCIA!** +${winnings - amount} monedas
**Total recibido:** ${winnings} monedas
      `;
      resultColor = '#00cc44';
    } else {
      // Derrota
      resultTitle = '❌ ¡HAS PERDIDO! ❌';
      resultDescription = `
**Apuesta:** ${amount} monedas
**Tu predicción:** ${diceEmojis[number-1]} (${number})
**Resultado:** ${diceEmojis[result-1]} (${result})

**Has perdido:** ${amount} monedas
      `;
      resultColor = '#ff0000';
    }
    
    // Crear embed final
    const finalEmbed = new EmbedBuilder()
      .setTitle(resultTitle)
      .setDescription(resultDescription)
      .setColor(resultColor);
    
    // Botones para jugar de nuevo
    const playAgainButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`dice:again:${profile._id}:${amount}:${number}:simple`)
          .setLabel('🔄 JUGAR DE NUEVO')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`dice:double:${profile._id}:${amount}:${number}:simple`)
          .setLabel('💰 DOBLAR APUESTA')
          .setStyle(isWin ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`dice:change:${profile._id}:${amount}:${number}:simple`)
          .setLabel('🎲 CAMBIAR NÚMERO')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await gameMessage.edit({ embeds: [finalEmbed], components: [playAgainButtons] });
    
    // Crear collector para botones "jugar de nuevo"
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'dice' && ['again', 'double', 'change'].includes(action) && 
            profileId === profile._id.toString() && 
            (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ filter, time: 60000 });
    
    collector.on('collect', async i => {
      const [, action, , betAmount, betNumber, mode] = i.customId.split(':');
      
      if (action === 'change') {
        // Mostrar selector de número
        const numberButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`dice:selectnum:${profile._id}:${amount}:1:simple`)
              .setLabel('1')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚀'),
            new ButtonBuilder()
              .setCustomId(`dice:selectnum:${profile._id}:${amount}:2:simple`)
              .setLabel('2')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚁'),
            new ButtonBuilder()
              .setCustomId(`dice:selectnum:${profile._id}:${amount}:3:simple`)
              .setLabel('3')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚂')
          );
        
        const numberButtons2 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`dice:selectnum:${profile._id}:${amount}:4:simple`)
              .setLabel('4')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚃'),
            new ButtonBuilder()
              .setCustomId(`dice:selectnum:${profile._id}:${amount}:5:simple`)
              .setLabel('5')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚄'),
            new ButtonBuilder()
              .setCustomId(`dice:selectnum:${profile._id}:${amount}:6:simple`)
              .setLabel('6')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('⚅')
          );
        
        const selectEmbed = new EmbedBuilder()
          .setTitle('🎲 SELECCIONA UN NÚMERO')
          .setDescription(`
Selecciona el número al que quieres apostar.

**Apuesta:** ${betAmount} monedas
          `)
          .setColor('#9900ff');
        
        await i.update({ embeds: [selectEmbed], components: [numberButtons, numberButtons2] });
        return;
      }
      
      if (action === 'selectnum') {
        const newNumber = parseInt(betNumber);
        const newAmount = parseInt(betAmount);
        
        // Verificar si tiene suficientes monedas
        const updatedProfile = await Profile.findById(profile._id);
        
        if (updatedProfile.character.currency < newAmount) {
          await i.reply({ 
            content: `❌ No tienes suficientes monedas para apostar ${newAmount}. Tienes ${updatedProfile.character.currency} monedas.`,
            ephemeral: true
          });
          return;
        }
        
        // Restar las monedas de la apuesta
        updatedProfile.character.currency -= newAmount;
        await updatedProfile.save();
        
        // Iniciar nuevo juego
        await i.update({ 
          content: `🎲 **DADOS** - Nueva apuesta: ${newAmount} monedas al número ${newNumber}`,
          embeds: [], 
          components: [] 
        });
        
        this.playSimpleDice(context, newAmount, newNumber, updatedProfile);
        return;
      }
      
      // Determinar nueva configuración
      let newAmount = parseInt(betAmount);
      const newNumber = parseInt(betNumber);
      
      if (action === 'double') {
        newAmount *= 2;
      }
      
      // Verificar si tiene suficientes monedas
      const updatedProfile = await Profile.findById(profile._id);
      
      if (updatedProfile.character.currency < newAmount) {
        await i.reply({ 
          content: `❌ No tienes suficientes monedas para apostar ${newAmount}. Tienes ${updatedProfile.character.currency} monedas.`,
          ephemeral: true
        });
        return;
      }
      
      // Restar las monedas de la apuesta
      updatedProfile.character.currency -= newAmount;
      await updatedProfile.save();
      
      // Iniciar nuevo juego
      await i.update({ 
        content: `🎲 **DADOS** - Nueva apuesta: ${newAmount} monedas al número ${newNumber}`,
        embeds: [], 
        components: [] 
      });
      
      this.playSimpleDice(context, newAmount, newNumber, updatedProfile);
    });
  },
  
  // Método para juego de craps
  async playCrapsDice(context, amount, betType, specificNumber, profile) {
    // Emojis para los dados
    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    
    // Multiplicadores según tipo de apuesta
    const multipliers = {
      'pass': 1.9, // Pass Line (casi 1:1)
      'dontpass': 1.9, // Don't Pass (casi 1:1)
      'numero': {
        2: 30, // 1/36 probabilidad
        3: 15, // 2/36 probabilidad
        4: 10, // 3/36 probabilidad
        5: 7, // 4/36 probabilidad
        6: 6, // 5/36 probabilidad
        7: 5, // 6/36 probabilidad (más común)
        8: 6, // 5/36 probabilidad
        9: 7, // 4/36 probabilidad
        10: 10, // 3/36 probabilidad
        11: 15, // 2/36 probabilidad
        12: 30 // 1/36 probabilidad
      }
    };
    
    // Función para lanzar dados y obtener suma
    function rollDice() {
      const die1 = Math.floor(Math.random() * 6) + 1;
      const die2 = Math.floor(Math.random() * 6) + 1;
      return { die1, die2, sum: die1 + die2 };
    }
    
    // Crear embed inicial
    let initialDescription = `**Apuesta:** ${amount} monedas\n`;
    
    if (betType === 'pass') {
      initialDescription += `**Tipo de apuesta:** Pass Line (Ganas con 7 u 11, pierdes con 2, 3 o 12)\n`;
    } else if (betType === 'dontpass') {
      initialDescription += `**Tipo de apuesta:** Don't Pass (Ganas con 2 o 3, pierdes con 7 u 11, empate en 12)\n`;
    } else {
      initialDescription += `**Tipo de apuesta:** Número específico ${specificNumber}\n`;
    }
    
    const initialEmbed = new EmbedBuilder()
      .setTitle('🎲 CRAPS 🎲')
      .setDescription(`
${initialDescription}
Lanzando dados...
      `)
      .setColor('#9900ff');
    
    // Enviar mensaje inicial
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed] }) 
      : await context.reply({ embeds: [initialEmbed] });
    
    // Esperar un momento para crear suspense
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Lanzar los dados
    const comeOutRoll = rollDice();
    
    // Determinar si hay un punto para seguir jugando (para Pass Line y Don't Pass)
    let point = 0;
    
    // Estado del juego
    let gameState = 'initial'; // Posibles estados: initial, point, resolved
    let isWin = false;
    let isDraw = false;
    
    // Verificar resultado según el tipo de apuesta
    if (betType === 'pass') {
      if (comeOutRoll.sum === 7 || comeOutRoll.sum === 11) {
        // Pass Line gana inmediatamente con 7 u 11
        isWin = true;
        gameState = 'resolved';
      } else if (comeOutRoll.sum === 2 || comeOutRoll.sum === 3 || comeOutRoll.sum === 12) {
        // Pass Line pierde inmediatamente con 2, 3 o 12
        isWin = false;
        gameState = 'resolved';
      } else {
        // Se establece un punto
        point = comeOutRoll.sum;
        gameState = 'point';
      }
    } else if (betType === 'dontpass') {
      if (comeOutRoll.sum === 2 || comeOutRoll.sum === 3) {
        // Don't Pass gana inmediatamente con 2 o 3
        isWin = true;
        gameState = 'resolved';
      } else if (comeOutRoll.sum === 7 || comeOutRoll.sum === 11) {
        // Don't Pass pierde inmediatamente con 7 u 11
        isWin = false;
        gameState = 'resolved';
      } else if (comeOutRoll.sum === 12) {
        // Don't Pass empata con 12 (se devuelve la apuesta)
        isDraw = true;
        gameState = 'resolved';
      } else {
        // Se establece un punto
        point = comeOutRoll.sum;
        gameState = 'point';
      }
    } else if (betType === 'numero') {
      // Apuesta a número específico (se resuelve inmediatamente)
      isWin = (comeOutRoll.sum === specificNumber);
      gameState = 'resolved';
    }
    
    // Si se estableció un punto, continuar lanzando
    let pointRolls = [];
    let finalRoll = null;
    
    if (gameState === 'point') {
      // Mostrar que se estableció un punto
      const pointEmbed = new EmbedBuilder()
        .setTitle('🎲 CRAPS - PUNTO ESTABLECIDO 🎲')
        .setDescription(`
**Apuesta:** ${amount} monedas
**Tipo de apuesta:** ${betType === 'pass' ? 'Pass Line' : 'Don\'t Pass'}
**Tirada inicial:** ${diceEmojis[comeOutRoll.die1-1]} ${diceEmojis[comeOutRoll.die2-1]} (${comeOutRoll.sum})

Se ha establecido el punto ${point}.
${betType === 'pass' ? 
  `Ganarás si sale ${point} antes que un 7.` : 
  `Ganarás si sale 7 antes que ${point}.`}

Continuando con los lanzamientos...
        `)
        .setColor('#ffaa00');
      
      await gameMessage.edit({ embeds: [pointEmbed] });
      
      // Esperar un momento para continuar
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Continuar lanzando hasta que salga el punto o un 7
      let pointResolved = false;
      let rollCount = 0;
      const maxRolls = 6; // Máximo de lanzamientos para no hacer el juego muy largo
      
      while (!pointResolved && rollCount < maxRolls) {
        rollCount++;
        
        // Lanzar dados
        const roll = rollDice();
        pointRolls.push(roll);
        
        // Mostrar resultado de este lanzamiento
        const rollEmbed = new EmbedBuilder()
          .setTitle(`🎲 CRAPS - LANZAMIENTO ${rollCount} 🎲`)
          .setDescription(`
**Punto establecido:** ${point}
**Lanzamiento ${rollCount}:** ${diceEmojis[roll.die1-1]} ${diceEmojis[roll.die2-1]} (${roll.sum})
          `)
          .setColor('#9900ff');
        
        await gameMessage.edit({ embeds: [rollEmbed] });
        
        // Esperar un momento entre lanzamientos
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Comprobar si se resolvió el punto
        if (roll.sum === point || roll.sum === 7) {
          pointResolved = true;
          finalRoll = roll;
          
          // Determinar resultado
          if (betType === 'pass') {
            isWin = (roll.sum === point); // Pass Line gana si sale el punto antes que 7
          } else { // dontpass
            isWin = (roll.sum === 7); // Don't Pass gana si sale 7 antes que el punto
          }
        }
      }
      
      // Si llegamos al máximo de lanzamientos sin resolver, hacer un último lanzamiento decisivo
      if (!pointResolved) {
        // Lanzamiento final con más probabilidad de resolver
        const forcedOutcome = Math.random() < 0.6 ? 7 : point;
        finalRoll = {
          die1: forcedOutcome === 7 ? 1 : 3,
          die2: forcedOutcome === 7 ? 6 : 3,
          sum: forcedOutcome
        };
        
        // Determinar resultado según el lanzamiento forzado
        if (betType === 'pass') {
          isWin = (finalRoll.sum === point);
        } else { // dontpass
          isWin = (finalRoll.sum === 7);
        }
        
        // Mostrar resultado de este lanzamiento final
        const finalRollEmbed = new EmbedBuilder()
          .setTitle(`🎲 CRAPS - LANZAMIENTO FINAL 🎲`)
          .setDescription(`
**Punto establecido:** ${point}
**Lanzamiento final:** ${diceEmojis[finalRoll.die1-1]} ${diceEmojis[finalRoll.die2-1]} (${finalRoll.sum})
          `)
          .setColor('#ff5500');
        
        await gameMessage.edit({ embeds: [finalRollEmbed] });
        
        // Esperar un momento para el resultado
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Calcular ganancias
    let winnings = 0;
    if (isWin) {
      if (betType === 'numero') {
        winnings = Math.floor(amount * multipliers.numero[specificNumber]);
      } else {
        // Pass Line o Don't Pass
        winnings = Math.floor(amount * multipliers[betType]);
      }
      
      // Actualizar monedas del usuario
      profile.character.currency += winnings;
      profile.stats.wins += 1;
      
      // Actualizar estadísticas si existe en inventario
      if (profile.character.inventory) {
        let diceStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Dados");
        if (!diceStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Dados",
            quantity: 1,
            description: "Registro de tus lanzamientos de dados"
          });
          diceStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!diceStatsItem.metadata) {
          diceStatsItem.metadata = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            simpleGames: 0,
            crapsGames: 0,
            biggestWin: 0,
            luckyNumber: null,
            numberCounts: {}
          };
        }
        
        // Actualizar estadísticas
        diceStatsItem.metadata.gamesPlayed = (diceStatsItem.metadata.gamesPlayed || 0) + 1;
        diceStatsItem.metadata.wins = (diceStatsItem.metadata.wins || 0) + 1;
        diceStatsItem.metadata.crapsGames = (diceStatsItem.metadata.crapsGames || 0) + 1;
        
        // Inicializar conteo de números si no existe
        if (!diceStatsItem.metadata.numberCounts) {
          diceStatsItem.metadata.numberCounts = {};
        }
        
        // Actualizar conteo para todos los números que salieron
        const allRolls = [comeOutRoll, ...pointRolls, finalRoll].filter(r => r !== null);
        for (const roll of allRolls) {
          diceStatsItem.metadata.numberCounts[roll.sum] = (diceStatsItem.metadata.numberCounts[roll.sum] || 0) + 1;
        }
        
        // Determinar número más frecuente (número de la suerte)
        let maxCount = 0;
        let luckyNumber = null;
        
        for (const [num, count] of Object.entries(diceStatsItem.metadata.numberCounts)) {
          if (count > maxCount) {
            maxCount = count;
            luckyNumber = parseInt(num);
          }
        }
        
        diceStatsItem.metadata.luckyNumber = luckyNumber;
        
        // Actualizar mayor victoria
        const profit = winnings - amount;
        if (profit > (diceStatsItem.metadata.biggestWin || 0)) {
          diceStatsItem.metadata.biggestWin = profit;
        }
        
        // Actualizar descripción
        diceStatsItem.description = `Estadísticas de Dados: ${diceStatsItem.metadata.wins}/${diceStatsItem.metadata.gamesPlayed} victorias, Mayor ganancia: ${diceStatsItem.metadata.biggestWin} monedas`;
      }
      
      await profile.save();
    } else if (isDraw) {
      // En caso de empate (Don't Pass con 12), devolver la apuesta
      profile.character.currency += amount;
      
      // Actualizar estadísticas si existe en inventario
      if (profile.character.inventory) {
        let diceStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Dados");
        if (!diceStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Dados",
            quantity: 1,
            description: "Registro de tus lanzamientos de dados"
          });
          diceStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!diceStatsItem.metadata) {
          diceStatsItem.metadata = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            simpleGames: 0,
            crapsGames: 0,
            biggestWin: 0,
            luckyNumber: null,
            numberCounts: {}
          };
        }
        
        // Actualizar estadísticas
        diceStatsItem.metadata.gamesPlayed = (diceStatsItem.metadata.gamesPlayed || 0) + 1;
        diceStatsItem.metadata.crapsGames = (diceStatsItem.metadata.crapsGames || 0) + 1;
        
        // Inicializar conteo de números si no existe
        if (!diceStatsItem.metadata.numberCounts) {
          diceStatsItem.metadata.numberCounts = {};
        }
        
        // Actualizar conteo para el número que salió
        diceStatsItem.metadata.numberCounts[comeOutRoll.sum] = (diceStatsItem.metadata.numberCounts[comeOutRoll.sum] || 0) + 1;
      }
      
      await profile.save();
    } else {
      profile.stats.losses += 1;
      
      // Actualizar estadísticas si existe en inventario
      if (profile.character.inventory) {
        let diceStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Dados");
        if (!diceStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Dados",
            quantity: 1,
            description: "Registro de tus lanzamientos de dados"
          });
          diceStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!diceStatsItem.metadata) {
          diceStatsItem.metadata = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            simpleGames: 0,
            crapsGames: 0,
            biggestWin: 0,
            luckyNumber: null,
            numberCounts: {}
          };
        }
        
        // Actualizar estadísticas
        diceStatsItem.metadata.gamesPlayed = (diceStatsItem.metadata.gamesPlayed || 0) + 1;
        diceStatsItem.metadata.losses = (diceStatsItem.metadata.losses || 0) + 1;
        diceStatsItem.metadata.crapsGames = (diceStatsItem.metadata.crapsGames || 0) + 1;
        
        // Inicializar conteo de números si no existe
        if (!diceStatsItem.metadata.numberCounts) {
          diceStatsItem.metadata.numberCounts = {};
        }
        
        // Actualizar conteo para todos los números que salieron
        const allRolls = [comeOutRoll, ...pointRolls, finalRoll].filter(r => r !== null);
        for (const roll of allRolls) {
          if (roll) {
            diceStatsItem.metadata.numberCounts[roll.sum] = (diceStatsItem.metadata.numberCounts[roll.sum] || 0) + 1;
          }
        }
      }
      
      await profile.save();
    }
    
    // Obtener el resultado final
    let resultTitle, resultDescription, resultColor;
    
    if (isDraw) {
      // Empate (solo en Don't Pass con 12)
      resultTitle = '🔄 ¡EMPATE! 🔄';
      resultDescription = `
**Apuesta:** ${amount} monedas
**Tipo de apuesta:** Don't Pass
**Tirada inicial:** ${diceEmojis[comeOutRoll.die1-1]} ${diceEmojis[comeOutRoll.die2-1]} (${comeOutRoll.sum})

En Don't Pass, un 12 resulta en empate. Se te devuelve tu apuesta.
      `;
      resultColor = '#ffaa00';
    } else if (isWin) {
      // Victoria
      resultTitle = '🎉 ¡HAS GANADO! 🎉';
      
      if (betType === 'numero') {
        // Apuesta a número específico
        resultDescription = `
**Apuesta:** ${amount} monedas al número ${specificNumber}
**Tirada:** ${diceEmojis[comeOutRoll.die1-1]} ${diceEmojis[comeOutRoll.die2-1]} (${comeOutRoll.sum})

**¡GANANCIA!** +${winnings - amount} monedas
**Total recibido:** ${winnings} monedas
        `;
      } else if (gameState === 'initial') {
        // Pass Line o Don't Pass decidido en tirada inicial
        resultDescription = `
**Apuesta:** ${amount} monedas
**Tipo de apuesta:** ${betType === 'pass' ? 'Pass Line' : 'Don\'t Pass'}
**Tirada inicial:** ${diceEmojis[comeOutRoll.die1-1]} ${diceEmojis[comeOutRoll.die2-1]} (${comeOutRoll.sum})

**¡GANANCIA!** +${winnings - amount} monedas
**Total recibido:** ${winnings} monedas
        `;
      } else {
        // Pass Line o Don't Pass decidido después de establecer punto
        resultDescription = `
**Apuesta:** ${amount} monedas
**Tipo de apuesta:** ${betType === 'pass' ? 'Pass Line' : 'Don\'t Pass'}
**Punto establecido:** ${point}
**Tirada final:** ${diceEmojis[finalRoll.die1-1]} ${diceEmojis[finalRoll.die2-1]} (${finalRoll.sum})

**¡GANANCIA!** +${winnings - amount} monedas
**Total recibido:** ${winnings} monedas
        `;
      }
      
      resultColor = '#00cc44';
    } else {
      // Derrota
      resultTitle = '❌ ¡HAS PERDIDO! ❌';
      
      if (betType === 'numero') {
        // Apuesta a número específico
        resultDescription = `
**Apuesta:** ${amount} monedas al número ${specificNumber}
**Tirada:** ${diceEmojis[comeOutRoll.die1-1]} ${diceEmojis[comeOutRoll.die2-1]} (${comeOutRoll.sum})

**Has perdido:** ${amount} monedas
        `;
      } else if (gameState === 'initial') {
        // Pass Line o Don't Pass decidido en tirada inicial
        resultDescription = `
**Apuesta:** ${amount} monedas
**Tipo de apuesta:** ${betType === 'pass' ? 'Pass Line' : 'Don\'t Pass'}
**Tirada inicial:** ${diceEmojis[comeOutRoll.die1-1]} ${diceEmojis[comeOutRoll.die2-1]} (${comeOutRoll.sum})

**Has perdido:** ${amount} monedas
        `;
      } else {
        // Pass Line o Don't Pass decidido después de establecer punto
        resultDescription = `
**Apuesta:** ${amount} monedas
**Tipo de apuesta:** ${betType === 'pass' ? 'Pass Line' : 'Don\'t Pass'}
**Punto establecido:** ${point}
**Tirada final:** ${diceEmojis[finalRoll.die1-1]} ${diceEmojis[finalRoll.die2-1]} (${finalRoll.sum})

**Has perdido:** ${amount} monedas
        `;
      }
      
      resultColor = '#ff0000';
    }
    
    // Crear embed final
    const finalEmbed = new EmbedBuilder()
      .setTitle(resultTitle)
      .setDescription(resultDescription)
      .setColor(resultColor);
    
    // Botones para jugar de nuevo
    const playAgainButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`dice:again:${profile._id}:${amount}:${betType}:craps:${specificNumber || 0}`)
          .setLabel('🔄 JUGAR DE NUEVO')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`dice:double:${profile._id}:${amount}:${betType}:craps:${specificNumber || 0}`)
          .setLabel('💰 DOBLAR APUESTA')
          .setStyle(isWin ? ButtonStyle.Success : ButtonStyle.Danger)
      );
    
    // Añadir botón para cambiar el tipo de apuesta
    const changeTypeButton = new ButtonBuilder()
      .setCustomId(`dice:change:${profile._id}:${amount}:${betType}:craps:${specificNumber || 0}`)
      .setLabel('🎲 CAMBIAR APUESTA')
      .setStyle(ButtonStyle.Secondary);
    
    playAgainButtons.addComponents(changeTypeButton);
    
    await gameMessage.edit({ embeds: [finalEmbed], components: [playAgainButtons] });
    
    // Crear collector para botones "jugar de nuevo"
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'dice' && ['again', 'double', 'change', 'selecttype', 'selectnum'].includes(action) && 
            profileId === profile._id.toString() && 
            (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ filter, time: 60000 });
    
    collector.on('collect', async i => {
      const [, action, , betAmount, betType, mode, specificNum] = i.customId.split(':');
      
      if (action === 'change') {
        // Mostrar selector de tipo de apuesta
        const typeButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`dice:selecttype:${profile._id}:${amount}:pass:craps:0`)
              .setLabel('PASS LINE')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`dice:selecttype:${profile._id}:${amount}:dontpass:craps:0`)
              .setLabel('DON\'T PASS')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`dice:selecttype:${profile._id}:${amount}:numero:craps:0`)
              .setLabel('NÚMERO ESPECÍFICO')
              .setStyle(ButtonStyle.Primary)
          );
        
        const selectEmbed = new EmbedBuilder()
          .setTitle('🎲 SELECCIONA TIPO DE APUESTA')
          .setDescription(`
Selecciona el tipo de apuesta que deseas realizar.

**Apuesta:** ${betAmount} monedas
          `)
          .setColor('#9900ff');
        
        await i.update({ embeds: [selectEmbed], components: [typeButtons] });
        return;
      }
      
      if (action === 'selecttype') {
        const newType = betType;
        const newAmount = parseInt(betAmount);
        
        if (newType === 'numero') {
          // Si seleccionó "número específico", mostrar selector de número
          const numberRows = [];
          
          // Crear filas de botones para los números 2-12
          for (let i = 2; i <= 12; i += 5) {
            const row = new ActionRowBuilder();
            for (let j = i; j < i + 5 && j <= 12; j++) {
              row.addComponents(
                new ButtonBuilder()
                  .setCustomId(`dice:selectnum:${profile._id}:${newAmount}:${newType}:craps:${j}`)
                  .setLabel(`${j}`)
                  .setStyle(ButtonStyle.Secondary)
              );
            }
            numberRows.push(row);
          }
          
          const selectNumEmbed = new EmbedBuilder()
            .setTitle('🎲 SELECCIONA UN NÚMERO')
            .setDescription(`
Selecciona el número al que quieres apostar (2-12).

**Apuesta:** ${newAmount} monedas
**Tipo:** Número específico
            `)
            .setColor('#9900ff');
          
          await i.update({ embeds: [selectNumEmbed], components: numberRows });
          return;
        }
        
        // Verificar si tiene suficientes monedas
        const updatedProfile = await Profile.findById(profile._id);
        
        if (updatedProfile.character.currency < newAmount) {
          await i.reply({ 
            content: `❌ No tienes suficientes monedas para apostar ${newAmount}. Tienes ${updatedProfile.character.currency} monedas.`,
            ephemeral: true
          });
          return;
        }
        
        // Restar las monedas de la apuesta
        updatedProfile.character.currency -= newAmount;
        await updatedProfile.save();
        
        // Iniciar nuevo juego
        await i.update({ 
          content: `🎲 **CRAPS** - Nueva apuesta: ${newAmount} monedas con ${newType === 'pass' ? 'Pass Line' : 'Don\'t Pass'}`,
          embeds: [], 
          components: [] 
        });
        
        this.playCrapsDice(context, newAmount, newType, null, updatedProfile);
        return;
      }
      
      if (action === 'selectnum') {
        const newType = betType;
        const newAmount = parseInt(betAmount);
        const newNum = parseInt(specificNum);
        
        // Verificar si tiene suficientes monedas
        const updatedProfile = await Profile.findById(profile._id);
        
        if (updatedProfile.character.currency < newAmount) {
          await i.reply({ 
            content: `❌ No tienes suficientes monedas para apostar ${newAmount}. Tienes ${updatedProfile.character.currency} monedas.`,
            ephemeral: true
          });
          return;
        }
        
        // Restar las monedas de la apuesta
        updatedProfile.character.currency -= newAmount;
        await updatedProfile.save();
        
        // Iniciar nuevo juego
        await i.update({ 
          content: `🎲 **CRAPS** - Nueva apuesta: ${newAmount} monedas al número ${newNum}`,
          embeds: [], 
          components: [] 
        });
        
        this.playCrapsDice(context, newAmount, newType, newNum, updatedProfile);
        return;
      }
      
      // Determinar nueva configuración
      let newAmount = parseInt(betAmount);
      const newType = betType;
      const newNum = specificNum !== "0" ? parseInt(specificNum) : null;
      
      if (action === 'double') {
        newAmount *= 2;
      }
      
      // Verificar si tiene suficientes monedas
      const updatedProfile = await Profile.findById(profile._id);
      
      if (updatedProfile.character.currency < newAmount) {
        await i.reply({ 
          content: `❌ No tienes suficientes monedas para apostar ${newAmount}. Tienes ${updatedProfile.character.currency} monedas.`,
          ephemeral: true
        });
        return;
      }
      
      // Restar las monedas de la apuesta
      updatedProfile.character.currency -= newAmount;
      await updatedProfile.save();
      
      // Iniciar nuevo juego
      let betTypeText = '';
      if (newType === 'pass') {
        betTypeText = 'Pass Line';
      } else if (newType === 'dontpass') {
        betTypeText = 'Don\'t Pass';
      } else {
        betTypeText = `número ${newNum}`;
      }
      
      await i.update({ 
        content: `🎲 **CRAPS** - Nueva apuesta: ${newAmount} monedas a ${betTypeText}`,
        embeds: [], 
        components: [] 
      });
      
      this.playCrapsDice(context, newAmount, newType, newNum, updatedProfile);
    });
  }
};