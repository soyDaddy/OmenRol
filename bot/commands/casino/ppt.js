const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'ppt',
  aliases: ['rps', 'piedrapapeltijera'],
  description: 'Juega a piedra, papel o tijera contra la CPU o contra otro jugador',
  category: 'casino',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('ppt')
    .setDescription('Juega a piedra, papel o tijera contra la CPU o contra otro jugador')
    .addIntegerOption(option => 
      option.setName('apuesta')
        .setDescription('Cantidad de monedas para apostar')
        .setRequired(true)
        .setMinValue(10))
    .addStringOption(option =>
      option.setName('modo')
        .setDescription('Modo de juego')
        .setRequired(true)
        .addChoices(
          { name: '🤖 VS CPU', value: 'cpu' },
          { name: '👥 VS Jugador', value: 'jugador' }
        ))
    .addIntegerOption(option => 
      option.setName('rondas')
        .setDescription('Número de rondas (1, 3 o 5)')
        .setRequired(false)
        .addChoices(
          { name: '1 ronda', value: 1 },
          { name: '3 rondas', value: 3 },
          { name: '5 rondas', value: 5 }
        )),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    if (!args[0]) {
      return message.reply('❌ Debes especificar una cantidad de monedas para apostar.');
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 10) {
      return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 10 monedas.');
    }
    
    // Determinar modo
    const mode = args[1]?.toLowerCase() || 'cpu';
    if (!['cpu', 'jugador'].includes(mode)) {
      return message.reply('❌ El modo debe ser "cpu" o "jugador".');
    }
    
    // Determinar rondas
    const availableRounds = [1, 3, 5];
    let rounds = parseInt(args[2]) || 3;
    
    if (!availableRounds.includes(rounds)) {
      rounds = 3; // Valor por defecto
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
    
    if (mode === 'cpu') {
      // Restar las monedas de la apuesta
      profile.character.currency -= amount;
      await profile.save();
      
      // Iniciar el juego contra la CPU
      this.startCpuGame(message, amount, rounds, profile);
    } else {
      // Modo contra jugador: mostrar menú para seleccionar oponente
      const selectUserMenu = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`ppt:select:${message.author.id}:${amount}:${rounds}`)
            .setPlaceholder('Selecciona a tu oponente')
            .setMaxValues(1)
        );
      
      const selectEmbed = new EmbedBuilder()
        .setTitle('🎮 PIEDRA, PAPEL O TIJERA - SELECCIÓN DE OPONENTE')
        .setDescription(`
${message.author} quiere desafiar a alguien a una partida de Piedra, Papel o Tijera.

**Apuesta:** ${amount} monedas
**Rondas:** ${rounds}
        `)
        .setColor('#0099ff')
        .setFooter({ text: 'El oponente debe aceptar el desafío y tener suficientes monedas' });
      
      const selectMsg = await message.reply({ embeds: [selectEmbed], components: [selectUserMenu] });
      
      // Crear collector para la selección de usuario
      const filter = i => {
        const [command, action, userId] = i.customId.split(':');
        return command === 'ppt' && action === 'select' && i.user.id === message.author.id;
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
          await i.reply({ content: '❌ No puedes desafiar a un bot. Usa el modo CPU para eso.', ephemeral: true });
          return;
        }
        
        // Verificar que el oponente tiene perfil
        const targetProfile = await Profile.findOne({
          userId: targetUserId,
          serverId: message.guild.id
        });
        
        if (!targetProfile) {
          await i.reply({ content: `❌ ${targetUser.tag} no tiene un perfil en este servidor.`, ephemeral: true });
          return;
        }
        
        // Verificar que el oponente tiene suficientes monedas
        if (targetProfile.character.currency < amount) {
          await i.reply({ content: `❌ ${targetUser.tag} no tiene suficientes monedas para la apuesta. Tiene ${targetProfile.character.currency} monedas.`, ephemeral: true });
          return;
        }
        
        // Enviar solicitud de desafío
        const challengeButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ppt:accept:${message.author.id}:${targetUserId}:${amount}:${rounds}`)
              .setLabel('ACEPTAR DESAFÍO')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`ppt:decline:${message.author.id}:${targetUserId}:${amount}:${rounds}`)
              .setLabel('RECHAZAR')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
        
        const challengeEmbed = new EmbedBuilder()
          .setTitle('🎮 DESAFÍO DE PIEDRA, PAPEL O TIJERA')
          .setDescription(`
${message.author} te desafía a una partida de Piedra, Papel o Tijera, ${targetUser}!

**Apuesta:** ${amount} monedas
**Rondas:** ${rounds}

¿Aceptas el desafío?
          `)
          .setColor('#0099ff')
          .setFooter({ text: 'El desafío expira en 60 segundos' });
        
        await i.update({ embeds: [challengeEmbed], components: [challengeButtons] });
        
        // Crear collector para la respuesta al desafío
        const challengeFilter = j => {
          const [command, action, challengerId, targetId] = j.customId.split(':');
          return command === 'ppt' && ['accept', 'decline'].includes(action) && targetId === targetUserId && j.user.id === targetUserId;
        };
        
        const challengeCollector = selectMsg.createMessageComponentCollector({ filter: challengeFilter, time: 60000 });
        
        challengeCollector.on('collect', async j => {
          const [, action] = j.customId.split(':');
          
          if (action === 'decline') {
            // Desafío rechazado
            const declineEmbed = new EmbedBuilder()
              .setTitle('❌ DESAFÍO RECHAZADO')
              .setDescription(`
${targetUser} ha rechazado el desafío de ${message.author}.

