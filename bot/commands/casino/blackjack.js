const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'blackjack',
  aliases: ['bj', '21'],
  description: 'Juega al Blackjack contra la casa y gana monedas',
  category: 'casino',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Juega al Blackjack contra la casa y gana monedas')
    .addIntegerOption(option => 
      option.setName('apuesta')
        .setDescription('Cantidad de monedas para apostar')
        .setRequired(true)
        .setMinValue(10)),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    if (!args[0]) {
      return message.reply('❌ Debes especificar una cantidad de monedas para apostar.');
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 10) {
      return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 10 monedas.');
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
    this.startGame(message, amount, profile);
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const amount = interaction.options.getInteger('apuesta');
    
    // Verificar si el usuario tiene perfil
    const profile = await Profile.findOne({
      userId: interaction.user.id,
      serverId: interaction.guild.id
    });
    
    if (!profile) {
      return interaction.reply({
        content: `❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`,
        ephemeral: true
      });
    }
    
    // Verificar si tiene suficientes monedas
    if (profile.character.currency < amount) {
      return interaction.reply({
        content: `❌ No tienes suficientes monedas. Tienes ${profile.character.currency} monedas.`,
        ephemeral: true
      });
    }
    
    // Restar las monedas de la apuesta
    profile.character.currency -= amount;
    await profile.save();
    
    // Iniciar el juego
    await interaction.reply(`🃏 **BLACKJACK** - Apostando ${amount} monedas`);
    this.startGame(interaction, amount, profile);
  },
  
  // Método para iniciar el juego
  async startGame(context, amount, profile) {
    // Configuración de cartas
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['♥', '♦', '♣', '♠'];
    
    // Estado del juego
    let gameActive = true;
    let canDouble = true; // Opción de doblar disponible al inicio
    let doubledBet = false; // Indica si el jugador ha doblado la apuesta
    
    // Mazo y manos
    let deck = [];
    let playerHand = [];
    let dealerHand = [];
    
    // Crear y barajar el mazo
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ value, suit });
      }
    }
    shuffleDeck(deck);
    
    // Repartir cartas iniciales
    playerHand.push(drawCard());
    dealerHand.push(drawCard());
    playerHand.push(drawCard());
    dealerHand.push(drawCard());
    
    // Función para barajar el mazo
    function shuffleDeck(deck) {
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    
    // Función para sacar una carta del mazo
    function drawCard() {
      // Si quedan pocas cartas, volver a barajar
      if (deck.length < 10) {
        deck = [];
        for (const suit of suits) {
          for (const value of values) {
            deck.push({ value, suit });
          }
        }
        shuffleDeck(deck);
      }
      
      return deck.pop();
    }
    
    // Función para representar una carta
    function getCardDisplay(card) {
      const colorEmoji = card.suit === '♥' || card.suit === '♦' ? '🔴' : '⚫';
      return `${colorEmoji} ${card.value}${card.suit}`;
    }
    
    // Función para representar una mano de cartas
    function getHandDisplay(hand) {
      return hand.map(card => getCardDisplay(card)).join(' ');
    }
    
    // Función para representar una mano oculta (para el dealer)
    function getHiddenHandDisplay(hand) {
      if (hand.length === 0) return '';
      return `${getCardDisplay(hand[0])} 🂠`;
    }
    
    // Función para calcular el valor de una mano
    function calculateHandValue(hand) {
      let value = 0;
      let aces = 0;
      
      for (const card of hand) {
        if (card.value === 'A') {
          aces++;
          value += 11;
        } else if (['J', 'Q', 'K'].includes(card.value)) {
          value += 10;
        } else {
          value += parseInt(card.value);
        }
      }
      
      // Ajustar valor de ases si es necesario
      while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
      }
      
      return value;
    }
    
    // Verificar si una mano es un blackjack
    function isBlackjack(hand) {
      return hand.length === 2 && calculateHandValue(hand) === 21;
    }
    
    // Crear botones para las acciones del jugador
    function createGameButtons() {
      const row = new ActionRowBuilder();
      
      // Botón para pedir carta
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bj:hit:${profile._id}:${amount}`)
          .setLabel('PEDIR CARTA')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🃏')
      );
      
      // Botón para plantarse
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bj:stand:${profile._id}:${amount}`)
          .setLabel('PLANTARSE')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🛑')
      );
      
      // Botón para doblar (solo disponible al inicio)
      if (canDouble) {
        // Verificar si el jugador tiene suficientes monedas para doblar
        const canPlayerDouble = profile.character.currency >= amount;
        
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`bj:double:${profile._id}:${amount}`)
            .setLabel('DOBLAR APUESTA')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💰')
            .setDisabled(!canPlayerDouble)
        );
      }
      
      return row;
    }
    
    // Verificar blackjack inicial
    const playerHasBlackjack = isBlackjack(playerHand);
    const dealerHasBlackjack = isBlackjack(dealerHand);
    
    // Si ambos tienen blackjack, es un empate
    if (playerHasBlackjack && dealerHasBlackjack) {
      gameActive = false;
      
      // Devolver apuesta
      profile.character.currency += amount;
      
      // Actualizar estadísticas si existe en inventario
      updatePlayerStats(profile, 'empate');
      await profile.save();
      
      const tieEmbed = new EmbedBuilder()
        .setTitle('🎰 EMPATE - DOBLE BLACKJACK! 🎰')
        .setDescription(`
¡Tanto tú como la casa tienen Blackjack!

**Tu mano:** ${getHandDisplay(playerHand)} (${calculateHandValue(playerHand)})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${calculateHandValue(dealerHand)})

Se te devuelve tu apuesta de ${amount} monedas.
        `)
        .setColor('#ffaa00')
        .setFooter({ text: 'Se te ha devuelto tu apuesta inicial' });
      
      // Botones para jugar de nuevo
      const playAgainButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`bj:again:${profile._id}:${amount}`)
            .setLabel('🔄 JUGAR DE NUEVO')
            .setStyle(ButtonStyle.Primary)
        );
      
      const gameMessage = context.replied 
        ? await context.followUp({ embeds: [tieEmbed], components: [playAgainButtons] }) 
        : await context.reply({ embeds: [tieEmbed], components: [playAgainButtons] });
      
      // Configurar collector para jugar de nuevo
      setupAgainCollector(gameMessage);
      return;
    }
    
    // Si el jugador tiene blackjack, gana automáticamente con pago 3:2
    if (playerHasBlackjack) {
      gameActive = false;
      
      // Pagar al jugador (blackjack paga 3:2)
      const winnings = Math.floor(amount * 2.5);
      profile.character.currency += winnings;
      profile.stats.wins += 1;
      
      // Actualizar estadísticas si existe en inventario
      updatePlayerStats(profile, 'victoria', winnings - amount);
      await profile.save();
      
      const blackjackEmbed = new EmbedBuilder()
        .setTitle('🎰 ¡BLACKJACK! 🎰')
        .setDescription(`
¡Has conseguido un Blackjack!

**Tu mano:** ${getHandDisplay(playerHand)} (${calculateHandValue(playerHand)})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${calculateHandValue(dealerHand)})

**Pago 3:2**
**Apuesta:** ${amount} monedas
**Ganancia:** +${winnings - amount} monedas
**Total recibido:** ${winnings} monedas
        `)
        .setColor('#00ff00')
        .setFooter({ text: 'El Blackjack paga 3:2' });
      
      // Botones para jugar de nuevo
      const playAgainButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`bj:again:${profile._id}:${amount}`)
            .setLabel('🔄 JUGAR DE NUEVO')
            .setStyle(ButtonStyle.Primary)
        );
      
      const gameMessage = context.replied 
        ? await context.followUp({ embeds: [blackjackEmbed], components: [playAgainButtons] }) 
        : await context.reply({ embeds: [blackjackEmbed], components: [playAgainButtons] });
      
      // Configurar collector para jugar de nuevo
      setupAgainCollector(gameMessage);
      return;
    }
    
    // Si solo la casa tiene blackjack, el jugador pierde automáticamente
    if (dealerHasBlackjack) {
      gameActive = false;
      
      profile.stats.losses += 1;
      
      // Actualizar estadísticas si existe en inventario
      updatePlayerStats(profile, 'derrota');
      await profile.save();
      
      const loseEmbed = new EmbedBuilder()
        .setTitle('❌ LA CASA TIENE BLACKJACK ❌')
        .setDescription(`
¡La casa tiene Blackjack! Has perdido.

**Tu mano:** ${getHandDisplay(playerHand)} (${calculateHandValue(playerHand)})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${calculateHandValue(dealerHand)})

Has perdido ${amount} monedas.
        `)
        .setColor('#ff0000')
        .setFooter({ text: 'Mejor suerte la próxima vez' });
      
      // Botones para jugar de nuevo
      const playAgainButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`bj:again:${profile._id}:${amount}`)
            .setLabel('🔄 JUGAR DE NUEVO')
            .setStyle(ButtonStyle.Primary)
        );
      
      const gameMessage = context.replied 
        ? await context.followUp({ embeds: [loseEmbed], components: [playAgainButtons] }) 
        : await context.reply({ embeds: [loseEmbed], components: [playAgainButtons] });
      
      // Configurar collector para jugar de nuevo
      setupAgainCollector(gameMessage);
      return;
    }
    
    // Enviar mensaje inicial
    const initialEmbed = new EmbedBuilder()
      .setTitle('🃏 BLACKJACK 🃏')
      .setDescription(`
**Apuesta:** ${amount} monedas

**Tu mano:** ${getHandDisplay(playerHand)} (${calculateHandValue(playerHand)})
**Mano de la casa:** ${getHiddenHandDisplay(dealerHand)}

¿Qué quieres hacer?
      `)
      .setColor('#0099ff')
      .setFooter({ text: 'Puedes pedir carta, plantarte o doblar tu apuesta' });
    
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed], components: [createGameButtons()] }) 
      : await context.reply({ embeds: [initialEmbed], components: [createGameButtons()] });
    
    // Crear collector para las interacciones
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'bj' && ['hit', 'stand', 'double'].includes(action) && 
            profileId === profile._id.toString() && 
            (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ 
      filter, 
      time: 120000 
    });
    
    // Función para completar el turno de la casa
    async function dealerTurn() {
      // La casa pide cartas hasta llegar a 17 o más
      while (calculateHandValue(dealerHand) < 17) {
        dealerHand.push(drawCard());
      }
      
      const dealerValue = calculateHandValue(dealerHand);
      const playerValue = calculateHandValue(playerHand);
      
      // Determinar el resultado
      let resultEmbed;
      
      // Si la casa se pasa de 21, el jugador gana
      if (dealerValue > 21) {
        // Calcular ganancias
        const betAmount = doubledBet ? amount * 2 : amount;
        const winnings = betAmount * 2;
        
        // Actualizar monedas del jugador
        profile.character.currency += winnings;
        profile.stats.wins += 1;
        
        // Actualizar estadísticas si existe en inventario
        updatePlayerStats(profile, 'victoria', winnings - betAmount);
        await profile.save();
        
        resultEmbed = new EmbedBuilder()
          .setTitle('🎉 ¡LA CASA SE PASÓ! 🎉')
          .setDescription(`
¡La casa se pasó de 21! Has ganado.

**Tu mano:** ${getHandDisplay(playerHand)} (${playerValue})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${dealerValue})

**Apuesta:** ${betAmount} monedas
**Ganancia:** +${winnings - betAmount} monedas
**Total recibido:** ${winnings} monedas
          `)
          .setColor('#00ff00')
          .setFooter({ text: doubledBet ? 'Apuesta doblada' : 'Blackjack paga 1:1' });
      }
      // Si el valor de la casa es mayor que el del jugador, la casa gana
      else if (dealerValue > playerValue) {
        profile.stats.losses += 1;
        
        // Actualizar estadísticas si existe en inventario
        updatePlayerStats(profile, 'derrota');
        await profile.save();
        
        resultEmbed = new EmbedBuilder()
          .setTitle('❌ LA CASA GANA ❌')
          .setDescription(`
La casa tiene una mano más alta. Has perdido.

**Tu mano:** ${getHandDisplay(playerHand)} (${playerValue})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${dealerValue})

Has perdido ${doubledBet ? amount * 2 : amount} monedas.
          `)
          .setColor('#ff0000')
          .setFooter({ text: 'Mejor suerte la próxima vez' });
      }
      // Si el valor es igual, es un empate
      else if (dealerValue === playerValue) {
        // Devolver apuesta
        const betAmount = doubledBet ? amount * 2 : amount;
        profile.character.currency += betAmount;
        
        // Actualizar estadísticas si existe en inventario
        updatePlayerStats(profile, 'empate');
        await profile.save();
        
        resultEmbed = new EmbedBuilder()
          .setTitle('🎰 EMPATE 🎰')
          .setDescription(`
Ambos tienen el mismo valor. Es un empate.

**Tu mano:** ${getHandDisplay(playerHand)} (${playerValue})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${dealerValue})

Se te devuelve tu apuesta de ${betAmount} monedas.
          `)
          .setColor('#ffaa00')
          .setFooter({ text: 'Se te ha devuelto tu apuesta inicial' });
      }
      // Si el valor del jugador es mayor, el jugador gana
      else {
        // Calcular ganancias
        const betAmount = doubledBet ? amount * 2 : amount;
        const winnings = betAmount * 2;
        
        // Actualizar monedas del jugador
        profile.character.currency += winnings;
        profile.stats.wins += 1;
        
        // Actualizar estadísticas si existe en inventario
        updatePlayerStats(profile, 'victoria', winnings - betAmount);
        await profile.save();
        
        resultEmbed = new EmbedBuilder()
          .setTitle('🎉 ¡HAS GANADO! 🎉')
          .setDescription(`
¡Tu mano es mejor que la de la casa! Has ganado.

**Tu mano:** ${getHandDisplay(playerHand)} (${playerValue})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${dealerValue})

**Apuesta:** ${betAmount} monedas
**Ganancia:** +${winnings - betAmount} monedas
**Total recibido:** ${winnings} monedas
          `)
          .setColor('#00ff00')
          .setFooter({ text: doubledBet ? 'Apuesta doblada' : 'Blackjack paga 1:1' });
      }
      
      // Botones para jugar de nuevo
      const playAgainButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`bj:again:${profile._id}:${amount}`)
            .setLabel('🔄 JUGAR DE NUEVO')
            .setStyle(ButtonStyle.Primary)
        );
      
      await gameMessage.edit({ embeds: [resultEmbed], components: [playAgainButtons] });
    }
    
    // Procesar interacciones
    collector.on('collect', async i => {
      const [, action] = i.customId.split(':');
      
      if (!gameActive) {
        return;
      }
      
      // Después de la primera acción, ya no se puede doblar
      canDouble = false;
      
      if (action === 'hit') {
        // El jugador pide carta
        playerHand.push(drawCard());
        const playerValue = calculateHandValue(playerHand);
        
        // Verificar si el jugador se pasó de 21
        if (playerValue > 21) {
          gameActive = false;
          
          profile.stats.losses += 1;
          
          // Actualizar estadísticas si existe en inventario
          updatePlayerStats(profile, 'derrota');
          await profile.save();
          
          const bustEmbed = new EmbedBuilder()
            .setTitle('💥 ¡TE PASASTE! 💥')
            .setDescription(`
Te has pasado de 21. Has perdido.

**Tu mano:** ${getHandDisplay(playerHand)} (${playerValue})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${calculateHandValue(dealerHand)})

Has perdido ${doubledBet ? amount * 2 : amount} monedas.
            `)
            .setColor('#ff0000')
            .setFooter({ text: 'Mejor suerte la próxima vez' });
          
          // Botones para jugar de nuevo
          const playAgainButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`bj:again:${profile._id}:${amount}`)
                .setLabel('🔄 JUGAR DE NUEVO')
                .setStyle(ButtonStyle.Primary)
            );
          
          await i.update({ embeds: [bustEmbed], components: [playAgainButtons] });
          return;
        }
        
        // Actualizar mensaje con la nueva mano
        const hitEmbed = new EmbedBuilder()
          .setTitle('🃏 BLACKJACK 🃏')
          .setDescription(`
**Apuesta:** ${doubledBet ? amount * 2 : amount} monedas

**Tu mano:** ${getHandDisplay(playerHand)} (${playerValue})
**Mano de la casa:** ${getHiddenHandDisplay(dealerHand)}

¿Qué quieres hacer?
          `)
          .setColor('#0099ff')
          .setFooter({ text: 'Puedes pedir carta o plantarte' });
        
        await i.update({ embeds: [hitEmbed], components: [createGameButtons()] });
      }
      else if (action === 'stand') {
        // El jugador se planta, turno de la casa
        gameActive = false;
        
        // Mensaje de transición
        const standEmbed = new EmbedBuilder()
          .setTitle('🃏 BLACKJACK - TURNO DE LA CASA 🃏')
          .setDescription(`
Te plantas con ${calculateHandValue(playerHand)}.
Ahora es el turno de la casa...

**Tu mano:** ${getHandDisplay(playerHand)} (${calculateHandValue(playerHand)})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${calculateHandValue(dealerHand)})
          `)
          .setColor('#0099ff')
          .setFooter({ text: 'La casa debe plantarse con 17 o más' });
        
        await i.update({ embeds: [standEmbed], components: [] });
        
        // Esperar un momento para dar dramatismo
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Realizar el turno de la casa
        await dealerTurn();
      }
      else if (action === 'double') {
        // El jugador dobla su apuesta
        gameActive = false;
        doubledBet = true;
        
        // Comprobar saldo nuevamente
        if (profile.character.currency < amount) {
          await i.reply({
            content: `❌ No tienes suficientes monedas para doblar. Necesitas ${amount} monedas más.`,
            ephemeral: true
          });
          return;
        }
        
        // Restar monedas adicionales
        profile.character.currency -= amount;
        
        // El jugador recibe exactamente una carta más
        playerHand.push(drawCard());
        const playerValue = calculateHandValue(playerHand);
        
        // Mensaje de transición
        const doubleEmbed = new EmbedBuilder()
          .setTitle('🃏 BLACKJACK - APUESTA DOBLADA 🃏')
          .setDescription(`
Has doblado tu apuesta a ${amount * 2} monedas y recibido una carta final.
${playerValue > 21 ? '¡Te has pasado de 21!' : 'Ahora es el turno de la casa...'}

**Tu mano:** ${getHandDisplay(playerHand)} (${playerValue})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${calculateHandValue(dealerHand)})
          `)
          .setColor('#0099ff')
          .setFooter({ text: 'La casa debe plantarse con 17 o más' });
        
        await i.update({ embeds: [doubleEmbed], components: [] });
        
        // Verificar si el jugador se pasó de 21
        if (playerValue > 21) {
          profile.stats.losses += 1;
          
          // Actualizar estadísticas si existe en inventario
          updatePlayerStats(profile, 'derrota');
          await profile.save();
          
          const bustEmbed = new EmbedBuilder()
            .setTitle('💥 ¡TE PASASTE! 💥')
            .setDescription(`
Te has pasado de 21. Has perdido.

**Tu mano:** ${getHandDisplay(playerHand)} (${playerValue})
**Mano de la casa:** ${getHandDisplay(dealerHand)} (${calculateHandValue(dealerHand)})

Has perdido ${amount * 2} monedas.
            `)
            .setColor('#ff0000')
            .setFooter({ text: 'Mejor suerte la próxima vez' });
          
          // Botones para jugar de nuevo
          const playAgainButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`bj:again:${profile._id}:${amount}`)
                .setLabel('🔄 JUGAR DE NUEVO')
                .setStyle(ButtonStyle.Primary)
            );
          
          await gameMessage.edit({ embeds: [bustEmbed], components: [playAgainButtons] });
          return;
        }
        
        // Esperar un momento para dar dramatismo
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Realizar el turno de la casa
        await dealerTurn();
      }
    });
    
    // Función para configurar el collector para "jugar de nuevo"
    function setupAgainCollector(message) {
      const againFilter = i => {
        const [command, action, profileId] = i.customId.split(':');
        return command === 'bj' && action === 'again' && 
              profileId === profile._id.toString() && 
              (i.user.id === (context.author ? context.author.id : context.user.id));
      };
      
      const againCollector = message.createMessageComponentCollector({ 
        filter: againFilter, 
        time: 60000 
      });
      
      againCollector.on('collect', async i => {
        // Verificar si tiene suficientes monedas
        const updatedProfile = await Profile.findById(profile._id);
        
        if (updatedProfile.character.currency < amount) {
          await i.reply({ 
            content: `❌ No tienes suficientes monedas para apostar ${amount}. Tienes ${updatedProfile.character.currency} monedas.`,
            ephemeral: true
          });
          return;
        }
        
        // Restar las monedas de la apuesta
        updatedProfile.character.currency -= amount;
        await updatedProfile.save();
        
        // Iniciar nuevo juego
        await i.update({ 
          content: `🃏 **BLACKJACK** - Nueva partida con ${amount} monedas`,
          embeds: [], 
          components: [] 
        });
        
        this.startGame(context, amount, updatedProfile);
      });
    }
    
    // Función para actualizar estadísticas del jugador
    function updatePlayerStats(profile, result, profit = 0) {
      if (profile.character.inventory) {
        let bjStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Blackjack");
        if (!bjStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Blackjack",
            quantity: 1,
            description: "Registro de tus partidas de Blackjack"
          });
          bjStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!bjStatsItem.metadata) {
            bjStatsItem.metadata = {
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              blackjacks: 0,
              biggestWin: 0
            };
          }
          
          // Actualizar estadísticas
          bjStatsItem.metadata.gamesPlayed = (bjStatsItem.metadata.gamesPlayed || 0) + 1;
          
          if (result === 'victoria') {
            bjStatsItem.metadata.wins = (bjStatsItem.metadata.wins || 0) + 1;
            
            // Actualizar mayor victoria si corresponde
            if (profit > (bjStatsItem.metadata.biggestWin || 0)) {
              bjStatsItem.metadata.biggestWin = profit;
            }
            
            // Verificar si fue blackjack
            if (isBlackjack(playerHand)) {
              bjStatsItem.metadata.blackjacks = (bjStatsItem.metadata.blackjacks || 0) + 1;
            }
          } 
          else if (result === 'derrota') {
            bjStatsItem.metadata.losses = (bjStatsItem.metadata.losses || 0) + 1;
          }
          else if (result === 'empate') {
            bjStatsItem.metadata.draws = (bjStatsItem.metadata.draws || 0) + 1;
          }
          
          // Actualizar descripción
          bjStatsItem.description = `Estadísticas de Blackjack: ${bjStatsItem.metadata.wins}/${bjStatsItem.metadata.gamesPlayed} victorias, ${bjStatsItem.metadata.blackjacks} blackjacks`;
        }
      }
      
      // Si se acaba el tiempo del collector
      collector.on('end', async (collected, reason) => {
        if (gameActive) {
          // Si el juego sigue activo y se acabó el tiempo, el jugador pierde automáticamente
          gameActive = false;
          
          // Actualizar estadísticas
          profile.stats.losses += 1;
          updatePlayerStats(profile, 'derrota');
          await profile.save();
          
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ TIEMPO AGOTADO')
            .setDescription(`
  Se acabó el tiempo para tomar una decisión.
  Has perdido tu apuesta de ${doubledBet ? amount * 2 : amount} monedas.
  
  **Tu mano:** ${getHandDisplay(playerHand)} (${calculateHandValue(playerHand)})
  **Mano de la casa:** ${getHandDisplay(dealerHand)} (${calculateHandValue(dealerHand)})
            `)
            .setColor('#ff9900')
            .setFooter({ text: 'La partida ha terminado por tiempo agotado' });
          
          // Botones para jugar de nuevo
          const playAgainButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`bj:again:${profile._id}:${amount}`)
                .setLabel('🔄 JUGAR DE NUEVO')
                .setStyle(ButtonStyle.Primary)
            );
          
          try {
            await gameMessage.edit({ embeds: [timeoutEmbed], components: [playAgainButtons] });
            setupAgainCollector(gameMessage);
          } catch (err) {
            // Ignorar errores al editar mensajes antiguos
          }
        }
      });
    }
  };