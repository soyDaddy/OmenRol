const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'slots',
  aliases: ['tragaperras', 'slot'],
  description: 'Juega a las tragaperras y prueba tu suerte',
  category: 'casino',
  cooldown: 3,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Juega a las tragaperras y prueba tu suerte')
    .addIntegerOption(option => 
      option.setName('apuesta')
        .setDescription('Cantidad de monedas para apostar')
        .setRequired(true)
        .setMinValue(5))
    .addStringOption(option =>
      option.setName('modo')
        .setDescription('Modo de juego')
        .setRequired(false)
        .addChoices(
          { name: '🎰 Clásico (3 rodillos)', value: 'clasico' },
          { name: '💎 Premium (5 rodillos)', value: 'premium' }
        )),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    if (!args[0]) {
      return message.reply('❌ Debes especificar una cantidad de monedas para apostar.');
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 5) {
      return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 5 monedas.');
    }
    
    // Determinar modo
    const mode = args[1]?.toLowerCase() || 'clasico';
    if (!['clasico', 'premium'].includes(mode)) {
      return message.reply('❌ El modo debe ser "clasico" o "premium".');
    }
    
    // El modo premium tiene un mínimo de apuesta de 20
    if (mode === 'premium' && amount < 20) {
      return message.reply('❌ El modo premium requiere una apuesta mínima de 20 monedas.');
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
    this.startGame(message, amount, mode, profile);
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const amount = interaction.options.getInteger('apuesta');
    const mode = interaction.options.getString('modo') || 'clasico';
    
    // El modo premium tiene un mínimo de apuesta de 20
    if (mode === 'premium' && amount < 20) {
      return interaction.reply({
        content: '❌ El modo premium requiere una apuesta mínima de 20 monedas.',
        ephemeral: true
      });
    }
    
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
    await interaction.reply(`🎰 **TRAGAPERRAS** - Apostando ${amount} monedas en modo ${mode}`);
    this.startGame(interaction, amount, mode, profile);
  },
  
  // Método para iniciar el juego
  async startGame(context, amount, mode, profile) {
    // Configuración según el modo
    const isClassic = mode === 'clasico';
    const reelsCount = isClassic ? 3 : 5;
    
    // Símbolos para la máquina tragaperras y sus multiplicadores
    const symbols = {
      '🍒': { value: 1, name: 'Cereza', frequency: isClassic ? 20 : 25 },
      '🍊': { value: 2, name: 'Naranja', frequency: isClassic ? 15 : 20 },
      '🍋': { value: 3, name: 'Limón', frequency: isClassic ? 12 : 16 },
      '🍇': { value: 4, name: 'Uvas', frequency: isClassic ? 10 : 12 },
      '🍉': { value: 5, name: 'Sandía', frequency: isClassic ? 8 : 10 },
      '🔔': { value: 10, name: 'Campana', frequency: isClassic ? 5 : 7 },
      '💎': { value: 15, name: 'Diamante', frequency: isClassic ? 3 : 5 },
      '7️⃣': { value: 20, name: 'Siete', frequency: isClassic ? 2 : 3 },
      '🎰': { value: 50, name: 'Jackpot', frequency: isClassic ? 1 : 2 }
    };
    
    // Símbolos adicionales solo para el modo premium
    if (!isClassic) {
      symbols['🌟'] = { value: 25, name: 'Estrella', frequency: 1 };
      symbols['🃏'] = { value: 0, name: 'Comodín', frequency: 1 }; // El comodín sustituye a cualquier símbolo
    }
    
    // Función para crear el array de símbolos según su frecuencia
    function createSymbolsPool() {
      const pool = [];
      for (const [symbol, data] of Object.entries(symbols)) {
        for (let i = 0; i < data.frequency; i++) {
          pool.push(symbol);
        }
      }
      return pool;
    }
    
    // Crear la distribución de símbolos
    const symbolsPool = createSymbolsPool();
    
    // Función para obtener un símbolo aleatorio
    function getRandomSymbol() {
      return symbolsPool[Math.floor(Math.random() * symbolsPool.length)];
    }
    
    // Función para generar los resultados de la tirada
    function spin() {
      const result = [];
      for (let i = 0; i < reelsCount; i++) {
        result.push(getRandomSymbol());
      }
      return result;
    }
    
    // Función para calcular las ganancias
    function calculateWinnings(spinResult) {
      // Si todos los símbolos son iguales, es un jackpot
      const allSame = spinResult.every(symbol => symbol === spinResult[0] || symbol === '🃏');
      
      if (allSame) {
        // Si hay un comodín, el valor se toma del otro símbolo presente
        const mainSymbol = spinResult.find(symbol => symbol !== '🃏') || spinResult[0];
        const symbolValue = symbols[mainSymbol].value;
        
        // Jackpot completo
        if (reelsCount === 3) {
          // En modo clásico, 3 símbolos iguales pagan x10 el valor del símbolo
          return amount * symbolValue * 10;
        } else {
          // En modo premium, 5 símbolos iguales pagan x50 el valor del símbolo
          return amount * symbolValue * 50;
        }
      }
      
      // Si no es un jackpot, verificar combinaciones parciales
      // En modo clásico, necesitamos al menos 2 símbolos iguales
      // En modo premium, necesitamos al menos 3 símbolos iguales
      
      // Contar ocurrencias de cada símbolo
      const counts = {};
      for (const symbol of spinResult) {
        counts[symbol] = (counts[symbol] || 0) + 1;
      }
      
      // Contar comodines (solo en modo premium)
      const wildCount = !isClassic ? (counts['🃏'] || 0) : 0;
      delete counts['🃏']; // Quitar comodines del conteo para no procesarlos como símbolos normales
      
      // Buscar la mejor combinación
      let bestSymbol = null;
      let bestCount = isClassic ? 1 : 2; // Mínimo para ganar: 2 en clásico, 3 en premium
      
      for (const [symbol, count] of Object.entries(counts)) {
        // Añadir comodines al conteo
        const totalCount = count + wildCount;
        
        // Si esta combinación es mejor que la anterior
        if (totalCount > bestCount || (totalCount === bestCount && symbols[symbol].value > symbols[bestSymbol]?.value)) {
          bestSymbol = symbol;
          bestCount = totalCount;
        }
      }
      
      // Si tenemos una combinación ganadora
      if (bestCount >= (isClassic ? 2 : 3) && bestSymbol) {
        const symbolValue = symbols[bestSymbol].value;
        
        // Calcular multiplicador según el número de símbolos iguales
        let multiplier = 0;
        
        if (isClassic) {
          // En modo clásico
          if (bestCount === 2) multiplier = 2;
          else multiplier = 10; // 3 símbolos iguales
        } else {
          // En modo premium
          if (bestCount === 3) multiplier = 3;
          else if (bestCount === 4) multiplier = 15;
          else multiplier = 50; // 5 símbolos iguales
        }
        
        return amount * symbolValue * multiplier / 10; // Dividir por 10 para escalar las ganancias
      }
      
      // Si no hay combinación ganadora
      return 0;
    }
    
    // Función para mostrar el resultado de manera visual
    function getSpinDisplay(spinResult) {
      return spinResult.join(' | ');
    }
    
    // Realizar la tirada
    const spinResult = spin();
    const winnings = Math.round(calculateWinnings(spinResult));
    
    // Crear embed inicial (antes de la tirada)
    const initialEmbed = new EmbedBuilder()
      .setTitle(`🎰 TRAGAPERRAS - MODO ${isClassic ? 'CLÁSICO' : 'PREMIUM'} 🎰`)
      .setDescription(`
**Apuesta:** ${amount} monedas

Girando los rodillos...
      `)
      .setColor('#ffaa00')
      .setFooter({ text: isClassic ? '3 rodillos - combina 2 o 3 símbolos' : '5 rodillos - combina 3, 4 o 5 símbolos' });
    
    // Enviar mensaje inicial
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed] }) 
      : await context.reply({ embeds: [initialEmbed] });
    
    // Esperar un momento para crear suspense
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mostrar resultado
    let resultColor;
    let resultTitle;
    let resultDescription;
    
    if (winnings > 0) {
      // El jugador gana
      resultColor = '#00ff00';
      
      // Determinar el título según la ganancia
      if (winnings >= amount * 10) {
        resultTitle = '🎉 ¡MEGA JACKPOT! 🎉';
      } else if (winnings >= amount * 5) {
        resultTitle = '🎉 ¡GRAN PREMIO! 🎉';
      } else if (winnings >= amount * 2) {
        resultTitle = '🎉 ¡PREMIO MAYOR! 🎉';
      } else if (winnings >= amount) {
        resultTitle = '🎉 ¡PREMIO! 🎉';
      } else {
        resultTitle = '🎉 ¡PEQUEÑO PREMIO! 🎉';
      }
      
      resultDescription = `
**Apuesta:** ${amount} monedas
**Resultado:** ${getSpinDisplay(spinResult)}

¡Has ganado ${winnings} monedas!
**Ganancia neta:** ${winnings - amount} monedas
      `;
      
      // Actualizar monedas del jugador
      profile.character.currency += winnings;
      profile.stats.wins += 1;
      
      // Actualizar estadísticas si existe en inventario
      updatePlayerStats(profile, winnings - amount);
    } else {
      // El jugador pierde
      resultColor = '#ff0000';
      resultTitle = '❌ ¡SIN PREMIO! ❌';
      resultDescription = `
**Apuesta:** ${amount} monedas
**Resultado:** ${getSpinDisplay(spinResult)}

No has conseguido una combinación ganadora.
Has perdido ${amount} monedas.
      `;
      
      profile.stats.losses += 1;
      
      // Actualizar estadísticas
      updatePlayerStats(profile, -amount);
    }
    
    await profile.save();
    
    // Crear embed de resultado
    const resultEmbed = new EmbedBuilder()
      .setTitle(resultTitle)
      .setDescription(resultDescription)
      .setColor(resultColor)
      .setFooter({ text: `Modo ${isClassic ? 'Clásico' : 'Premium'}` });
    
    // Botones para jugar de nuevo
    const playAgainButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`slots:again:${profile._id}:${amount}:${mode}`)
          .setLabel('🔄 JUGAR DE NUEVO')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`slots:double:${profile._id}:${amount}:${mode}`)
          .setLabel('💰 DOBLAR APUESTA')
          .setStyle(winnings > 0 ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`slots:switch:${profile._id}:${amount}:${mode}`)
          .setLabel(`🔀 MODO ${isClassic ? 'PREMIUM' : 'CLÁSICO'}`)
          .setStyle(ButtonStyle.Secondary)
      );
    
    await gameMessage.edit({ embeds: [resultEmbed], components: [playAgainButtons] });
    
    // Crear collector para jugar de nuevo
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'slots' && ['again', 'double', 'switch'].includes(action) && 
            profileId === profile._id.toString() && 
            (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ 
      filter, 
      time: 60000 
    });
    
    collector.on('collect', async i => {
      const [, action, , betAmount, currentMode] = i.customId.split(':');
      
      // Nueva apuesta y modo
      let newAmount = parseInt(betAmount);
      let newMode = currentMode;
      
      if (action === 'double') {
        newAmount *= 2;
      } else if (action === 'switch') {
        newMode = currentMode === 'clasico' ? 'premium' : 'clasico';
        
        // Si cambia a premium, verificar apuesta mínima
        if (newMode === 'premium' && newAmount < 20) {
          newAmount = 20;
        }
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
        content: `🎰 **TRAGAPERRAS** - Nueva partida con ${newAmount} monedas en modo ${newMode}`,
        embeds: [], 
        components: [] 
      });
      
      this.startGame(context, newAmount, newMode, updatedProfile);
    });
    
    // Función para actualizar estadísticas del jugador
    function updatePlayerStats(profile, profit) {
      if (profile.character.inventory) {
        let slotsStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Tragaperras");
        if (!slotsStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Tragaperras",
            quantity: 1,
            description: "Registro de tus tiradas en las tragaperras"
          });
          slotsStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!slotsStatsItem.metadata) {
          slotsStatsItem.metadata = {
            spinsPlayed: 0,
            wins: 0,
            losses: 0,
            jackpots: 0,
            biggestWin: 0,
            totalProfit: 0
          };
        }
        
        // Actualizar estadísticas generales
        slotsStatsItem.metadata.spinsPlayed = (slotsStatsItem.metadata.spinsPlayed || 0) + 1;
        slotsStatsItem.metadata.totalProfit = (slotsStatsItem.metadata.totalProfit || 0) + profit;
        
        // Actualizar victorias o derrotas
        if (profit > 0) {
          slotsStatsItem.metadata.wins = (slotsStatsItem.metadata.wins || 0) + 1;
          
          // Actualizar mayor victoria
          if (profit > (slotsStatsItem.metadata.biggestWin || 0)) {
            slotsStatsItem.metadata.biggestWin = profit;
          }
          
          // Verificar si es un jackpot (ganancia 10x o más)
          if (profit >= amount * 10) {
            slotsStatsItem.metadata.jackpots = (slotsStatsItem.metadata.jackpots || 0) + 1;
          }
        } else {
          slotsStatsItem.metadata.losses = (slotsStatsItem.metadata.losses || 0) + 1;
        }
        
        // Actualizar descripción
        slotsStatsItem.description = `Estadísticas de Tragaperras: ${slotsStatsItem.metadata.wins}/${slotsStatsItem.metadata.spinsPlayed} victorias, ${slotsStatsItem.metadata.jackpots} jackpots`;
      }
    }
  }
};