No se ha realizado ninguna apuesta.
              `)
              .setColor('#ff0000');
            
            await j.update({ embeds: [declineEmbed], components: [] });
            return;
          }
          
          if (action === 'accept') {
            // Verificar de nuevo si ambos tienen suficientes monedas
            const updatedProfile = await Profile.findOne({
              userId: message.author.id,
              serverId: message.guild.id
            });
            
            const updatedTargetProfile = await Profile.findOne({
              userId: targetUserId,
              serverId: message.guild.id
            });
            
            if (updatedProfile.character.currency < amount) {
              await j.reply({ content: `❌ ${message.author.tag} ya no tiene suficientes monedas para la apuesta.`, ephemeral: true });
              return;
            }
            
            if (updatedTargetProfile.character.currency < amount) {
              await j.reply({ content: `❌ Ya no tienes suficientes monedas para la apuesta.`, ephemeral: true });
              return;
            }
            
            // Restar las monedas de la apuesta a ambos jugadores
            updatedProfile.character.currency -= amount;
            updatedTargetProfile.character.currency -= amount;
            
            await updatedProfile.save();
            await updatedTargetProfile.save();
            
            // Iniciar el juego entre jugadores
            await j.update({ content: '🎮 ¡El desafío ha sido aceptado! La partida está comenzando...', embeds: [], components: [] });
            this.startPlayerVsPlayerGame(message, targetUser, amount, rounds, updatedProfile, updatedTargetProfile);
          }
        });
        
        challengeCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            // Tiempo expirado sin respuesta
            const expiredEmbed = new EmbedBuilder()
              .setTitle('⏰ DESAFÍO EXPIRADO')
              .setDescription(`
${targetUser} no respondió al desafío de ${message.author} a tiempo.

No se ha realizado ninguna apuesta.
              `)
              .setColor('#999999');
            
            await selectMsg.edit({ embeds: [expiredEmbed], components: [] });
          }
        });
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
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const amount = interaction.options.getInteger('apuesta');
    const mode = interaction.options.getString('modo');
    const rounds = interaction.options.getInteger('rondas') || 3;
    
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
    
    if (mode === 'cpu') {
      // Restar las monedas de la apuesta
      profile.character.currency -= amount;
      await profile.save();
      
      // Iniciar el juego contra la CPU
      await interaction.reply(`🎮 **PIEDRA, PAPEL O TIJERA VS CPU** - Apostando ${amount} monedas en ${rounds} rondas`);
      this.startCpuGame(interaction, amount, rounds, profile);
    } else {
      // Modo contra jugador: mostrar menú para seleccionar oponente
      const selectUserMenu = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`ppt:select:${interaction.user.id}:${amount}:${rounds}`)
            .setPlaceholder('Selecciona a tu oponente')
            .setMaxValues(1)
        );
      
      const selectEmbed = new EmbedBuilder()
        .setTitle('🎮 PIEDRA, PAPEL O TIJERA - SELECCIÓN DE OPONENTE')
        .setDescription(`
${interaction.user} quiere desafiar a alguien a una partida de Piedra, Papel o Tijera.

