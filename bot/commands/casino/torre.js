const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'torre',
  aliases: ['tower', 'risk'],
  description: 'Sube los niveles de la torre y gana más monedas cuanto más alto llegues',
  category: 'casino',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('torre')
    .setDescription('Sube los niveles de la torre y gana más monedas cuanto más alto llegues')
    .addIntegerOption(option => 
      option.setName('cantidad')
        .setDescription('Cantidad de monedas para apostar')
        .setRequired(true)
        .setMinValue(10))
    .addStringOption(option =>
      option.setName('dificultad')
        .setDescription('Nivel de dificultad')
        .setRequired(true)
        .addChoices(
          { name: 'Novato (10 niveles, 90%-50%)', value: 'novato' },
          { name: 'Aventurero (15 niveles, 85%-40%)', value: 'aventurero' },
          { name: 'Temerario (20 niveles, 80%-30%)', value: 'temerario' },
          { name: 'Legendario (25 niveles, 75%-20%)', value: 'legendario' }
        )),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    // Verificar argumentos
    if (!args[0]) {
      return message.reply('❌ Debes especificar una cantidad de monedas para apostar.');
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 10) {
      return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 10.');
    }
    
    // Determinar dificultad
    const availableDifficulties = ['novato', 'aventurero', 'temerario', 'legendario'];
    let difficulty = args[1]?.toLowerCase() || 'aventurero';
    
    if (!availableDifficulties.includes(difficulty)) {
      difficulty = 'aventurero';
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
    this.playRiskTower(message, amount, difficulty, profile);
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const amount = interaction.options.getInteger('cantidad');
    const difficulty = interaction.options.getString('dificultad');
    
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
    await interaction.reply(`🏰 **TORRE DE RIESGO** - Apostando ${amount} monedas en modo ${difficulty}`);
    this.playRiskTower(interaction, amount, difficulty, profile);
  },
  
  // Método para jugar a la torre de riesgo
  async playRiskTower(context, amount, difficulty, profile) {
    // Configurar según dificultad
    let totalLevels, startProbability, endProbability, difficultyColor;
    
    switch(difficulty) {
      case 'novato':
        totalLevels = 10;
        startProbability = 0.9;
        endProbability = 0.5;
        difficultyColor = '#00cc44'; // Verde
        break;
      case 'temerario':
        totalLevels = 20;
        startProbability = 0.8;
        endProbability = 0.3;
        difficultyColor = '#cc0000'; // Rojo
        break;
      case 'legendario':
        totalLevels = 25;
        startProbability = 0.75;
        endProbability = 0.2;
        difficultyColor = '#333333'; // Casi negro
        break;
      default: // aventurero
        totalLevels = 15;
        startProbability = 0.85;
        endProbability = 0.4;
        difficultyColor = '#0099ff'; // Azul
    }
    
    // Calcular multiplicadores y probabilidades para cada nivel
    const multipliers = [];
    const probabilities = [];
    const probabilityStep = (startProbability - endProbability) / (totalLevels - 1);
    
    for (let i = 0; i < totalLevels; i++) {
      // Multiplicador exponencial: comienza bajo y crece rápidamente en niveles altos
      multipliers.push(1 + (i * 0.2) + (i > totalLevels/2 ? Math.pow(i-totalLevels/2, 1.5) * 0.1 : 0));
      probabilities.push(startProbability - (i * probabilityStep));
    }
    
    // Estado del juego
    let currentLevel = 0;
    let currentWinnings = amount;
    let gameActive = true;
    
    // Crear visual de la torre
    const createTowerVisual = (level) => {
      const towerLines = [];
      
      for (let i = totalLevels - 1; i >= 0; i--) {
        const levelMultiplier = multipliers[i];
        const levelWinnings = Math.floor(amount * levelMultiplier);
        let levelStr = '';
        
        // Nivel actual
        if (i === level) {
          // Estilo para nivel actual
          levelStr = `➡️ **Nivel ${i + 1}:** ${levelWinnings} monedas (x${levelMultiplier.toFixed(1)})`;
          
          // Mostrar probabilidad para el siguiente nivel si no es el último
          if (i < totalLevels - 1) {
            levelStr += ` | **${(probabilities[i+1] * 100).toFixed(0)}%** prob.`;
          }
        } 
        // Niveles superiores (no alcanzados)
        else if (i > level) {
          levelStr = `Nivel ${i + 1}: ${levelWinnings} monedas (x${levelMultiplier.toFixed(1)})`;
        }
        // Niveles inferiores (ya superados)
        else {
          levelStr = `✅ Nivel ${i + 1}: ${levelWinnings} monedas (x${levelMultiplier.toFixed(1)})`;
        }
        
        towerLines.push(levelStr);
      }
      
      return towerLines.join('\n');
    };
    
    // Crear botones
    const createGameButtons = (level, showContinue = true) => {
      const row = new ActionRowBuilder();
      
      // Botón para subir (solo si no es el último nivel)
      if (showContinue && level < totalLevels - 1) {
        const riskPercentage = (1 - probabilities[level + 1]) * 100;
        const nextProbText = `SUBIR (Riesgo: ${riskPercentage.toFixed(0)}%)`;
        
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`tower:climb:${profile._id}:${amount}:${difficulty}:${level}`)
            .setLabel(nextProbText)
            .setStyle(riskPercentage < 25 ? ButtonStyle.Success : 
                     riskPercentage < 50 ? ButtonStyle.Primary : 
                     riskPercentage < 75 ? ButtonStyle.Secondary : 
                     ButtonStyle.Danger)
            .setEmoji('⬆️')
        );
      }
      
      // Botón para retirarse (cashout) - siempre disponible
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tower:cashout:${profile._id}:${amount}:${difficulty}:${level}`)
          .setLabel(`RETIRAR ${currentWinnings} MONEDAS`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('💰')
      );
      
      // Mostrar estadísticas
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tower:stats:${profile._id}:${amount}:${difficulty}:${level}`)
          .setLabel('ESTADÍSTICAS')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📊')
      );
      
      return row;
    };
    
    // Calcular ganancias actuales
    const calculateWinnings = (level) => {
      return Math.floor(amount * multipliers[level]);
    };
    
    // Iniciar el juego
    currentWinnings = calculateWinnings(currentLevel);
    
    // Crear mensaje inicial con la torre
    const towerVisual = createTowerVisual(currentLevel);
    const startColor = difficultyColor;
    
    const initialEmbed = new EmbedBuilder()
      .setTitle(`🏰 TORRE DE RIESGO - ${difficulty.toUpperCase()} 🏰`)
      .setDescription(`
**Apuesta inicial:** ${amount} monedas
**Nivel actual:** ${currentLevel + 1}/${totalLevels}
**Ganancias actuales:** ${currentWinnings} monedas

¿Subes al siguiente nivel o te retiras con tus ganancias?`)
      .addFields(
        { name: '📊 Estadísticas', value: `
Niveles totales: ${totalLevels}
Probabilidad inicial: ${(startProbability * 100).toFixed(0)}%
Probabilidad final: ${(endProbability * 100).toFixed(0)}%
Nivel actual: ${currentLevel + 1}
`, inline: true },
        { name: '🏰 La Torre', value: towerVisual, inline: false }
      )
      .setColor(startColor)
      .setFooter({ text: 'Cuanto más subas, mayor será el riesgo pero también la recompensa' });
    
    // Enviar mensaje inicial
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed], components: [createGameButtons(currentLevel)] }) 
      : await context.reply({ embeds: [initialEmbed], components: [createGameButtons(currentLevel)] });
    
    // Crear collector para las interacciones
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'tower' && profileId === profile._id.toString() && 
            (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ filter, time: 180000 });
    
    // Procesar interacciones
    collector.on('collect', async i => {
      const [, action, , , , levelStr] = i.customId.split(':');
      const level = parseInt(levelStr);
      
      if (action === 'stats') {
        // Mostrar estadísticas detalladas
        const statsEmbed = new EmbedBuilder()
          .setTitle('📊 Estadísticas de la Torre')
          .setDescription(`
**Jugador:** ${i.user.tag}
**Dificultad:** ${difficulty}
**Apuesta inicial:** ${amount} monedas
**Nivel actual:** ${currentLevel + 1}/${totalLevels}
**Ganancias actuales:** ${currentWinnings} monedas
**Multiplicador actual:** x${multipliers[currentLevel].toFixed(2)}

**Probabilidad para subir al siguiente nivel:** ${currentLevel < totalLevels - 1 ? 
           `${(probabilities[currentLevel + 1] * 100).toFixed(0)}%` : 'N/A'}
**Riesgo de caída:** ${currentLevel < totalLevels - 1 ? 
           `${((1 - probabilities[currentLevel + 1]) * 100).toFixed(0)}%` : 'N/A'}
           
**Récord personal:** ${profile.stats.wins} victorias / ${profile.stats.losses} derrotas
          `)
          .setColor('#9900ff');
        
        await i.reply({ embeds: [statsEmbed], ephemeral: true });
        return;
      }
      
      // Verificar que el nivel enviado sea correcto para evitar trampas
      if (level !== currentLevel) {
        await i.reply({ 
          content: '❌ Ha ocurrido un error de sincronización. Por favor, inicia un nuevo juego.',
          ephemeral: true
        });
        return;
      }
      
      if (action === 'cashout') {
        gameActive = false;
        
        // Retirar ganancias
        // Actualizar monedas del usuario
        profile.character.currency += currentWinnings;
        
        // Actualizar estadísticas
        profile.stats.wins += 1;
        
        // Actualizar estadísticas de torre si existe en el inventario
        if (profile.character.inventory) {
          // Verificar si tiene un objeto de estadísticas de torre
          let towerStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Torre");
          if (!towerStatsItem) {
            // Si no existe, crearlo
            profile.character.inventory.push({
              item: "Estadísticas de Torre",
              quantity: 1,
              description: "Registro de tus mejores niveles en la Torre de Riesgo"
            });
            towerStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
          }
          
          // Actualizar estadísticas
          if (!towerStatsItem.metadata) {
            towerStatsItem.metadata = { 
              highestLevel: 0,
              totalPlayed: 0,
              totalWins: 0,
              biggestWin: 0,
              difficultyStats: {}
            };
          }
          
          towerStatsItem.metadata.totalPlayed = (towerStatsItem.metadata.totalPlayed || 0) + 1;
          towerStatsItem.metadata.totalWins = (towerStatsItem.metadata.totalWins || 0) + 1;
          
          // Actualizar nivel más alto alcanzado
          if ((currentLevel + 1) > (towerStatsItem.metadata.highestLevel || 0)) {
            towerStatsItem.metadata.highestLevel = currentLevel + 1;
          }
          
          // Actualizar mayor ganancia
          const profit = currentWinnings - amount;
          if (profit > (towerStatsItem.metadata.biggestWin || 0)) {
            towerStatsItem.metadata.biggestWin = profit;
          }
          
          // Actualizar estadísticas por dificultad
          if (!towerStatsItem.metadata.difficultyStats) {
            towerStatsItem.metadata.difficultyStats = {};
          }
          
          if (!towerStatsItem.metadata.difficultyStats[difficulty]) {
            towerStatsItem.metadata.difficultyStats[difficulty] = {
              played: 0,
              wins: 0,
              highestLevel: 0
            };
          }
          
          towerStatsItem.metadata.difficultyStats[difficulty].played = 
            (towerStatsItem.metadata.difficultyStats[difficulty].played || 0) + 1;
          
          towerStatsItem.metadata.difficultyStats[difficulty].wins = 
            (towerStatsItem.metadata.difficultyStats[difficulty].wins || 0) + 1;
          
          if ((currentLevel + 1) > (towerStatsItem.metadata.difficultyStats[difficulty].highestLevel || 0)) {
            towerStatsItem.metadata.difficultyStats[difficulty].highestLevel = currentLevel + 1;
          }
          
          // Actualizar descripción
          towerStatsItem.description = 
            `Estadísticas de Torre: Mayor nivel: ${towerStatsItem.metadata.highestLevel}, ` +
            `Mayor ganancia: ${towerStatsItem.metadata.biggestWin} monedas`;
        }
        
        await profile.save();
        
        // Crear efectos visuales de victoria
        const stars = ['✨', '🌟', '💫', '⭐', '🎖️'];
        const confetti = ['🎉', '🎊', '🥳'];
        const randomStars = Array(3).fill().map(() => stars[Math.floor(Math.random() * stars.length)]).join(' ');
        const randomConfetti = Array(2).fill().map(() => confetti[Math.floor(Math.random() * confetti.length)]).join(' ');
        
        // Calcular ganancias netas
        const profit = currentWinnings - amount;
        
        // Crear embed de victoria
        const winEmbed = new EmbedBuilder()
          .setTitle(`${randomStars} ¡RETIRADA EXITOSA! ${randomStars}`)
          .setDescription(`
${randomConfetti} **¡GANASTE!** ${randomConfetti}

**Apuesta inicial:** ${amount} monedas
**Nivel alcanzado:** ${currentLevel + 1}/${totalLevels}
**Multiplicador:** x${multipliers[currentLevel].toFixed(2)}

${profit > 0 ? `**¡GANANCIA!** +${profit} monedas` : '**Equilibrado** +0 monedas'}
**Total recibido:** ${currentWinnings} monedas
          `)
          .setColor('#00ff00')
          .setFooter({ text: `Dificultad: ${difficulty}` });
        
        // Botones para jugar de nuevo
        const playAgainButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`tower:again:${profile._id}:${amount}:${difficulty}`)
              .setLabel('🔄 JUGAR DE NUEVO')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`tower:double:${profile._id}:${amount}:${difficulty}`)
              .setLabel('💰 DOBLAR APUESTA')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`tower:harder:${profile._id}:${amount}:${difficulty}`)
              .setLabel('⚠️ AUMENTAR DIFICULTAD')
              .setStyle(ButtonStyle.Danger)
          );
        
        await i.update({ embeds: [winEmbed], components: [playAgainButtons] });
        collector.stop('cashout');
        return;
      }
      
      if (action === 'climb') {
        // Intentar subir al siguiente nivel
        const nextLevel = currentLevel + 1;
        
        // Verificar si ya estamos en el último nivel
        if (nextLevel >= totalLevels) {
          await i.reply({
            content: '❌ Ya estás en el nivel máximo.',
            ephemeral: true
          });
          return;
        }
        
        // Calcular si el jugador logra subir o cae
        const success = Math.random() < probabilities[nextLevel];
        
        if (success) {
          // Subir de nivel exitosamente
          currentLevel = nextLevel;
          currentWinnings = calculateWinnings(currentLevel);
          
          // Crear efectos visuales de avance
          const successEmojis = ['🎯', '✅', '⬆️', '🔼', '👑', '🌟'];
          const randomEmoji = successEmojis[Math.floor(Math.random() * successEmojis.length)];
          
          // Actualizar color del embed según el nivel (se vuelve más intenso)
          const levelRatio = currentLevel / (totalLevels - 1);
          const colorIntensity = Math.min(255, Math.floor(levelRatio * 255));
          const levelColor = levelRatio < 0.3 ? difficultyColor : 
                           levelRatio < 0.6 ? '#ffaa00' : // Naranja
                           levelRatio < 0.9 ? '#ff5500' : // Rojo-naranja
                           '#ff0000'; // Rojo intenso para niveles altos
          
          const successEmbed = new EmbedBuilder()
            .setTitle(`${randomEmoji} ¡NIVEL ${currentLevel + 1} ALCANZADO! ${randomEmoji}`)
            .setDescription(`
**Apuesta inicial:** ${amount} monedas
**Nivel actual:** ${currentLevel + 1}/${totalLevels}
**Ganancias actuales:** ${currentWinnings} monedas

¿Seguirás subiendo o te retirarás con tus ganancias?`)
            .addFields(
              { name: '🏰 La Torre', value: createTowerVisual(currentLevel) }
            )
            .setColor(levelColor)
            .setFooter({ text: `Dificultad: ${difficulty} | Cuanto más subas, mayor será el riesgo` });
          
          await i.update({ embeds: [successEmbed], components: [createGameButtons(currentLevel)] });
          return;
        } 
        else {
          // El jugador cae y pierde
          gameActive = false;
          
          // Actualizar estadísticas
          profile.stats.losses += 1;
          
          // Actualizar estadísticas de torre si existe en el inventario
          if (profile.character.inventory) {
            let towerStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Torre");
            if (!towerStatsItem) {
              profile.character.inventory.push({
                item: "Estadísticas de Torre",
                quantity: 1,
                description: "Registro de tus mejores niveles en la Torre de Riesgo"
              });
              towerStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
            }
            
            if (!towerStatsItem.metadata) {
              towerStatsItem.metadata = { 
                highestLevel: 0,
                totalPlayed: 0,
                totalWins: 0,
                biggestWin: 0,
                difficultyStats: {}
              };
            }
            
            towerStatsItem.metadata.totalPlayed = (towerStatsItem.metadata.totalPlayed || 0) + 1;
            
            // Actualizar estadísticas por dificultad
            if (!towerStatsItem.metadata.difficultyStats) {
              towerStatsItem.metadata.difficultyStats = {};
            }
            
            if (!towerStatsItem.metadata.difficultyStats[difficulty]) {
              towerStatsItem.metadata.difficultyStats[difficulty] = {
                played: 0,
                wins: 0,
                highestLevel: 0
              };
            }
            
            towerStatsItem.metadata.difficultyStats[difficulty].played = 
              (towerStatsItem.metadata.difficultyStats[difficulty].played || 0) + 1;
          }
          
          await profile.save();
          
          // Crear efectos visuales de caída
          const failEmojis = ['💥', '💣', '🔥', '⚡', '☠️', '😱'];
          const randomFail = Array(3).fill().map(() => failEmojis[Math.floor(Math.random() * failEmojis.length)]).join(' ');
          
          const failEmbed = new EmbedBuilder()
            .setTitle(`${randomFail} ¡HAS CAÍDO! ${randomFail}`)
            .setDescription(`
**Apuesta inicial:** ${amount} monedas
**Nivel alcanzado:** ${currentLevel + 1}/${totalLevels}
**Intentaste subir al nivel:** ${nextLevel + 1}

**¡PERDISTE!** -${amount} monedas
            `)
            .setColor('#ff0000')
            .setFooter({ text: `Dificultad: ${difficulty}` });
          
          // Botones para jugar de nuevo
          const playAgainButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`tower:again:${profile._id}:${amount}:${difficulty}`)
                .setLabel('🔄 JUGAR DE NUEVO')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`tower:double:${profile._id}:${amount}:${difficulty}`)
                .setLabel('💰 DOBLAR APUESTA')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId(`tower:easier:${profile._id}:${amount}:${difficulty}`)
                .setLabel('⬇️ REDUCIR DIFICULTAD')
                .setStyle(ButtonStyle.Secondary)
            );
          
          await i.update({ embeds: [failEmbed], components: [playAgainButtons] });
          collector.stop('fell');
          return;
        }
      }
      
      // Botones para jugar nuevamente
      if (action === 'again' || action === 'double' || action === 'harder' || action === 'easier') {
        // Determinar nueva configuración
        let newAmount = amount;
        let newDifficulty = difficulty;
        
        if (action === 'double') {
          newAmount = amount * 2;
        }
        
        if (action === 'harder') {
          // Subir un nivel de dificultad
          const difficulties = ['novato', 'aventurero', 'temerario', 'legendario'];
          const currentIndex = difficulties.indexOf(difficulty);
          if (currentIndex < difficulties.length - 1) {
            newDifficulty = difficulties[currentIndex + 1];
          }
        }
        
        if (action === 'easier') {
          // Bajar un nivel de dificultad
          const difficulties = ['novato', 'aventurero', 'temerario', 'legendario'];
          const currentIndex = difficulties.indexOf(difficulty);
          if (currentIndex > 0) {
            newDifficulty = difficulties[currentIndex - 1];
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
          content: `🏰 **TORRE DE RIESGO** - Nueva apuesta: ${newAmount} monedas en modo ${newDifficulty}`,
          embeds: [], 
          components: [] 
        });
        
        this.playRiskTower(context, newAmount, newDifficulty, updatedProfile);
        return;
      }
    });
    
    // Si se acaba el tiempo del collector
    collector.on('end', async (collected, reason) => {
      if (gameActive && reason !== 'cashout' && reason !== 'fell') {
        // Si el juego sigue activo y no terminó por una acción del usuario, considerarlo como cashout automático
        gameActive = false;
        
        // El jugador se retira automáticamente con las ganancias actuales
        profile.character.currency += currentWinnings;
        profile.stats.wins += 1;
        await profile.save();
        
        const timeoutEmbed = new EmbedBuilder()
          .setTitle('⏰ TIEMPO AGOTADO ⏰')
          .setDescription(`
Se acabó el tiempo para tomar una decisión.

**Te retiras automáticamente con:** ${currentWinnings} monedas
**Nivel alcanzado:** ${currentLevel + 1}/${totalLevels}
          `)
          .setColor('#ff9900')
          .setFooter({ text: `Dificultad: ${difficulty}` });
        
        const timeoutButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`tower:again:${profile._id}:${amount}:${difficulty}`)
              .setLabel('🔄 JUGAR DE NUEVO')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`tower:disabled:${profile._id}`)
              .setLabel('⏰ TIEMPO AGOTADO')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
        
        try {
          await gameMessage.edit({ embeds: [timeoutEmbed], components: [timeoutButtons] });
        } catch (err) {
          // Ignorar errores al editar mensajes antiguos
        }
      }
    });
  }
};