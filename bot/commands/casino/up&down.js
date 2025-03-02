const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'altabaja',
  aliases: ['ab', 'highlow'],
  description: 'Juega a Alta o Baja y multiplica tus monedas',
  category: 'casino',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('altabaja')
    .setDescription('Juega a Alta o Baja y multiplica tus monedas')
    .addIntegerOption(option => 
      option.setName('apuesta')
        .setDescription('Cantidad de monedas para apostar')
        .setRequired(true)
        .setMinValue(10))
    .addIntegerOption(option => 
      option.setName('rondas')
        .setDescription('Número de rondas a jugar (1-10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    if (!args[0]) {
      return message.reply('❌ Debes especificar una cantidad de monedas para apostar.');
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 10) {
      return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 10 monedas.');
    }
    
    // Determinar rondas
    let rounds = 5; // Valor por defecto
    if (args[1]) {
      const userRounds = parseInt(args[1]);
      if (!isNaN(userRounds) && userRounds >= 1 && userRounds <= 10) {
        rounds = userRounds;
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
    this.startGame(message, amount, rounds, profile);
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const amount = interaction.options.getInteger('apuesta');
    const rounds = interaction.options.getInteger('rondas') || 5;
    
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
    await interaction.reply(`🎴 **ALTA O BAJA** - Apostando ${amount} monedas en ${rounds} rondas`);
    this.startGame(interaction, amount, rounds, profile);
  },
  
  // Método para iniciar el juego
  async startGame(context, amount, rounds, profile) {
    // Crear baraja de cartas
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const suits = ['♥', '♦', '♣', '♠'];
    const valueRanks = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    
    // Estado del juego
    let gameActive = true;
    let currentRound = 1;
    let correctPredictions = 0;
    let lastCard = null;
    let deck = [];
    
    // Crear mazo barajado
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ value, suit });
      }
    }
    
    // Barajar el mazo
    shuffleDeck(deck);
    
    // Sacar la primera carta
    lastCard = deck.pop();
    
    // Función para barajar el mazo
    function shuffleDeck(deck) {
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    
    // Función para representar una carta
    function getCardDisplay(card) {
      const colorEmoji = card.suit === '♥' || card.suit === '♦' ? '🔴' : '⚫';
      return `${colorEmoji} ${card.value}${card.suit}`;
    }
    
    // Función para representar el valor de la carta (para comparaciones)
    function getCardValue(card) {
      return valueRanks[card.value];
    }
    
    // Calcular multiplicador según el número de rondas
    function calculateMultiplier(correct, totalRounds) {
      let base = 1.5;
      let roundBonus = 1 + (totalRounds * 0.05);
      return Math.pow(base, correct) * roundBonus;
    }
    
    // Crear botones para seleccionar Alta o Baja
    const createButtons = () => {
      return new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ab:high:${profile._id}:${amount}:${rounds}`)
            .setLabel('ALTA')
            .setStyle(ButtonStyle.Success)
            .setEmoji('⬆️'),
          new ButtonBuilder()
            .setCustomId(`ab:low:${profile._id}:${amount}:${rounds}`)
            .setLabel('BAJA')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⬇️'),
          new ButtonBuilder()
            .setCustomId(`ab:cashout:${profile._id}:${amount}:${rounds}`)
            .setLabel('RETIRAR')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💰')
            .setDisabled(correctPredictions === 0)
        );
    };
    
    // Enviar mensaje inicial
    const initialEmbed = new EmbedBuilder()
      .setTitle('🎴 ALTA O BAJA 🎴')
      .setDescription(`
¡Bienvenido al juego de Alta o Baja!

**Apuesta:** ${amount} monedas
**Rondas:** ${rounds}
**Ronda actual:** 1/${rounds}

La carta actual es: ${getCardDisplay(lastCard)}

¿La siguiente carta será más ALTA o más BAJA?
      `)
      .setColor('#0099ff')
      .setFooter({ text: 'Puedes retirar tus ganancias en cualquier momento' });
    
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed], components: [createButtons()] }) 
      : await context.reply({ embeds: [initialEmbed], components: [createButtons()] });
    
    // Crear collector para las interacciones
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'ab' && ['high', 'low', 'cashout'].includes(action) && profileId === profile._id.toString() && (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ filter, time: 180000 });
    
    // Procesar interacciones
    collector.on('collect', async i => {
      const [, action] = i.customId.split(':');
      
      if (!gameActive) {
        // Si el juego ya terminó, procesar solo botones de "jugar de nuevo"
        if (action === 'again') {
          // Verificar si tiene suficientes monedas
          const updatedProfile = await Profile.findById(profile._id);
          
          if (updatedProfile.character.currency < amount) {
            await i.reply({ content: `❌ No tienes suficientes monedas para apostar ${amount}. Tienes ${updatedProfile.character.currency} monedas.`, ephemeral: true });
            return;
          }
          
          // Restar las monedas de la apuesta
          updatedProfile.character.currency -= amount;
          await updatedProfile.save();
          
          // Iniciar nuevo juego
          await i.update({ content: `🎴 **ALTA O BAJA** - Nueva partida con ${amount} monedas en ${rounds} rondas`, embeds: [], components: [] });
          
          this.startGame(context, amount, rounds, updatedProfile);
        }
        
        return;
      }
      
      if (action === 'cashout') {
        // El jugador decide retirarse y asegurar sus ganancias
        gameActive = false;
        
        // Calcular ganancias
        const multiplier = calculateMultiplier(correctPredictions, rounds);
        const winnings = Math.floor(amount * multiplier);
        
        // Actualizar monedas del usuario
        profile.character.currency += winnings;
        profile.stats.wins += 1;
        
        // Actualizar estadísticas si existe en inventario
        if (profile.character.inventory) {
          let abStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Alta o Baja");
          if (!abStatsItem) {
            profile.character.inventory.push({
              item: "Estadísticas de Alta o Baja",
              quantity: 1,
              description: "Registro de tus partidas de Alta o Baja"
            });
            abStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
          }
          
          // Inicializar metadatos si no existen
          if (!abStatsItem.metadata) {
            abStatsItem.metadata = {
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              highestStreak: 0,
              biggestWin: 0
            };
          }
          
          // Actualizar estadísticas
          abStatsItem.metadata.gamesPlayed = (abStatsItem.metadata.gamesPlayed || 0) + 1;
          abStatsItem.metadata.wins = (abStatsItem.metadata.wins || 0) + 1;
          
          // Actualizar racha más alta
          if (correctPredictions > (abStatsItem.metadata.highestStreak || 0)) {
            abStatsItem.metadata.highestStreak = correctPredictions;
          }
          
          // Actualizar mayor victoria
          const profit = winnings - amount;
          if (profit > (abStatsItem.metadata.biggestWin || 0)) {
            abStatsItem.metadata.biggestWin = profit;
          }
          
          // Actualizar descripción
          abStatsItem.description = `Estadísticas de Alta o Baja: ${abStatsItem.metadata.wins}/${abStatsItem.metadata.gamesPlayed} victorias, Racha máxima: ${abStatsItem.metadata.highestStreak}`;
        }
        
        await profile.save();
        
        // Mostrar resultado
        const cashoutEmbed = new EmbedBuilder()
          .setTitle('💰 ¡RETIRO EXITOSO! 💰')
          .setDescription(`
¡Te has retirado con ${correctPredictions} predicciones correctas!

**Multiplicador:** x${multiplier.toFixed(2)}
**Apuesta inicial:** ${amount} monedas
**Ganancia:** +${winnings - amount} monedas
**Total recibido:** ${winnings} monedas
          `)
          .setColor('#00cc44');
        
        // Botones para jugar de nuevo
        const playAgainButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ab:again:${profile._id}:${amount}:${rounds}`)
              .setLabel('🔄 JUGAR DE NUEVO')
              .setStyle(ButtonStyle.Primary)
          );
        
        await i.update({ embeds: [cashoutEmbed], components: [playAgainButtons] });
        collector.stop('cashout');
        return;
      }
      
      // El jugador elige Alta o Baja
      const nextCard = deck.pop();
      
      // Determinar si la predicción es correcta
      const prediction = action === 'high' ? 'ALTA' : 'BAJA';
      const nextCardValue = getCardValue(nextCard);
      const lastCardValue = getCardValue(lastCard);
      
      let isCorrect;
      if (nextCardValue === lastCardValue) {
        // Si las cartas tienen el mismo valor, se considera incorrecta
        isCorrect = false;
      } else if (action === 'high') {
        isCorrect = nextCardValue > lastCardValue;
      } else {
        isCorrect = nextCardValue < lastCardValue;
      }
      
      // Preparar mensajes según el resultado
      let resultMessage, resultColor;
      
      if (isCorrect) {
        correctPredictions++;
        
        if (currentRound === rounds) {
          // El jugador ha completado todas las rondas con éxito
          gameActive = false;
          
          // Calcular ganancias con un bono adicional por completar todas las rondas
          const multiplier = calculateMultiplier(correctPredictions, rounds) * 1.5;
          const winnings = Math.floor(amount * multiplier);
          
          // Actualizar monedas del usuario
          profile.character.currency += winnings;
          profile.stats.wins += 1;
          
          // Actualizar estadísticas si existe en inventario
          if (profile.character.inventory) {
            let abStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Alta o Baja");
            if (!abStatsItem) {
              profile.character.inventory.push({
                item: "Estadísticas de Alta o Baja",
                quantity: 1,
                description: "Registro de tus partidas de Alta o Baja"
              });
              abStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
            }
            
            // Inicializar metadatos si no existen
            if (!abStatsItem.metadata) {
              abStatsItem.metadata = {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                highestStreak: 0,
                biggestWin: 0
              };
            }
            
            // Actualizar estadísticas
            abStatsItem.metadata.gamesPlayed = (abStatsItem.metadata.gamesPlayed || 0) + 1;
            abStatsItem.metadata.wins = (abStatsItem.metadata.wins || 0) + 1;
            
            // Actualizar racha más alta
            if (correctPredictions > (abStatsItem.metadata.highestStreak || 0)) {
              abStatsItem.metadata.highestStreak = correctPredictions;
            }
            
            // Actualizar mayor victoria
            const profit = winnings - amount;
            if (profit > (abStatsItem.metadata.biggestWin || 0)) {
              abStatsItem.metadata.biggestWin = profit;
            }
            
            // Actualizar descripción
            abStatsItem.description = `Estadísticas de Alta o Baja: ${abStatsItem.metadata.wins}/${abStatsItem.metadata.gamesPlayed} victorias, Racha máxima: ${abStatsItem.metadata.highestStreak}`;
          }
          
          await profile.save();
          
          resultMessage = `
¡PREDICCIÓN CORRECTA! La carta era más ${prediction}.

${getCardDisplay(lastCard)} ➡️ ${getCardDisplay(nextCard)}

¡HAS COMPLETADO TODAS LAS RONDAS! 🎉

**Multiplicador:** x${multiplier.toFixed(2)} (Bono por completar todas las rondas)
**Apuesta inicial:** ${amount} monedas
**Ganancia:** +${winnings - amount} monedas
**Total recibido:** ${winnings} monedas
          `;
          resultColor = '#00cc44';
          
          // Botones para jugar de nuevo
          const playAgainButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`ab:again:${profile._id}:${amount}:${rounds}`)
                .setLabel('🔄 JUGAR DE NUEVO')
                .setStyle(ButtonStyle.Primary)
            );
          
          const victoryEmbed = new EmbedBuilder()
            .setTitle('🏆 ¡VICTORIA TOTAL! 🏆')
            .setDescription(resultMessage)
            .setColor(resultColor);
          
          await i.update({ embeds: [victoryEmbed], components: [playAgainButtons] });
          collector.stop('win');
          return;
        } else {
          // Predicción correcta, pero aún quedan rondas
          resultMessage = `
¡PREDICCIÓN CORRECTA! La carta era más ${prediction}.

${getCardDisplay(lastCard)} ➡️ ${getCardDisplay(nextCard)}

**Predicciones correctas:** ${correctPredictions}
**Multiplicador actual:** x${calculateMultiplier(correctPredictions, rounds).toFixed(2)}
**Potencial ganancia:** ${Math.floor(amount * calculateMultiplier(correctPredictions, rounds))} monedas
          `;
          resultColor = '#00cc44';
        }
      } else {
        // Predicción incorrecta, el jugador pierde
        gameActive = false;
        
        profile.stats.losses += 1;
        
        // Actualizar estadísticas si existe en inventario
        if (profile.character.inventory) {
          let abStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Alta o Baja");
          if (!abStatsItem) {
            profile.character.inventory.push({
              item: "Estadísticas de Alta o Baja",
              quantity: 1,
              description: "Registro de tus partidas de Alta o Baja"
            });
            abStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
          }
          
          // Inicializar metadatos si no existen
          if (!abStatsItem.metadata) {
            abStatsItem.metadata = {
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              highestStreak: 0,
              biggestWin: 0
            };
          }
          
          // Actualizar estadísticas
          abStatsItem.metadata.gamesPlayed = (abStatsItem.metadata.gamesPlayed || 0) + 1;
          abStatsItem.metadata.losses = (abStatsItem.metadata.losses || 0) + 1;
          
          // Actualizar descripción
          abStatsItem.description = `Estadísticas de Alta o Baja: ${abStatsItem.metadata.wins}/${abStatsItem.metadata.gamesPlayed} victorias, Racha máxima: ${abStatsItem.metadata.highestStreak}`;
        }
        
        await profile.save();
        
        resultMessage = `
¡PREDICCIÓN INCORRECTA! La carta no era más ${prediction}.

${getCardDisplay(lastCard)} ➡️ ${getCardDisplay(nextCard)}

**Has perdido:** ${amount} monedas
**Predicciones correctas:** ${correctPredictions}
          `;
          resultColor = '#ff0000';
          
          // Botones para jugar de nuevo
          const playAgainButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`ab:again:${profile._id}:${amount}:${rounds}`)
                .setLabel('🔄 JUGAR DE NUEVO')
                .setStyle(ButtonStyle.Primary)
            );
          
          const loseEmbed = new EmbedBuilder()
            .setTitle('❌ ¡HAS PERDIDO! ❌')
            .setDescription(resultMessage)
            .setColor(resultColor);
          
          await i.update({ embeds: [loseEmbed], components: [playAgainButtons] });
          collector.stop('lose');
          return;
      }
      
      // Si el juego continúa, actualizar para la siguiente ronda
      currentRound++;
      lastCard = nextCard;
      
      // Si queda 1 carta o menos, renovar el mazo
      if (deck.length <= 1) {
        deck = [];
        for (const suit of suits) {
          for (const value of values) {
            // No incluir la carta actual para evitar repeticiones
            if (!(value === lastCard.value && suit === lastCard.suit)) {
              deck.push({ value, suit });
            }
          }
        }
        shuffleDeck(deck);
      }
      
      // Mostrar resultado y preparar siguiente ronda
      const roundEmbed = new EmbedBuilder()
        .setTitle(`🎴 ALTA O BAJA - RONDA ${currentRound}/${rounds} 🎴`)
        .setDescription(`
${resultMessage}

La carta actual ahora es: ${getCardDisplay(lastCard)}

¿La siguiente carta será más ALTA o más BAJA?
Puedes RETIRAR tus ganancias actuales o seguir jugando.
        `)
        .setColor(resultColor)
        .setFooter({ text: `Predicciones correctas: ${correctPredictions}` });
      
      await i.update({ embeds: [roundEmbed], components: [createButtons()] });
    });
    
    // Si se acaba el tiempo del collector
    collector.on('end', async (collected, reason) => {
      if (gameActive && reason !== 'cashout' && reason !== 'win' && reason !== 'lose') {
        // Si el juego sigue activo y no terminó por una acción del usuario, considerarlo como una rendición
        gameActive = false;
        
        // Si el jugador tiene predicciones correctas, darle algo de ganancias
        if (correctPredictions > 0) {
          // Usar un multiplicador reducido (75% del normal) por tiempo agotado
          const reducedMultiplier = calculateMultiplier(correctPredictions, rounds) * 0.75;
          const winnings = Math.floor(amount * reducedMultiplier);
          
          // Actualizar monedas del usuario
          profile.character.currency += winnings;
          profile.stats.wins += 1;
          
          // Actualizar estadísticas
          if (profile.character.inventory) {
            let abStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Alta o Baja");
            if (abStatsItem) {
              // Actualizar racha más alta si aplicable
              if (correctPredictions > (abStatsItem.metadata.highestStreak || 0)) {
                abStatsItem.metadata.highestStreak = correctPredictions;
              }
              
              // Actualizar descripción
              abStatsItem.description = `Estadísticas de Alta o Baja: ${abStatsItem.metadata.wins}/${abStatsItem.metadata.gamesPlayed} victorias, Racha máxima: ${abStatsItem.metadata.highestStreak}`;
            }
          }
          
          await profile.save();
          
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ TIEMPO AGOTADO - RETIRO AUTOMÁTICO')
            .setDescription(`
Se acabó el tiempo para tomar una decisión.
Se realiza un retiro automático con tus ganancias actuales (con penalización).

**Predicciones correctas:** ${correctPredictions}
**Multiplicador:** x${reducedMultiplier.toFixed(2)} (Reducido por tiempo agotado)
**Apuesta inicial:** ${amount} monedas
**Ganancia:** +${winnings - amount} monedas
**Total recibido:** ${winnings} monedas
            `)
            .setColor('#ff9900');
          
          try {
            await gameMessage.edit({ embeds: [timeoutEmbed], components: [] });
          } catch (err) {
            // Ignorar errores al editar mensajes antiguos
          }
        } else {
          // Si no tiene predicciones correctas, pierde la apuesta
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ TIEMPO AGOTADO')
            .setDescription(`
Se acabó el tiempo para tomar una decisión.
Has perdido tu apuesta de ${amount} monedas.
            `)
            .setColor('#ff9900');
          
          try {
            await gameMessage.edit({ embeds: [timeoutEmbed], components: [] });
          } catch (err) {
            // Ignorar errores al editar mensajes antiguos
          }
        }
      }
    });
  }
};