**Apuesta:** ${amount} monedas
**Rondas:** ${rounds}
        `)
        .setColor('#0099ff')
        .setFooter({ text: 'El oponente debe aceptar el desafío y tener suficientes monedas' });
      
      await interaction.reply({ embeds: [selectEmbed], components: [selectUserMenu] });
      
      // Crear collector para la selección de usuario
      const filter = i => {
        const [command, action, userId] = i.customId.split(':');
        return command === 'ppt' && action === 'select' && i.user.id === interaction.user.id;
      };
      
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });
      
      collector.on('collect', async i => {
        const targetUserId = i.values[0];
        const targetUser = await client.users.fetch(targetUserId);
        
        // Verificar que no está desafiando a sí mismo o a un bot
        if (targetUserId === interaction.user.id) {
          await i.reply({ content: '❌ No puedes desafiarte a ti mismo.', ephemeral: true });
          return;
        }
        
        if (targetUser.bot) {
          await i.reply({ content: '❌ No puedes desafiar a un bot. Usa el modo CPU para eso.', ephemeral: true });
          return;
        }
        
        // Verificar que el oponente tiene perfil
        const targetProfile = await Profile.findOne({
          userId: targetUserId,
          serverId: interaction.guild.id
        });
        
        if (!targetProfile) {
          await i.reply({ content: `❌ ${targetUser.tag} no tiene un perfil en este servidor.`, ephemeral: true });
          return;
        }
        
        // Verificar que el oponente tiene suficientes monedas
        if (targetProfile.character.currency < amount) {
          await i.reply({ content: `❌ ${targetUser.tag} no tiene suficientes monedas para la apuesta. Tiene ${targetProfile.character.currency} monedas.`, ephemeral: true });
          return;
        }
        
        // Enviar solicitud de desafío
        const challengeButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ppt:accept:${interaction.user.id}:${targetUserId}:${amount}:${rounds}`)
              .setLabel('ACEPTAR DESAFÍO')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`ppt:decline:${interaction.user.id}:${targetUserId}:${amount}:${rounds}`)
              .setLabel('RECHAZAR')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
        
        const challengeEmbed = new EmbedBuilder()
          .setTitle('🎮 DESAFÍO DE PIEDRA, PAPEL O TIJERA')
          .setDescription(`
${interaction.user} te desafía a una partida de Piedra, Papel o Tijera, ${targetUser}!

**Apuesta:** ${amount} monedas
**Rondas:** ${rounds}

¿Aceptas el desafío?
          `)
          .setColor('#0099ff')
          .setFooter({ text: 'El desafío expira en 60 segundos' });
        
        await i.update({ embeds: [challengeEmbed], components: [challengeButtons] });
        
        // Crear collector para la respuesta al desafío
        const challengeFilter = j => {
          const [command, action, challengerId, targetId] = j.customId.split(':');
          return command === 'ppt' && ['accept', 'decline'].includes(action) && targetId === targetUserId && j.user.id === targetUserId;
        };
        
        const challengeCollector = interaction.channel.createMessageComponentCollector({ filter: challengeFilter, time: 60000 });
        
        challengeCollector.on('collect', async j => {
          const [, action] = j.customId.split(':');
          
          if (action === 'decline') {
            // Desafío rechazado
            const declineEmbed = new EmbedBuilder()
              .setTitle('❌ DESAFÍO RECHAZADO')
              .setDescription(`
${targetUser} ha rechazado el desafío de ${interaction.user}.

No se ha realizado ninguna apuesta.
              `)
              .setColor('#ff0000');
            
            await j.update({ embeds: [declineEmbed], components: [] });
            return;
          }
          
          if (action === 'accept') {
            // Verificar de nuevo si ambos tienen suficientes monedas
            const updatedProfile = await Profile.findOne({
              userId: interaction.user.id,
              serverId: interaction.guild.id
            });
            
            const updatedTargetProfile = await Profile.findOne({
              userId: targetUserId,
              serverId: interaction.guild.id
            });
            
            if (updatedProfile.character.currency < amount) {
              await j.reply({ content: `❌ ${interaction.user.tag} ya no tiene suficientes monedas para la apuesta.`, ephemeral: true });
              return;
            }
            
            if (updatedTargetProfile.character.currency < amount) {
              await j.reply({ content: `❌ Ya no tienes suficientes monedas para la apuesta.`, ephemeral: true });
              return;
            }
            
            // Restar las monedas de la apuesta a ambos jugadores
            updatedProfile.character.currency -= amount;
            updatedTargetProfile.character.currency -= amount;
            
            await updatedProfile.save();
            await updatedTargetProfile.save();
            
            // Iniciar el juego entre jugadores
            await j.update({ content: '🎮 ¡El desafío ha sido aceptado! La partida está comenzando...', embeds: [], components: [] });
            this.startPlayerVsPlayerGame(interaction, targetUser, amount, rounds, updatedProfile, updatedTargetProfile);
          }
        });
        
        challengeCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            // Tiempo expirado sin respuesta
            const expiredEmbed = new EmbedBuilder()
              .setTitle('⏰ DESAFÍO EXPIRADO')
              .setDescription(`
${targetUser} no respondió al desafío de ${interaction.user} a tiempo.

No se ha realizado ninguna apuesta.
              `)
              .setColor('#999999');
            
            await interaction.editReply({ embeds: [expiredEmbed], components: [] });
          }
        });
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
    }
  },
  
  // Método para jugar contra la CPU
  async startCpuGame(context, amount, rounds, profile) {
    // Estado del juego
    let playerScore = 0;
    let cpuScore = 0;
    let currentRound = 1;
    let gameActive = true;
    
    // Opciones de juego
    const options = ['piedra', 'papel', 'tijera'];
    const emojis = {
      'piedra': '🪨',
      'papel': '📄',
      'tijera': '✂️'
    };
    
    // Para determinar el ganador de una ronda
    const winningCombinations = {
      'piedra': 'tijera',
      'papel': 'piedra',
      'tijera': 'papel'
    };
    
    // Crear botones para seleccionar la jugada
    const createPlayButtons = () => {
      return new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`pptcpu:piedra:${profile._id}:${amount}:${rounds}`)
            .setLabel('PIEDRA')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🪨'),
          new ButtonBuilder()
            .setCustomId(`pptcpu:papel:${profile._id}:${amount}:${rounds}`)
            .setLabel('PAPEL')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📄'),
          new ButtonBuilder()
            .setCustomId(`pptcpu:tijera:${profile._id}:${amount}:${rounds}`)
            .setLabel('TIJERA')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('✂️')
        );
    };
    
    // Enviar mensaje inicial
    const initialEmbed = new EmbedBuilder()
      .setTitle('🎮 PIEDRA, PAPEL O TIJERA VS CPU 🤖')
      .setDescription(`
¡Bienvenido al juego de Piedra, Papel o Tijera!

**Apuesta:** ${amount} monedas
**Rondas:** ${rounds}
**Marcador actual:** Tú 0 - 0 CPU

Ronda 1/${rounds}: Elige tu jugada!
      `)
      .setColor('#0099ff')
      .setFooter({ text: 'Elige piedra, papel o tijera para comenzar' });
    
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed], components: [createPlayButtons()] }) 
      : await context.reply({ embeds: [initialEmbed], components: [createPlayButtons()] });
    
    // Crear collector para las interacciones
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'pptcpu' && options.includes(action) && profileId === profile._id.toString() && (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ filter, time: 180000 });
    
    // Función para determinar el ganador de una ronda
    const determineRoundWinner = (playerChoice, cpuChoice) => {
      if (playerChoice === cpuChoice) {
        return 'empate';
      } else if (winningCombinations[playerChoice] === cpuChoice) {
        return 'jugador';
      } else {
        return 'cpu';
      }
    };
    
    // Procesar interacciones
    collector.on('collect', async i => {
      if (!gameActive) {
        // Si el juego ya terminó, procesar solo botones de "jugar de nuevo"
        if (i.customId.startsWith('pptcpu:again:')) {
          // Iniciar nuevo juego
          await i.update({ content: `🎮 **PIEDRA, PAPEL O TIJERA VS CPU** - Nueva partida con ${amount} monedas`, embeds: [], components: [] });
          
          // Verificar si tiene suficientes monedas
          const updatedProfile = await Profile.findById(profile._id);
          
          if (updatedProfile.character.currency < amount) {
            await i.followUp({ content: `❌ No tienes suficientes monedas para apostar ${amount}. Tienes ${updatedProfile.character.currency} monedas.` });
            return;
          }
          
          // Restar las monedas de la apuesta
          updatedProfile.character.currency -= amount;
          await updatedProfile.save();
          
          this.startCpuGame(context, amount, rounds, updatedProfile);
        }
        
        return;
      }
      
      // Obtener la elección del jugador
      const playerChoice = i.customId.split(':')[1];
      
      // La CPU hace su elección
      const cpuChoice = options[Math.floor(Math.random() * options.length)];
      
      // Mostrar las elecciones
      const choicesEmbed = new EmbedBuilder()
        .setTitle(`Ronda ${currentRound}/${rounds}`)
        .setDescription(`
**Tú elegiste:** ${emojis[playerChoice]} ${playerChoice.toUpperCase()}
**La CPU eligió:** ${emojis[cpuChoice]} ${cpuChoice.toUpperCase()}

Calculando resultado...
        `)
        .setColor('#0099ff');
      
      await i.update({ embeds: [choicesEmbed], components: [] });
      
      // Esperar un momento para dar dramatismo
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Determinar el ganador de la ronda
      const roundWinner = determineRoundWinner(playerChoice, cpuChoice);
      
      // Actualizar marcador
      if (roundWinner === 'jugador') {
        playerScore++;
      } else if (roundWinner === 'cpu') {
        cpuScore++;
      }
      
      // Mensajes según el resultado
      let resultMessage;
      let resultColor;
      
      if (roundWinner === 'empate') {
        resultMessage = '¡Empate! Ambos eligieron lo mismo.';
        resultColor = '#ffaa00';
      } else if (roundWinner === 'jugador') {
        resultMessage = `¡Ganaste! ${playerChoice.toUpperCase()} gana a ${cpuChoice.toUpperCase()}.`;
        resultColor = '#00cc44';
      } else {
        resultMessage = `¡Perdiste! ${cpuChoice.toUpperCase()} gana a ${playerChoice.toUpperCase()}.`;
        resultColor = '#ff0000';
      }
      
      // Verificar si el juego ha terminado
      const maxRounds = Math.ceil(rounds / 2); // Número de rondas necesarias para ganar
      const gameEnded = playerScore >= maxRounds || cpuScore >= maxRounds || currentRound >= rounds;
      
      if (gameEnded) {
        // El juego ha terminado
        gameActive = false;
        
        // Determinar el ganador y realizar la transacción de monedas
        let finalMessage;
        let finalColor;
        
        if (playerScore > cpuScore) {
          // El jugador gana
          const winnings = amount * 2;
          profile.character.currency += winnings;
          profile.stats.wins += 1;
          
          // Actualizar estadísticas si existe en inventario
          if (profile.character.inventory) {
            let pptStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de PPT");
            if (!pptStatsItem) {
              profile.character.inventory.push({
                item: "Estadísticas de PPT",
                quantity: 1,
                description: "Registro de tus partidas de Piedra, Papel o Tijera"
              });
              pptStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
            }
            
            // Inicializar metadatos si no existen
            if (!pptStatsItem.metadata) {
              pptStatsItem.metadata = {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                cpuGames: 0,
                pvpGames: 0,
                biggestWin: 0
              };
            }
            
            // Actualizar estadísticas
            pptStatsItem.metadata.gamesPlayed = (pptStatsItem.metadata.gamesPlayed || 0) + 1;
            pptStatsItem.metadata.wins = (pptStatsItem.metadata.wins || 0) + 1;
            pptStatsItem.metadata.cpuGames = (pptStatsItem.metadata.cpuGames || 0) + 1;
            
            // Actualizar mayor victoria
            if (amount > (pptStatsItem.metadata.biggestWin || 0)) {
              pptStatsItem.metadata.biggestWin = amount;
            }
            
            // Actualizar descripción
            pptStatsItem.description = `Estadísticas de PPT: ${pptStatsItem.metadata.wins}/${pptStatsItem.metadata.gamesPlayed} victorias`;
          }
          
          await profile.save();
          
          finalMessage = `¡GANASTE LA PARTIDA!\n\n**Marcador final:** Tú ${playerScore} - ${cpuScore} CPU\n\n**Ganancia:** +${amount} monedas\n**Total recibido:** ${winnings} monedas`;
          finalColor = '#00cc44';
        } else {
          // La CPU gana
          profile.stats.losses += 1;
          
          // Actualizar estadísticas si existe en inventario
          if (profile.character.inventory) {
            let pptStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de PPT");
            if (!pptStatsItem) {
              profile.character.inventory.push({
                item: "Estadísticas de PPT",
                quantity: 1,
                description: "Registro de tus partidas de Piedra, Papel o Tijera"
              });
              pptStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
            }
            
            // Inicializar metadatos si no existen
            if (!pptStatsItem.metadata) {
              pptStatsItem.metadata = {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                cpuGames: 0,
                pvpGames: 0,
                biggestWin: 0
              };
            }
            
            // Actualizar estadísticas
            pptStatsItem.metadata.gamesPlayed = (pptStatsItem.metadata.gamesPlayed || 0) + 1;
            pptStatsItem.metadata.losses = (pptStatsItem.metadata.losses || 0) + 1;
            pptStatsItem.metadata.cpuGames = (pptStatsItem.metadata.cpuGames || 0) + 1;
            
            // Actualizar descripción
            pptStatsItem.description = `Estadísticas de PPT: ${pptStatsItem.metadata.wins}/${pptStatsItem.metadata.gamesPlayed} victorias`;
          }
          
          await profile.save();
          
          finalMessage = `¡PERDISTE LA PARTIDA!\n\n**Marcador final:** Tú ${playerScore} - ${cpuScore} CPU\n\n**Perdiste:** ${amount} monedas`;
          finalColor = '#ff0000';
        }
        
        // Mostrar resultado final
        const finalEmbed = new EmbedBuilder()
          .setTitle('🎮 FIN DE LA PARTIDA')
          .setDescription(finalMessage)
          .addFields(
            { name: 'Resumen de la partida', value: `Rondas jugadas: ${currentRound}/${rounds}` }
          )
          .setColor(finalColor);
        
        // Botones para jugar de nuevo
        const playAgainButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`pptcpu:again:${profile._id}:${amount}:${rounds}`)
              .setLabel('🔄 JUGAR DE NUEVO')
              .setStyle(ButtonStyle.Primary)
          );
        
        await gameMessage.edit({ embeds: [finalEmbed], components: [playAgainButtons] });
        collector.stop('game_ended');
        return;
      }
      
      // Si el juego no ha terminado, mostrar el resultado de la ronda y continuar
      currentRound++;
      
      const roundResultEmbed = new EmbedBuilder()
        .setTitle(`Ronda ${currentRound-1}/${rounds}`)
        .setDescription(`
**Tú elegiste:** ${emojis[playerChoice]} ${playerChoice.toUpperCase()}
**La CPU eligió:** ${emojis[cpuChoice]} ${cpuChoice.toUpperCase()}

${resultMessage}

**Marcador actual:** Tú ${playerScore} - ${cpuScore} CPU
        `)
        .setColor(resultColor)
        .setFooter({ text: `Ronda ${currentRound}/${rounds} a continuación...` });
      
      await gameMessage.edit({ embeds: [roundResultEmbed], components: [] });
      
      // Esperar un momento antes de la siguiente ronda
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mostrar mensaje para la siguiente ronda
      const nextRoundEmbed = new EmbedBuilder()
        .setTitle(`Ronda ${currentRound}/${rounds}`)
        .setDescription(`
**Marcador actual:** Tú ${playerScore} - ${cpuScore} CPU

Elige tu jugada para la ronda ${currentRound}!
        `)
        .setColor('#0099ff')
        .setFooter({ text: 'Elige piedra, papel o tijera para continuar' });
      
      await gameMessage.edit({ embeds: [nextRoundEmbed], components: [createPlayButtons()] });
    });
    
    // Si se acaba el tiempo del collector
    collector.on('end', async (collected, reason) => {
      if (gameActive && reason !== 'game_ended') {
        // Si el juego sigue activo y no terminó por una acción del usuario, considerarlo como una rendición
        gameActive = false;
        
        // Devolver las monedas apostadas
        profile.character.currency += amount;
        await profile.save();
        
        const timeoutEmbed = new EmbedBuilder()
          .setTitle('⏰ TIEMPO AGOTADO')
          .setDescription(`
Se acabó el tiempo para tomar una decisión.
Por seguridad, la partida ha sido cancelada.

**Apuesta devuelta:** ${amount} monedas
          `)
          .setColor('#ff9900');
        
        try {
          await gameMessage.edit({ embeds: [timeoutEmbed], components: [] });
        } catch (err) {
          // Ignorar errores al editar mensajes antiguos
        }
      }
    });
  },
  
  // Método para jugar entre jugadores
  async startPlayerVsPlayerGame(context, opponent, amount, rounds, playerProfile, opponentProfile) {
    // Estado del juego
    let playerScore = 0;
    let opponentScore = 0;
    let currentRound = 1;
    let gameActive = true;
    
    // Para almacenar las elecciones de cada jugador en la ronda actual
    let currentRoundChoices = {
      player: null,
      opponent: null
    };
    
    // Opciones de juego
    const options = ['piedra', 'papel', 'tijera'];
    const emojis = {
      'piedra': '🪨',
      'papel': '📄',
      'tijera': '✂️'
    };
    
    // Para determinar el ganador de una ronda
    const winningCombinations = {
      'piedra': 'tijera',
      'papel': 'piedra',
      'tijera': 'papel'
    };
    
    // Función para obtener el perfil y usuario según el índice
    const getPlayerData = (isInitiator) => {
      if (isInitiator) {
        return {
          profile: playerProfile,
          user: context.author ? context.author : context.user
        };
      } else {
        return {
          profile: opponentProfile,
          user: opponent
        };
      }
    };
    
    // Crear botones para seleccionar la jugada
    const createPlayButtons = (isInitiator) => {
      const playerData = getPlayerData(isInitiator);
      
      return new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`pptvs:piedra:${isInitiator ? 'player' : 'opponent'}:${playerData.profile._id}:${amount}:${rounds}`)
            .setLabel('PIEDRA')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🪨'),
          new ButtonBuilder()
            .setCustomId(`pptvs:papel:${isInitiator ? 'player' : 'opponent'}:${playerData.profile._id}:${amount}:${rounds}`)
            .setLabel('PAPEL')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📄'),
          new ButtonBuilder()
            .setCustomId(`pptvs:tijera:${isInitiator ? 'player' : 'opponent'}:${playerData.profile._id}:${amount}:${rounds}`)
            .setLabel('TIJERA')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('✂️')
        );
    };
    
    // Función para determinar el ganador de una ronda
    const determineRoundWinner = (playerChoice, opponentChoice) => {
      if (playerChoice === opponentChoice) {
        return 'empate';
      } else if (winningCombinations[playerChoice] === opponentChoice) {
        return 'player';
      } else {
        return 'opponent';
      }
    };
    
    // Enviar mensaje inicial
    const initialEmbed = new EmbedBuilder()
      .setTitle('🎮 PIEDRA, PAPEL O TIJERA - JUGADOR VS JUGADOR')
      .setDescription(`
¡Bienvenidos al juego de Piedra, Papel o Tijera!

**Jugadores:** ${getPlayerData(true).user} vs ${getPlayerData(false).user}
**Apuesta:** ${amount} monedas cada uno (Total: ${amount * 2} monedas)
**Rondas:** ${rounds}
**Marcador actual:** ${getPlayerData(true).user.username} 0 - 0 ${getPlayerData(false).user.username}

Ronda 1/${rounds}: ¡Ambos jugadores deben elegir su jugada!
      `)
      .setColor('#0099ff')
      .setFooter({ text: 'Cada jugador debe pulsar un botón para hacer su jugada' });
    
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed] }) 
      : await context.reply({ embeds: [initialEmbed] });
    
    // Enviar mensajes privados a ambos jugadores con sus botones
    try {
      // Mensaje al jugador iniciador
      await getPlayerData(true).user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎮 PIEDRA, PAPEL O TIJERA')
            .setDescription(`
Estás jugando contra ${getPlayerData(false).user.username}.
Ronda 1/${rounds}: Elige tu jugada!
            `)
            .setColor('#0099ff')
        ],
        components: [createPlayButtons(true)]
      });
      
      // Mensaje al oponente
      await getPlayerData(false).user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎮 PIEDRA, PAPEL O TIJERA')
            .setDescription(`
Estás jugando contra ${getPlayerData(true).user.username}.
Ronda 1/${rounds}: Elige tu jugada!
            `)
            .setColor('#0099ff')
        ],
        components: [createPlayButtons(false)]
      });
    } catch (error) {
      // Si no se puede enviar mensajes a alguno de los jugadores
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ ERROR')
        .setDescription(`
No se pueden enviar mensajes privados a uno o ambos jugadores.
Asegúrense de tener habilitados los mensajes directos del servidor.

La partida ha sido cancelada y se devuelven las apuestas.
        `)
        .setColor('#ff0000');
      
      // Devolver las monedas apostadas
      playerProfile.character.currency += amount;
      opponentProfile.character.currency += amount;
      
      await playerProfile.save();
      await opponentProfile.save();
      
      await gameMessage.edit({ embeds: [errorEmbed], components: [] });
      return;
    }
    
    // Informar a los jugadores que se han enviado mensajes privados
    const dmSentEmbed = new EmbedBuilder()
      .setTitle('📨 MENSAJES ENVIADOS')
      .setDescription(`
Se han enviado mensajes privados a ambos jugadores con los botones para jugar.
Por favor, revisa tus mensajes directos para hacer tu jugada.

El canal se actualizará cuando ambos jugadores hayan elegido.
      `)
      .setColor('#0099ff')
      .setFooter({ text: 'Si no recibes el mensaje, verifica que tienes habilitados los mensajes directos del servidor' });
    
    await gameMessage.edit({ embeds: [dmSentEmbed] });
    
    // Crear collectors para ambos jugadores
    // Para el jugador iniciador
    const playerFilter = i => {
      const [command, action, role, profileId] = i.customId.split(':');
      return command === 'pptvs' && options.includes(action) && role === 'player' && profileId === playerProfile._id.toString() && i.user.id === getPlayerData(true).user.id;
    };
    
    // Para el oponente
    const opponentFilter = i => {
      const [command, action, role, profileId] = i.customId.split(':');
      return command === 'pptvs' && options.includes(action) && role === 'opponent' && profileId === opponentProfile._id.toString() && i.user.id === getPlayerData(false).user.id;
    };
    
    // Configurar los collectors
    const playerCollector = context.client.channels.cache.filter(channel => channel.type === 1 && channel.recipient?.id === getPlayerData(true).user.id).first()?.createMessageComponentCollector({ filter: playerFilter, time: 120000 });
    const opponentCollector = context.client.channels.cache.filter(channel => channel.type === 1 && channel.recipient?.id === getPlayerData(false).user.id).first()?.createMessageComponentCollector({ filter: opponentFilter, time: 120000 });
    
    // Si no se pueden crear los collectors
    if (!playerCollector || !opponentCollector) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ ERROR')
        .setDescription(`
No se pudieron configurar los collectors para la partida.
La partida ha sido cancelada y se devuelven las apuestas.
        `)
        .setColor('#ff0000');
      
      // Devolver las monedas apostadas
      playerProfile.character.currency += amount;
      opponentProfile.character.currency += amount;
      
      await playerProfile.save();
      await opponentProfile.save();
      
      await gameMessage.edit({ embeds: [errorEmbed], components: [] });
      return;
    }
    
    // Procesar elección del jugador iniciador
    playerCollector.on('collect', async i => {
      // Obtener la elección del jugador
      const playerChoice = i.customId.split(':')[1];
      
      // Guardar la elección
      currentRoundChoices.player = playerChoice;
      
      // Confirmar la selección
      await i.update({ 
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ JUGADA REALIZADA')
            .setDescription(`
Has elegido: ${emojis[playerChoice]} ${playerChoice.toUpperCase()}

Esperando a que ${getPlayerData(false).user.username} realice su jugada...
            `)
            .setColor('#00cc44')
        ],
        components: [] 
      });
      
      // Actualizar el mensaje en el canal del servidor
      const waitingEmbed = new EmbedBuilder()
        .setTitle('🎮 PIEDRA, PAPEL O TIJERA - ESPERANDO')
        .setDescription(`
**Jugadores:** ${getPlayerData(true).user} vs ${getPlayerData(false).user}
**Marcador actual:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}

Ronda ${currentRound}/${rounds}: 
- ${getPlayerData(true).user} ya ha elegido ✅
${currentRoundChoices.opponent ? `- ${getPlayerData(false).user} ya ha elegido ✅` : `- ${getPlayerData(false).user} está eligiendo...`}
        `)
        .setColor('#0099ff');
      
      await gameMessage.edit({ embeds: [waitingEmbed] });
      
      // Si ambos jugadores han elegido, procesar la ronda
      if (currentRoundChoices.player && currentRoundChoices.opponent) {
        await processRound();
      }
    });
    
    // Procesar elección del oponente
    opponentCollector.on('collect', async i => {
      // Obtener la elección del oponente
      const opponentChoice = i.customId.split(':')[1];
      
      // Guardar la elección
      currentRoundChoices.opponent = opponentChoice;
      
      // Confirmar la selección
      await i.update({ 
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ JUGADA REALIZADA')
            .setDescription(`
Has elegido: ${emojis[opponentChoice]} ${opponentChoice.toUpperCase()}

Esperando a que ${getPlayerData(true).user.username} realice su jugada...
            `)
            .setColor('#00cc44')
        ],
        components: [] 
      });
      
      // Actualizar el mensaje en el canal del servidor
      const waitingEmbed = new EmbedBuilder()
        .setTitle('🎮 PIEDRA, PAPEL O TIJERA - ESPERANDO')
        .setDescription(`
**Jugadores:** ${getPlayerData(true).user} vs ${getPlayerData(false).user}
**Marcador actual:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}

Ronda ${currentRound}/${rounds}: 
${currentRoundChoices.player ? `- ${getPlayerData(true).user} ya ha elegido ✅` : `- ${getPlayerData(true).user} está eligiendo...`}
- ${getPlayerData(false).user} ya ha elegido ✅
        `)
        .setColor('#0099ff');
      
      await gameMessage.edit({ embeds: [waitingEmbed] });
      
      // Si ambos jugadores han elegido, procesar la ronda
      if (currentRoundChoices.player && currentRoundChoices.opponent) {
        await processRound();
      }
    });
    
    // Procesar el resultado de la ronda
    async function processRound() {
      // Obtener las elecciones
      const { player: playerChoice, opponent: opponentChoice } = currentRoundChoices;
      
      // Mostrar las elecciones
      const choicesEmbed = new EmbedBuilder()
        .setTitle(`Ronda ${currentRound}/${rounds}`)
        .setDescription(`
**${getPlayerData(true).user.username} eligió:** ${emojis[playerChoice]} ${playerChoice.toUpperCase()}
**${getPlayerData(false).user.username} eligió:** ${emojis[opponentChoice]} ${opponentChoice.toUpperCase()}

Calculando resultado...
        `)
        .setColor('#0099ff');
      
      await gameMessage.edit({ embeds: [choicesEmbed] });
      
      // Esperar un momento para dar dramatismo
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Determinar el ganador de la ronda
      const roundWinner = determineRoundWinner(playerChoice, opponentChoice);
      
      // Actualizar marcador
      if (roundWinner === 'player') {
        playerScore++;
      } else if (roundWinner === 'opponent') {
        opponentScore++;
      }
      
      // Mensajes según el resultado
      let resultMessage;
      let resultColor;
      
      if (roundWinner === 'empate') {
        resultMessage = '¡Empate! Ambos eligieron lo mismo.';
        resultColor = '#ffaa00';
      } else if (roundWinner === 'player') {
        resultMessage = `¡${getPlayerData(true).user.username} gana la ronda! ${playerChoice.toUpperCase()} gana a ${opponentChoice.toUpperCase()}.`;
        resultColor = '#00cc44';
      } else {
        resultMessage = `¡${getPlayerData(false).user.username} gana la ronda! ${opponentChoice.toUpperCase()} gana a ${playerChoice.toUpperCase()}.`;
        resultColor = '#ff0000';
      }
      
      // Verificar si el juego ha terminado
      const maxRounds = Math.ceil(rounds / 2); // Número de rondas necesarias para ganar
      const gameEnded = playerScore >= maxRounds || opponentScore >= maxRounds || currentRound >= rounds;
      
      if (gameEnded) {
        // El juego ha terminado
        gameActive = false;
        
        // Determinar el ganador y realizar la transacción de monedas
        let finalMessage;
        let finalColor;
        
        // El jugador con más puntos gana
        if (playerScore > opponentScore) {
          // El jugador iniciador gana
          const winnings = amount * 2;
          playerProfile.character.currency += winnings;
          playerProfile.stats.wins += 1;
          opponentProfile.stats.losses += 1;
          
          // Actualizar estadísticas de ambos jugadores
          updatePlayerStats(playerProfile, true); // Ganador
          updatePlayerStats(opponentProfile, false); // Perdedor
          
          await playerProfile.save();
          await opponentProfile.save();
          
          finalMessage = `¡${getPlayerData(true).user} GANA LA PARTIDA!\n\n**Marcador final:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}\n\n**Premio:** ${winnings} monedas`;
          finalColor = '#00cc44';
        } else if (opponentScore > playerScore) {
          // El oponente gana
          const winnings = amount * 2;
          opponentProfile.character.currency += winnings;
          opponentProfile.stats.wins += 1;
          playerProfile.stats.losses += 1;
          
          // Actualizar estadísticas de ambos jugadores
          updatePlayerStats(playerProfile, false); // Perdedor
          updatePlayerStats(opponentProfile, true); // Ganador
          
          await playerProfile.save();
          await opponentProfile.save();
          
          finalMessage = `¡${getPlayerData(false).user} GANA LA PARTIDA!\n\n**Marcador final:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}\n\n**Premio:** ${winnings} monedas`;
          finalColor = '#00cc44';
        } else {
          // Empate
          playerProfile.character.currency += amount;
          opponentProfile.character.currency += amount;
          
          await playerProfile.save();
          await opponentProfile.save();
          
          finalMessage = `¡EMPATE!\n\n**Marcador final:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}\n\n**Apuestas devueltas**`;
          finalColor = '#ffaa00';
        }
        
        // Mostrar resultado final
        const finalEmbed = new EmbedBuilder()
          .setTitle('🎮 FIN DE LA PARTIDA')
          .setDescription(finalMessage)
          .addFields(
            { name: 'Resumen de la partida', value: `Rondas jugadas: ${currentRound}/${rounds}` }
          )
          .setColor(finalColor);
        
        // Botones para jugar de nuevo
        const playAgainButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`pptvs:rematch:${playerProfile._id}:${opponentProfile._id}:${amount}:${rounds}`)
              .setLabel('🔄 REVANCHA')
              .setStyle(ButtonStyle.Primary)
          );
        
        await gameMessage.edit({ embeds: [finalEmbed], components: [playAgainButtons] });
        
        // Notificar a ambos jugadores
        try {
          await getPlayerData(true).user.send({ embeds: [finalEmbed] });
          await getPlayerData(false).user.send({ embeds: [finalEmbed] });
        } catch (error) {
          // Ignorar errores al enviar mensajes
        }
        
        // Detener los collectors
        playerCollector.stop('game_ended');
        opponentCollector.stop('game_ended');
        return;
      }
      
      // Si el juego no ha terminado, mostrar el resultado de la ronda y continuar
      currentRound++;
      
      const roundResultEmbed = new EmbedBuilder()
        .setTitle(`Ronda ${currentRound-1}/${rounds}`)
        .setDescription(`
**${getPlayerData(true).user.username} eligió:** ${emojis[playerChoice]} ${playerChoice.toUpperCase()}
**${getPlayerData(false).user.username} eligió:** ${emojis[opponentChoice]} ${opponentChoice.toUpperCase()}

${resultMessage}

**Marcador actual:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}
        `)
        .setColor(resultColor)
        .setFooter({ text: `Ronda ${currentRound}/${rounds} a continuación...` });
      
      await gameMessage.edit({ embeds: [roundResultEmbed] });
      
      // Esperar un momento antes de la siguiente ronda
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reiniciar las elecciones para la siguiente ronda
      currentRoundChoices = {
        player: null,
        opponent: null
      };
      
      // Mostrar mensaje para la siguiente ronda en el canal
      const nextRoundEmbed = new EmbedBuilder()
        .setTitle(`Ronda ${currentRound}/${rounds}`)
        .setDescription(`
**Jugadores:** ${getPlayerData(true).user} vs ${getPlayerData(false).user}
**Marcador actual:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}

Se han enviado mensajes privados a ambos jugadores para la siguiente ronda.
        `)
        .setColor('#0099ff');
      
      await gameMessage.edit({ embeds: [nextRoundEmbed] });
      
      // Enviar nuevos mensajes a los jugadores para la siguiente ronda
      try {
        // Mensaje al jugador iniciador
        await getPlayerData(true).user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`🎮 PIEDRA, PAPEL O TIJERA - RONDA ${currentRound}/${rounds}`)
              .setDescription(`
Estás jugando contra ${getPlayerData(false).user.username}.
**Marcador actual:** ${playerScore} - ${opponentScore}

Elige tu jugada para la ronda ${currentRound}!
              `)
              .setColor('#0099ff')
          ],
          components: [createPlayButtons(true)]
        });
        
        // Mensaje al oponente
        await getPlayerData(false).user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`🎮 PIEDRA, PAPEL O TIJERA - RONDA ${currentRound}/${rounds}`)
              .setDescription(`
Estás jugando contra ${getPlayerData(true).user.username}.
**Marcador actual:** ${playerScore} - ${opponentScore}

Elige tu jugada para la ronda ${currentRound}!
              `)
              .setColor('#0099ff')
          ],
          components: [createPlayButtons(false)]
        });
      } catch (error) {
        // Si no se pueden enviar mensajes, terminar el juego
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ ERROR')
          .setDescription(`
No se pueden enviar mensajes privados a uno o ambos jugadores.
La partida ha sido cancelada y se devuelven las apuestas restantes.

**Marcador final:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}
          `)
          .setColor('#ff0000');
        
        // Si hubo un ganador, no devolver las monedas
        if (playerScore !== opponentScore) {
          await gameMessage.edit({ embeds: [errorEmbed], components: [] });
        } else {
          // Devolver las monedas apostadas
          playerProfile.character.currency += amount;
          opponentProfile.character.currency += amount;
          
          await playerProfile.save();
          await opponentProfile.save();
          
          await gameMessage.edit({ embeds: [errorEmbed], components: [] });
        }
        
        playerCollector.stop('error');
        opponentCollector.stop('error');
      }
    }
    
    // Función para actualizar estadísticas de jugadores
    function updatePlayerStats(profile, isWinner) {
        if (profile.character.inventory) {
          let pptStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de PPT");
          if (!pptStatsItem) {
            profile.character.inventory.push({
              item: "Estadísticas de PPT",
              quantity: 1,
              description: "Registro de tus partidas de Piedra, Papel o Tijera"
            });
            pptStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
          }
          
          // Inicializar metadatos si no existen
          if (!pptStatsItem.metadata) {
            pptStatsItem.metadata = {
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              cpuGames: 0,
              pvpGames: 0,
              biggestWin: 0
            };
          }
          
          // Actualizar estadísticas
          pptStatsItem.metadata.gamesPlayed = (pptStatsItem.metadata.gamesPlayed || 0) + 1;
          pptStatsItem.metadata.pvpGames = (pptStatsItem.metadata.pvpGames || 0) + 1;
          
          if (isWinner) {
            pptStatsItem.metadata.wins = (pptStatsItem.metadata.wins || 0) + 1;
            // Actualizar mayor victoria
            if (amount > (pptStatsItem.metadata.biggestWin || 0)) {
              pptStatsItem.metadata.biggestWin = amount;
            }
          } else {
            pptStatsItem.metadata.losses = (pptStatsItem.metadata.losses || 0) + 1;
          }
          
          // Actualizar descripción
          pptStatsItem.description = `Estadísticas de PPT: ${pptStatsItem.metadata.wins}/${pptStatsItem.metadata.gamesPlayed} victorias`;
        }
      }
  
      // Si se acaba el tiempo de los collectors
      playerCollector.on('end', async (collected, reason) => {
        if (gameActive && reason !== 'game_ended' && reason !== 'error') {
          // Si el juego sigue activo y se acabó el tiempo
          gameActive = false;
          
          // Notificar a ambos jugadores
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ TIEMPO AGOTADO')
            .setDescription(`
  ${getPlayerData(true).user.username} no realizó su jugada a tiempo.
  La partida ha sido cancelada.
  
  **Marcador final:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}
            `)
            .setColor('#ff9900');
          
          try {
            await getPlayerData(true).user.send({ embeds: [timeoutEmbed] });
            await getPlayerData(false).user.send({ embeds: [timeoutEmbed] });
          } catch (error) {
            // Ignorar errores al enviar mensajes
          }
          
          // Actualizar el mensaje en el canal
          await gameMessage.edit({ embeds: [timeoutEmbed], components: [] });
          
          // Devolver las monedas apostadas
          playerProfile.character.currency += amount;
          opponentProfile.character.currency += amount;
          
          await playerProfile.save();
          await opponentProfile.save();
          
          // Detener el otro collector
          opponentCollector.stop('time');
        }
      });
      
      opponentCollector.on('end', async (collected, reason) => {
        if (gameActive && reason !== 'game_ended' && reason !== 'error') {
          // Si el juego sigue activo y se acabó el tiempo
          gameActive = false;
          
          // Notificar a ambos jugadores
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ TIEMPO AGOTADO')
            .setDescription(`
  ${getPlayerData(false).user.username} no realizó su jugada a tiempo.
  La partida ha sido cancelada.
  
  **Marcador final:** ${getPlayerData(true).user.username} ${playerScore} - ${opponentScore} ${getPlayerData(false).user.username}
            `)
            .setColor('#ff9900');
          
          try {
            await getPlayerData(true).user.send({ embeds: [timeoutEmbed] });
            await getPlayerData(false).user.send({ embeds: [timeoutEmbed] });
          } catch (error) {
            // Ignorar errores al enviar mensajes
          }
          
          // Actualizar el mensaje en el canal
          await gameMessage.edit({ embeds: [timeoutEmbed], components: [] });
          
          // Devolver las monedas apostadas
          playerProfile.character.currency += amount;
          opponentProfile.character.currency += amount;
          
          await playerProfile.save();
          await opponentProfile.save();
        }
      });
    }
  };