const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'crash',
  aliases: ['cr'],
  description: 'Juega al crash y multiplica tus monedas',
  category: 'casino',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Juega al crash y multiplica tus monedas')
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
          { name: 'Fácil (10% crash, max 10x)', value: 'facil' },
          { name: 'Medio (15% crash, max 20x)', value: 'medio' },
          { name: 'Difícil (20% crash, max 30x)', value: 'dificil' },
          { name: 'Experto (25% crash, max 50x)', value: 'experto' }
        )),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    if (!args[0]) {
      // Si no hay argumentos, mostrar modal para seleccionar dificultad y cantidad
      const difficultyButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`crash:setup:facil:${message.author.id}`)
            .setLabel('FÁCIL')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🟢'),
          new ButtonBuilder()
            .setCustomId(`crash:setup:medio:${message.author.id}`)
            .setLabel('MEDIO')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔵'),
          new ButtonBuilder()
            .setCustomId(`crash:setup:dificil:${message.author.id}`)
            .setLabel('DIFÍCIL')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔴'),
          new ButtonBuilder()
            .setCustomId(`crash:setup:experto:${message.author.id}`)
            .setLabel('EXPERTO')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚫'),
        );
      
      const embed = new EmbedBuilder()
        .setTitle('🚀 CRASH - Configuración 🚀')
        .setDescription('Selecciona la dificultad para tu juego de Crash')
        .addFields(
          { name: '🟢 Fácil', value: '10% probabilidad de crash, máximo 10x', inline: true },
          { name: '🔵 Medio', value: '15% probabilidad de crash, máximo 20x', inline: true },
          { name: '🔴 Difícil', value: '20% probabilidad de crash, máximo 30x', inline: true },
          { name: '⚫ Experto', value: '25% probabilidad de crash, máximo 50x', inline: true }
        )
        .setColor('#0099ff')
        .setFooter({ text: 'Selecciona la dificultad para continuar y luego ingresa tu apuesta' });
      
      return message.reply({ embeds: [embed], components: [difficultyButtons] });
    }
    
    // Si hay argumentos, proceder como antes
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 10) {
      return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 10.');
    }
    
    // Determinar dificultad
    const availableDifficulties = ['facil', 'medio', 'dificil', 'experto'];
    let difficulty = args[1]?.toLowerCase() || 'medio';
    
    if (!availableDifficulties.includes(difficulty)) {
      difficulty = 'medio';
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
    this.startCrashGame(message, amount, difficulty, profile);
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
    await interaction.reply(`🚀 **CRASH** - Apostando ${amount} monedas en modo ${difficulty}`);
    this.startCrashGame(interaction, amount, difficulty, profile);
  },
  
  // Método para iniciar el juego de crash
  async startCrashGame(context, amount, difficulty, profile) {
    // Configurar parámetros según dificultad
    let crashProbability, maxMultiplier, difficultyColor;
    switch(difficulty) {
      case 'facil':
        crashProbability = 0.10;
        maxMultiplier = 10;
        difficultyColor = '#00cc44'; // Verde
        break;
      case 'dificil':
        crashProbability = 0.20;
        maxMultiplier = 30;
        difficultyColor = '#cc0000'; // Rojo
        break;
      case 'experto':
        crashProbability = 0.25;
        maxMultiplier = 50;
        difficultyColor = '#333333'; // Casi negro
        break;
      default: // medio
        crashProbability = 0.15;
        maxMultiplier = 20;
        difficultyColor = '#0099ff'; // Azul
    }

    // Crear mensaje inicial con gráfico visual
    const createCrashEmbed = (multiplier, isActive = true) => {
      // Crear barra de progreso visual
      const maxBars = 20;
      const filledBars = Math.min(maxBars, Math.floor((multiplier / maxMultiplier) * maxBars));
      const progressBar = '█'.repeat(filledBars) + '░'.repeat(maxBars - filledBars);
      
      // El color se va intensificando con el multiplicador
      const colorIntensity = Math.min(255, Math.floor((multiplier / maxMultiplier) * 255));
      const embedColor = multiplier < 2 ? difficultyColor : `#${colorIntensity.toString(16).padStart(2, '0')}${(255-colorIntensity).toString(16).padStart(2, '0')}00`;
      
      const potentialWin = Math.floor(amount * multiplier);
      
      return new EmbedBuilder()
        .setTitle(`🚀 CRASH ${multiplier >= maxMultiplier/2 ? '🔥' : ''} ${multiplier >= maxMultiplier*0.8 ? '💥' : ''}`)
        .setDescription(`
**Apostando:** ${amount} monedas
**Dificultad:** ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
**Multiplicador actual: ${multiplier.toFixed(2)}x**

${progressBar} ${(multiplier/maxMultiplier*100).toFixed(0)}%

**Ganancia potencial:** ${potentialWin} monedas
        `)
        .setColor(embedColor)
        .setFooter({ 
          text: isActive ? 
            `Presiona RETIRAR para obtener tus ganancias ahora! | Max: ${maxMultiplier}x` : 
            `Juego finalizado | Max: ${maxMultiplier}x` 
        });
    };

    // Botones del juego
    const gameButtons = (isActive = true) => {
      return new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`crash:cashout:${profile._id}:${amount}`)
            .setLabel('💰 RETIRAR AHORA')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!isActive),
          new ButtonBuilder()
            .setCustomId(`crash:view:${profile._id}:${amount}`)
            .setLabel('📊 ESTADÍSTICAS')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!isActive)
        );
    };

    // Enviar mensaje inicial
    const gameMessage = context.replied ? await context.followUp({ embeds: [createCrashEmbed(1.0)], components: [gameButtons()] }) : await context.reply({ embeds: [createCrashEmbed(1.0)], components: [gameButtons()] });
    
    // Variables del juego
    let multiplier = 1.0;
    let crashed = false;
    let gameActive = true;
    let lastUpdate = Date.now();
    let updateCount = 0;
    
    // Crear un collector para los botones
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'crash' && profileId === profile._id.toString() && (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ filter, time: 60000 });
    
    collector.on('collect', async i => {
      const [, action] = i.customId.split(':');
      
      if (action === 'view') {
        // Mostrar estadísticas en un mensaje efímero
        const statsEmbed = new EmbedBuilder()
          .setTitle('📊 Estadísticas de Crash')
          .setDescription(`
**Jugador:** ${i.user.tag}
**Apuesta:** ${amount} monedas
**Multiplicador actual:** ${multiplier.toFixed(2)}x
**Probabilidad de crash:** ${(crashProbability * 100).toFixed(0)}%
**Multiplicador máximo:** ${maxMultiplier}x
**Ganancia potencial:** ${Math.floor(amount * multiplier)} monedas
**Récord personal:** ${profile.stats.wins} victorias / ${profile.stats.losses} derrotas
          `)
          .setColor('#9900ff');
        
        await i.reply({ embeds: [statsEmbed], ephemeral: true });
        return;
      }
      
      if (action === 'cashout') {
        gameActive = false;
        
        // Efectos visuales de victoria
        const sparkles = ['✨', '🌟', '💫', '⭐'];
        const randomSparkles = Array(5).fill().map(() => sparkles[Math.floor(Math.random() * sparkles.length)]).join('');
        
        // Calcular ganancias
        const winnings = Math.floor(amount * multiplier);
        const profit = winnings - amount;
        
        // Actualizar monedas del usuario
        profile.character.currency += winnings;
        
        // Actualizar estadísticas
        profile.stats.wins += 1;
        if (profile.character.inventory) {
            // Verificar si tiene un objeto de estadísticas de crash
            let crashStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Crash");
            if (!crashStatsItem) {
                // Si no existe, crearlo
                profile.character.inventory.push({
                    item: "Estadísticas de Crash",
                    quantity: 1,
                    description: "Registro de tus mejores multiplicadores en Crash"
                });
                crashStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
            }
            
            // Actualizar descripción con nuevo récord si aplica
            if (!crashStatsItem.metadata) crashStatsItem.metadata = { highestMultiplier: 0 };
            if (multiplier > crashStatsItem.metadata.highestMultiplier) {
                crashStatsItem.metadata.highestMultiplier = parseFloat(multiplier.toFixed(2));
                crashStatsItem.description = `Registro de tus mejores multiplicadores en Crash. Récord: ${crashStatsItem.metadata.highestMultiplier}x`;
            }
        }
        
        await profile.save();
        
        // Actualizar mensaje con animación de victoria
        const winEmbed = new EmbedBuilder()
          .setTitle(`${randomSparkles} ¡RETIRADO CON ÉXITO! ${randomSparkles}`)
          .setDescription(`
**Apostaste:** ${amount} monedas
**Retiraste con:** ${multiplier.toFixed(2)}x

${profit > 0 ? `**¡GANANCIA!** +${profit} monedas` : '**Equilibrado** +0 monedas'}
**Total recibido:** ${winnings} monedas
          `)
          .setColor('#00ff00')
          .setImage('https://i.imgur.com/JmUTqCx.gif'); // URL de una imagen/GIF de celebración
        
        const resultButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`crash:again:${profile._id}:${amount}`)
              .setLabel('🔄 JUGAR DE NUEVO')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`crash:double:${profile._id}:${amount}`)
              .setLabel('💰 DOBLAR APUESTA')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`crash:half:${profile._id}:${amount}`)
              .setLabel('➗ MITAD DE APUESTA')
              .setStyle(ButtonStyle.Secondary)
          );
        
        await i.update({ embeds: [winEmbed], components: [resultButtons] });
        return;
      }
      
      // Botones para jugar nuevamente
      if (action === 'again' || action === 'double' || action === 'half') {
        // Determinar nueva cantidad
        let newAmount = amount;
        if (action === 'double') newAmount = amount * 2;
        if (action === 'half') newAmount = Math.max(10, Math.floor(amount / 2));
        
        // Verificar si tiene suficientes monedas
        const updatedProfile = await Profile.findById(profile._id);
        
        if (updatedProfile.character.currency < newAmount) {
          await i.reply({ content: `❌ No tienes suficientes monedas para apostar ${newAmount}. Tienes ${updatedProfile.character.currency} monedas.`, ephemeral: true });
          return;
        }
        
        // Restar las monedas de la apuesta
        updatedProfile.character.currency -= newAmount;
        await updatedProfile.save();
        
        // Iniciar nuevo juego
        await i.update({ content: `🚀 **CRASH** - Nueva apuesta: ${newAmount} monedas en modo ${difficulty}`, embeds: [], components: [] });
        
        this.startCrashGame(context, newAmount, difficulty, updatedProfile);
        return;
      }
    });
    
    // Función que simula el juego
    const updateGame = async () => {
      if (!gameActive) return;
      
      // Verificar si ocurre un crash
      const shouldCrash = Math.random() < crashProbability || multiplier >= maxMultiplier;
      
      if (shouldCrash) {
        gameActive = false;
        crashed = true;
        
        // Efectos visuales de crash
        const boom = ['💥', '💣', '🔥', '⚡', '☠️'];
        const randomBoom = Array(3).fill().map(() => boom[Math.floor(Math.random() * boom.length)]).join(' ');
        
        const crashEmbed = new EmbedBuilder()
          .setTitle(`${randomBoom} ¡CRASH! ${randomBoom}`)
          .setDescription(`
**Apostaste:** ${amount} monedas
**Crash en:** ${multiplier.toFixed(2)}x

**¡PERDISTE!** -${amount} monedas
          `)
          .setColor('#ff0000')
          .setImage('https://i.imgur.com/JTgvYcx.gif'); // URL de una imagen/GIF de crash
        
        // Botones para jugar nuevamente después del crash
        const resultButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`crash:again:${profile._id}:${amount}`)
              .setLabel('🔄 JUGAR DE NUEVO')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`crash:double:${profile._id}:${amount}`)
              .setLabel('💰 DOBLAR APUESTA')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`crash:half:${profile._id}:${amount}`)
              .setLabel('➗ MITAD DE APUESTA')
              .setStyle(ButtonStyle.Secondary)
          );
        
        await gameMessage.edit({ embeds: [crashEmbed], components: [resultButtons] });
        collector.stop('crashed');
        
        // Actualizar estadísticas
        profile.stats.losses += 1;
        await profile.save();
        
        return;
      }
      
      // Incrementar multiplicador
      const currentTime = Date.now();
      const timeElapsed = currentTime - lastUpdate;
      
      // El multiplicador aumenta más rápido a medida que el juego progresa
      const growthFactor = 1.0 + (multiplier / maxMultiplier); // Crece más rápido al acercarse al máximo
      const multiplierIncrement = 0.05 * growthFactor * (timeElapsed / 500);
      
      multiplier += multiplierIncrement;
      lastUpdate = currentTime;
      updateCount++;
      
      // Actualizar mensaje solo cada cierto número de iteraciones para evitar rate limits
      if (updateCount % 3 === 0 || multiplier >= 2) {
        await gameMessage.edit({ embeds: [createCrashEmbed(multiplier)], components: [gameButtons()] });
      }
      
      // Siguiente actualización
      if (gameActive) {
        // El tiempo entre actualizaciones disminuye a medida que el multiplicador aumenta
        // para crear tensión y dificultad creciente
        const updateDelay = Math.max(200, 1000 - (multiplier * 50));
        setTimeout(updateGame, updateDelay);
      }
    };
    
    // Iniciar loop del juego
    setTimeout(updateGame, 1000);
    
    // Si se acaba el tiempo del collector
    collector.on('end', async (collected, reason) => {
      if (gameActive) {
        gameActive = false;
        
        if (!crashed) {
          // Devolver la apuesta si no hubo interacción y no crasheó
          profile.character.currency += amount;
          await profile.save();
          
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ TIEMPO AGOTADO ⏰')
            .setDescription(`
**No tomaste una decisión a tiempo.**
Tu apuesta de ${amount} monedas ha sido devuelta.
            `)
            .setColor('#ff9900');
          
          await gameMessage.edit({ embeds: [timeoutEmbed], components: [] });
        }
      }
    });
  }
};