const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'ruletarusa',
  aliases: ['rr', 'revolver'],
  description: 'Juega a la ruleta rusa contra la CPU o contra otro jugador',
  category: 'casino',
  cooldown: 10,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('ruletarusa')
    .setDescription('Juega a la ruleta rusa contra la CPU o contra otro jugador')
    .addIntegerOption(option => 
      option.setName('apuesta')
        .setDescription('Cantidad de monedas para apostar')
        .setRequired(true)
        .setMinValue(50))
    .addStringOption(option =>
      option.setName('modo')
        .setDescription('Modo de juego')
        .setRequired(true)
        .addChoices(
          { name: '🤖 VS CPU', value: 'cpu' },
          { name: '👥 VS Jugador', value: 'jugador' }
        ))
    .addStringOption(option =>
      option.setName('dificultad')
        .setDescription('Nivel de dificultad (solo para modo CPU)')
        .setRequired(false)
        .addChoices(
          { name: '🟢 Fácil (Revólver de 8 balas, 1 cargada)', value: 'facil' },
          { name: '🟡 Normal (Revólver de 6 balas, 1 cargada)', value: 'normal' },
          { name: '🔴 Difícil (Revólver de 4 balas, 1 cargada)', value: 'dificil' },
          { name: '💀 Extremo (Revólver de 3 balas, 1 cargada)', value: 'extremo' }
        )),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    if (!args[0]) {
      return message.reply('❌ Debes especificar una cantidad de monedas para apostar.');
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 50) {
      return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 50 monedas.');
    }
    
    // Determinar modo
    const mode = args[1]?.toLowerCase() || 'cpu';
    if (!['cpu', 'jugador'].includes(mode)) {
      return message.reply('❌ El modo debe ser "cpu" o "jugador".');
    }
    
    // Determinar dificultad (solo para modo CPU)
    const availableDifficulties = ['facil', 'normal', 'dificil', 'extremo'];
    let difficulty = args[2]?.toLowerCase() || 'normal';
    
    if (!availableDifficulties.includes(difficulty)) {
      difficulty = 'normal';
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
      this.startCpuGame(message, amount, difficulty, profile);
    } else {
      // Modo contra jugador: mostrar menú para seleccionar oponente
      const selectUserMenu = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`ruletarusa:select:${message.author.id}:${amount}`)
            .setPlaceholder('Selecciona a tu oponente')
            .setMaxValues(1)
        );
      
      const selectEmbed = new EmbedBuilder()
        .setTitle('🔫 RULETA RUSA - SELECCIÓN DE OPONENTE')
        .setDescription(`
${message.author} quiere desafiar a alguien a una partida de Ruleta Rusa.

**Apuesta:** ${amount} monedas
        `)
        .setColor('#ff5500')
        .setFooter({ text: 'El oponente debe aceptar el desafío y tener suficientes monedas' });
      
      const selectMsg = await message.reply({ embeds: [selectEmbed], components: [selectUserMenu] });
      
      // Crear collector para la selección de usuario
      const filter = i => {
        const [command, action, userId] = i.customId.split(':');
        return command === 'ruletarusa' && action === 'select' && i.user.id === message.author.id;
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
          await i.reply({ 
            content: '❌ No puedes desafiarte a ti mismo.',
            ephemeral: true
          });
          return;
        }
        
        if (targetUser.bot) {
          await i.reply({ 
            content: '❌ No puedes desafiar a un bot. Usa el modo CPU para eso.',
            ephemeral: true
          });
          return;
        }
        
        // Verificar que el oponente tiene perfil
        const targetProfile = await Profile.findOne({
          userId: targetUserId,
          serverId: message.guild.id
        });
        
        if (!targetProfile) {
          await i.reply({ 
            content: `❌ ${targetUser.tag} no tiene un perfil en este servidor.`,
            ephemeral: true
          });
          return;
        }
        
        // Verificar que el oponente tiene suficientes monedas
        if (targetProfile.character.currency < amount) {
          await i.reply({ 
            content: `❌ ${targetUser.tag} no tiene suficientes monedas para la apuesta. Tiene ${targetProfile.character.currency} monedas.`,
            ephemeral: true
          });
          return;
        }
        
        // Enviar solicitud de desafío
        const challengeButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ruletarusa:accept:${message.author.id}:${targetUserId}:${amount}`)
              .setLabel('ACEPTAR DESAFÍO')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`ruletarusa:decline:${message.author.id}:${targetUserId}:${amount}`)
              .setLabel('RECHAZAR')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
        
        const challengeEmbed = new EmbedBuilder()
          .setTitle('🔫 DESAFÍO DE RULETA RUSA')
          .setDescription(`
${message.author} te desafía a una partida de Ruleta Rusa, ${targetUser}!

**Apuesta:** ${amount} monedas

¿Aceptas el desafío?
          `)
          .setColor('#ff5500')
          .setFooter({ text: 'El desafío expira en 60 segundos' });
        
        await i.update({ embeds: [challengeEmbed], components: [challengeButtons] });
        
        // Crear collector para la respuesta al desafío
        const challengeFilter = j => {
          const [command, action, challengerId, targetId] = j.customId.split(':');
          return command === 'ruletarusa' && ['accept', 'decline'].includes(action) && 
                targetId === targetUserId && j.user.id === targetUserId;
        };
        
        const challengeCollector = selectMsg.createMessageComponentCollector({ 
          filter: challengeFilter, 
          time: 60000
        });
        
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
              await j.reply({ 
                content: `❌ ${message.author.tag} ya no tiene suficientes monedas para la apuesta.`,
                ephemeral: true
              });
              return;
            }
            
            if (updatedTargetProfile.character.currency < amount) {
              await j.reply({ 
                content: `❌ Ya no tienes suficientes monedas para la apuesta.`,
                ephemeral: true
              });
              return;
            }
            
            // Restar las monedas de la apuesta a ambos jugadores
            updatedProfile.character.currency -= amount;
            updatedTargetProfile.character.currency -= amount;
            
            await updatedProfile.save();
            await updatedTargetProfile.save();
            
            // Iniciar el juego entre jugadores
            await j.update({ content: '🔫 ¡El desafío ha sido aceptado! La partida está comenzando...', embeds: [], components: [] });
            this.startPlayerVsPlayerGame(message, targetUser, amount, updatedProfile, updatedTargetProfile);
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
    const difficulty = interaction.options.getString('dificultad') || 'normal';
    
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
    
    if (mode === 'cpu') {
      // Restar las monedas de la apuesta
      profile.character.currency -= amount;
      await profile.save();
      
      // Iniciar el juego contra la CPU
      await interaction.reply(`🔫 **RULETA RUSA VS CPU** - Apostando ${amount} monedas en dificultad ${difficulty}`);
      this.startCpuGame(interaction, amount, difficulty, profile);
    } else {
      // Modo contra jugador: mostrar menú para seleccionar oponente
      const selectUserMenu = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`ruletarusa:select:${interaction.user.id}:${amount}`)
            .setPlaceholder('Selecciona a tu oponente')
            .setMaxValues(1)
        );
      
      const selectEmbed = new EmbedBuilder()
        .setTitle('🔫 RULETA RUSA - SELECCIÓN DE OPONENTE')
        .setDescription(`
${interaction.user} quiere desafiar a alguien a una partida de Ruleta Rusa.

**Apuesta:** ${amount} monedas
        `)
        .setColor('#ff5500')
        .setFooter({ text: 'El oponente debe aceptar el desafío y tener suficientes monedas' });
      
      await interaction.reply({ embeds: [selectEmbed], components: [selectUserMenu] });
      
      // Crear collector para la selección de usuario
      const filter = i => {
        const [command, action, userId] = i.customId.split(':');
        return command === 'ruletarusa' && action === 'select' && i.user.id === interaction.user.id;
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
          await i.reply({ 
            content: '❌ No puedes desafiarte a ti mismo.',
            ephemeral: true
          });
          return;
        }
        
        if (targetUser.bot) {
          await i.reply({ 
            content: '❌ No puedes desafiar a un bot. Usa el modo CPU para eso.',
            ephemeral: true
          });
          return;
        }
        
        // Verificar que el oponente tiene perfil
        const targetProfile = await Profile.findOne({
          userId: targetUserId,
          serverId: interaction.guild.id
        });
        
        if (!targetProfile) {
          await i.reply({ 
            content: `❌ ${targetUser.tag} no tiene un perfil en este servidor.`,
            ephemeral: true
          });
          return;
        }
        
        // Verificar que el oponente tiene suficientes monedas
        if (targetProfile.character.currency < amount) {
          await i.reply({ 
            content: `❌ ${targetUser.tag} no tiene suficientes monedas para la apuesta. Tiene ${targetProfile.character.currency} monedas.`,
            ephemeral: true
          });
          return;
        }
        
        // Enviar solicitud de desafío
        const challengeButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ruletarusa:accept:${interaction.user.id}:${targetUserId}:${amount}`)
              .setLabel('ACEPTAR DESAFÍO')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`ruletarusa:decline:${interaction.user.id}:${targetUserId}:${amount}`)
              .setLabel('RECHAZAR')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
        
        const challengeEmbed = new EmbedBuilder()
          .setTitle('🔫 DESAFÍO DE RULETA RUSA')
          .setDescription(`
${interaction.user} te desafía a una partida de Ruleta Rusa, ${targetUser}!

**Apuesta:** ${amount} monedas

¿Aceptas el desafío?
          `)
          .setColor('#ff5500')
          .setFooter({ text: 'El desafío expira en 60 segundos' });
        
        await i.update({ embeds: [challengeEmbed], components: [challengeButtons] });
        
        // Crear collector para la respuesta al desafío
        const challengeFilter = j => {
          const [command, action, challengerId, targetId] = j.customId.split(':');
          return command === 'ruletarusa' && ['accept', 'decline'].includes(action) && 
                targetId === targetUserId && j.user.id === targetUserId;
        };
        
        const challengeCollector = interaction.channel.createMessageComponentCollector({ 
          filter: challengeFilter, 
          time: 60000
        });
        
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
              await j.reply({ 
                content: `❌ ${interaction.user.tag} ya no tiene suficientes monedas para la apuesta.`,
                ephemeral: true
              });
              return;
            }
            
            if (updatedTargetProfile.character.currency < amount) {
              await j.reply({ 
                content: `❌ Ya no tienes suficientes monedas para la apuesta.`,
                ephemeral: true
              });
              return;
            }
            
            // Restar las monedas de la apuesta a ambos jugadores
            updatedProfile.character.currency -= amount;
            updatedTargetProfile.character.currency -= amount;
            
            await updatedProfile.save();
            await updatedTargetProfile.save();
            
            // Iniciar el juego entre jugadores
            await j.update({ content: '🔫 ¡El desafío ha sido aceptado! La partida está comenzando...', embeds: [], components: [] });
            this.startPlayerVsPlayerGame(interaction, targetUser, amount, updatedProfile, updatedTargetProfile);
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
  async startCpuGame(context, amount, difficulty, profile) {
    // Configurar según dificultad
    let chamberCount, bulletsCount, difficultyColor;
    
    switch(difficulty) {
      case 'facil':
        chamberCount = 8;
        bulletsCount = 1;
        difficultyColor = '#00cc44'; // Verde
        break;
      case 'dificil':
        chamberCount = 4;
        bulletsCount = 1;
        difficultyColor = '#cc0000'; // Rojo
        break;
      case 'extremo':
        chamberCount = 3;
        bulletsCount = 1;
        difficultyColor = '#800000'; // Rojo oscuro
        break;
      default: // normal
        chamberCount = 6;
        bulletsCount = 1;
        difficultyColor = '#ffaa00'; // Naranja
    }
    
    // Estado del juego
    let chambers = Array(chamberCount).fill(false); // false = vacío, true = bala
    let currentChamber = 0;
    let playerTurn = true; // El jugador siempre empieza
    let gameActive = true;
    let consecutiveShots = 1; // Número de disparos consecutivos para el turno actual
    
    // Cargar la(s) bala(s) en posiciones aleatorias
    for (let i = 0; i < bulletsCount; i++) {
      let position;
      do {
        position = Math.floor(Math.random() * chamberCount);
      } while (chambers[position]); // Asegurarse de no cargar dos balas en la misma posición
      
      chambers[position] = true;
    }
    
    // Mezclar el tambor
    shuffleDrum();
    
    // Habilidades especiales disponibles
    const skillTypes = [
      { name: 'Salto de turno', description: 'Pasas tu turno al oponente', emoji: '⏭️' },
      { name: 'Doble disparo', description: 'Tu oponente debe disparar dos veces seguidas', emoji: '🔄' },
      { name: 'Girar tambor', description: 'El tambor se mezcla nuevamente', emoji: '🔀' },
      { name: 'Intuición', description: 'Puedes ver si la siguiente recámara tiene una bala', emoji: '👁️' },
      { name: 'Apuntar', description: '50% de probabilidad de apuntar a un lado y evitar la bala', emoji: '🎯' }
    ];
    
    // Probabilidad de obtener una habilidad en cada turno
    const skillProbability = 0.3; // 30% de probabilidad
    
    // Habilidades activas
    let playerSkills = [];
    let cpuSkills = [];
    
    // Función para obtener una habilidad aleatoria
    const getRandomSkill = () => {
      return skillTypes[Math.floor(Math.random() * skillTypes.length)];
    };
    
    // Función para rotar el tambor
    function rotateDrum() {
      chambers.unshift(chambers.pop());
    }
    
    // Función para mezclar completamente el tambor
    function shuffleDrum() {
      for (let i = chambers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chambers[i], chambers[j]] = [chambers[j], chambers[i]];
      }
      currentChamber = 0;
    }
    
    // Crear botones del juego
    const createGameButtons = (isPlayerTurn = true) => {
      const rows = [];
      
      // Fila para disparar
      const mainRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`rr:shoot:${profile._id}:${amount}`)
            .setLabel('DISPARAR')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔫')
        );
      
      rows.push(mainRow);
      
      // Fila para habilidades si el jugador tiene alguna
      if (playerSkills.length > 0 && isPlayerTurn) {
        const skillRow = new ActionRowBuilder();
        
        for (let i = 0; i < Math.min(playerSkills.length, 5); i++) {
          skillRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`rr:skill:${profile._id}:${amount}:${i}`)
              .setLabel(playerSkills[i].name)
              .setStyle(ButtonStyle.Success)
              .setEmoji(playerSkills[i].emoji)
          );
        }
        
        rows.push(skillRow);
      }
      
      return rows;
    };
    
    // Función para disparar
    const shoot = (isCpu = false) => {
      const hasBullet = chambers[currentChamber];
      
      // Rotar el tambor para el siguiente disparo
      currentChamber = (currentChamber + 1) % chamberCount;
      
      return hasBullet;
    };
    
    // Función para que la CPU realice su turno
    const cpuTurn = async () => {
      if (!gameActive) return;
      
      // Simular "pensamiento" de la CPU
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // La CPU puede usar una habilidad
      if (cpuSkills.length > 0 && Math.random() < 0.6) { // 60% de probabilidad de usar una habilidad
        const skillIndex = Math.floor(Math.random() * cpuSkills.length);
        const skill = cpuSkills[skillIndex];
        
        // Eliminar la habilidad usada
        cpuSkills.splice(skillIndex, 1);
        
        // Mostrar uso de habilidad
        const skillEmbed = new EmbedBuilder()
          .setTitle(`${skill.emoji} LA CPU USA UNA HABILIDAD`)
          .setDescription(`
La CPU ha usado **${skill.name}**!
${skill.description}
          `)
          .setColor('#9900ff');
        
        await gameMessage.edit({ embeds: [skillEmbed], components: [] });
        
        // Esperar un momento
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Aplicar efecto según la habilidad
        if (skill.name === 'Salto de turno') {
          // La CPU pasa su turno al jugador
          playerTurn = true;
          consecutiveShots = 1;
          
          // Mostrar turno del jugador
          const turnEmbed = createTurnEmbed(true);
          await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
          return;
        }
        
        if (skill.name === 'Doble disparo') {
          // El jugador deberá disparar dos veces seguidas en su próximo turno
          playerTurn = true;
          consecutiveShots = 2;
          
          const doubleShotEmbed = new EmbedBuilder()
            .setTitle('🔄 ¡DOBLE DISPARO!')
            .setDescription(`
La CPU ha usado Doble Disparo. ¡Deberás disparar dos veces seguidas en tu próximo turno!
            `)
            .setColor('#ff5500');
          
          await gameMessage.edit({ embeds: [doubleShotEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Mostrar turno del jugador
          const turnEmbed = createTurnEmbed(true);
          await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
          return;
        }
        
        if (skill.name === 'Girar tambor') {
          // Mezclar el tambor aleatoriamente
          shuffleDrum();
          
          const shuffleEmbed = new EmbedBuilder()
            .setTitle('🔀 ¡TAMBOR MEZCLADO!')
            .setDescription(`
La CPU ha usado Girar Tambor. El tambor ha sido mezclado completamente.
            `)
            .setColor('#9900ff');
          
          await gameMessage.edit({ embeds: [shuffleEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (skill.name === 'Intuición') {
          // La CPU ve si la siguiente recámara tiene una bala
          const nextChamberHasBullet = chambers[currentChamber];
          
          // La CPU decide qué hacer según la información
          const intuitionEmbed = new EmbedBuilder()
            .setTitle('👁️ ¡INTUICIÓN CPU!')
            .setDescription(`
La CPU ha usado Intuición para ver la siguiente recámara...
${nextChamberHasBullet ? 'Y parece preocupada por lo que ha visto.' : 'Y parece confiada con lo que ha visto.'}
            `)
            .setColor('#9900ff');
          
          await gameMessage.edit({ embeds: [intuitionEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Si hay una bala, la CPU intentará usar otra habilidad o pasar
          if (nextChamberHasBullet && Math.random() < 0.8) {  // 80% probabilidad de evitar el disparo
            if (cpuSkills.length > 0) {
              // Intentar usar otra habilidad (recursivo)
              await cpuTurn();
              return;
            } else {
              // Intentar pasar turno con una excusa
              playerTurn = true;
              consecutiveShots = 1;
              
              const skipEmbed = new EmbedBuilder()
                .setTitle('🤔 LA CPU DUDA')
                .setDescription(`
La CPU parece insegura y te cede el turno.
                `)
                .setColor('#ff5500');
              
              await gameMessage.edit({ embeds: [skipEmbed], components: [] });
              
              // Esperar un momento
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Mostrar turno del jugador
              const turnEmbed = createTurnEmbed(true);
              await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
              return;
            }
          }
        }
        
        if (skill.name === 'Apuntar') {
          // 50% de probabilidad de evitar la bala
          const willAvoidBullet = Math.random() < 0.5;
          
          const aimEmbed = new EmbedBuilder()
            .setTitle('🎯 ¡CPU APUNTA!')
            .setDescription(`
La CPU ha usado Apuntar. Tiene 50% de probabilidad de evitar una bala.
            `)
            .setColor('#9900ff');
          
          await gameMessage.edit({ embeds: [aimEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // La CPU dispara con la posibilidad de evitar la bala
          const hasBullet = chambers[currentChamber];
          
          if (hasBullet && willAvoidBullet) {
            // La CPU evita la bala
            const dodgeEmbed = new EmbedBuilder()
              .setTitle('😎 ¡LA CPU EVITA LA BALA!')
              .setDescription(`
¡La CPU ha apuntado correctamente y ha evitado la bala!

**Recámara:** 💥 BALA
              `)
              .setColor('#00cc44');
            
            await gameMessage.edit({ embeds: [dodgeEmbed], components: [] });
            
            // Rotar el tambor para el siguiente disparo
            currentChamber = (currentChamber + 1) % chamberCount;
            
            // Esperar un momento
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Pasar turno al jugador
            playerTurn = true;
            consecutiveShots = 1;
            const turnEmbed = createTurnEmbed(true);
            await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
            return;
          }
          
          // Si no evitó la bala o no había bala, continúa normalmente
        }
      }
      
      // La CPU dispara normalmente
      const shootEmbed = new EmbedBuilder()
        .setTitle('🔫 LA CPU DISPARA')
        .setDescription(`
La CPU toma el revólver, apunta a su cabeza y aprieta el gatillo...
        `)
        .setColor('#ff5500');
      
      await gameMessage.edit({ embeds: [shootEmbed], components: [] });
      
      // Esperar un momento para dar dramatismo
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Realizar el disparo
      const hasBullet = shoot(true);
      
      if (hasBullet) {
        // La CPU pierde
        gameActive = false;
        
        // Efectos visuales de victoria
        const winEffects = ['🎉', '💰', '🏆', '✨', '😎'];
        const randomEffects = Array(3).fill().map(() => winEffects[Math.floor(Math.random() * winEffects.length)]).join(' ');
        
        // Actualizar monedas del jugador (gana el doble de lo apostado)
        profile.character.currency += amount * 2;
        profile.stats.wins += 1;
        
        // Actualizar estadísticas si existe en inventario
        if (profile.character.inventory) {
          let rrStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Ruleta Rusa");
          if (!rrStatsItem) {
            profile.character.inventory.push({
              item: "Estadísticas de Ruleta Rusa",
              quantity: 1,
              description: "Registro de tus partidas de Ruleta Rusa"
            });
            rrStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
          }
          
          // Inicializar metadatos si no existen
          if (!rrStatsItem.metadata) {
            rrStatsItem.metadata = {
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              cpuGames: 0,
              pvpGames: 0,
              biggestWin: 0
            };
          }
          
          // Actualizar estadísticas
          rrStatsItem.metadata.gamesPlayed = (rrStatsItem.metadata.gamesPlayed || 0) + 1;
          rrStatsItem.metadata.wins = (rrStatsItem.metadata.wins || 0) + 1;
          rrStatsItem.metadata.cpuGames = (rrStatsItem.metadata.cpuGames || 0) + 1;
          
          // Actualizar mayor victoria
          if (amount > (rrStatsItem.metadata.biggestWin || 0)) {
            rrStatsItem.metadata.biggestWin = amount;
          }
          
          // Actualizar descripción
          rrStatsItem.description = `Estadísticas de Ruleta Rusa: ${rrStatsItem.metadata.wins}/${rrStatsItem.metadata.gamesPlayed} victorias`;
        }
        
        await profile.save();
        
        const winEmbed = new EmbedBuilder()
          .setTitle(`${randomEffects} ¡HAS GANADO! ${randomEffects}`)
          .setDescription(`
¡La CPU ha disparado y ha perdido!

**Recámara:** 💥 BALA
**Ganancia:** +${amount} monedas
**Total recibido:** ${amount * 2} monedas
          `)
          .setColor('#00ff00')
          .setFooter({ text: `Dificultad: ${difficulty}` });
        
        // Botones para jugar de nuevo
        const playAgainButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`rr:again:${profile._id}:${amount}:${difficulty}`)
              .setLabel('🔄 JUGAR DE NUEVO')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`rr:double:${profile._id}:${amount}:${difficulty}`)
              .setLabel('💰 DOBLAR APUESTA')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`rr:harder:${profile._id}:${amount}:${difficulty}`)
              .setLabel('⚠️ AUMENTAR DIFICULTAD')
              .setStyle(ButtonStyle.Danger)
          );
        
        await gameMessage.edit({ embeds: [winEmbed], components: [playAgainButtons] });
        return;
      }
      
      // Si la CPU sobrevive, mostrar resultado y pasar turno al jugador
      const survivedEmbed = new EmbedBuilder()
        .setTitle('😅 LA CPU SOBREVIVE')
        .setDescription(`
La CPU ha disparado y ha sobrevivido.

**Recámara:** 🟢 VACÍA
        `)
        .setColor('#00cc44');
      
      await gameMessage.edit({ embeds: [survivedEmbed], components: [] });
      
      // Esperar un momento
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Posibilidad de obtener habilidad aleatoria
      if (Math.random() < skillProbability && cpuSkills.length < 3) {
        const newSkill = getRandomSkill();
        cpuSkills.push(newSkill);
        
        const skillEmbed = new EmbedBuilder()
          .setTitle('🎁 ¡LA CPU OBTUVO UNA HABILIDAD!')
          .setDescription(`
La CPU ha obtenido: **${newSkill.name}** ${newSkill.emoji}
${newSkill.description}
          `)
          .setColor('#9900ff');
        
        await gameMessage.edit({ embeds: [skillEmbed], components: [] });
        
        // Esperar un momento
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Pasar turno al jugador
      playerTurn = true;
      consecutiveShots = 1;
      const turnEmbed = createTurnEmbed(true);
      await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
    };
    
    // Crear embed para mostrar el turno
    const createTurnEmbed = (isPlayerTurn) => {
      return new EmbedBuilder()
        .setTitle(isPlayerTurn ? '🔫 TU TURNO' : '🤖 TURNO DE LA CPU')
        .setDescription(`
${isPlayerTurn ? '¡Es tu turno de disparar!' : 'La CPU está decidiendo qué hacer...'}
${isPlayerTurn && consecutiveShots > 1 ? `\n**¡Debes disparar ${consecutiveShots} veces!**` : ''}

**Apuesta:** ${amount} monedas
**Dificultad:** ${difficulty}
**Tambor:** ${chamberCount} recámaras, ${bulletsCount} bala(s)
${isPlayerTurn && playerSkills.length > 0 ? `**Habilidades disponibles:** ${playerSkills.map(s => s.emoji).join(' ')}` : ''}
${!isPlayerTurn && cpuSkills.length > 0 ? `**Habilidades CPU:** ${cpuSkills.length} disponibles` : ''}
        `)
        .setColor(isPlayerTurn ? '#ff5500' : difficultyColor)
        .setFooter({ text: `Dificultad: ${difficulty}` });
    };
    
    // Enviar mensaje inicial
    const initialEmbed = new EmbedBuilder()
      .setTitle('🔫 RULETA RUSA VS CPU 🤖')
      .setDescription(`
¡Bienvenido al juego de la Ruleta Rusa!

**Apuesta:** ${amount} monedas
**Dificultad:** ${difficulty}
**Tambor:** ${chamberCount} recámaras, ${bulletsCount} bala(s)

El revólver se ha cargado y el tambor se ha mezclado.
¡Comienza el juego!
      `)
      .addFields(
        { name: '💡 INSTRUCCIONES', value: 
          `- Por turnos, cada jugador deberá disparar el revólver.\n` +
          `- Si te toca una bala, pierdes la partida y la apuesta.\n` +
          `- Durante el juego podrás obtener habilidades especiales.\n` +
          `- Usa tus habilidades estratégicamente para sobrevivir.`
        }
      )
      .setColor(difficultyColor);
    
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed] }) 
      : await context.reply({ embeds: [initialEmbed] });
    
    // Esperar un momento para dar dramatismo
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Comenzar el juego con turno del jugador
    const firstTurnEmbed = createTurnEmbed(true);
    await gameMessage.edit({ embeds: [firstTurnEmbed], components: createGameButtons(true) });
    
    // Crear collector para las interacciones
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'rr' && profileId === profile._id.toString() && 
            (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ 
      filter, 
      time: 180000 
    });
    
    // Procesar interacciones
    collector.on('collect', async i => {
      const [, action, , , skillIndex] = i.customId.split(':');
      
      if (!gameActive) {
        // Si el juego ya terminó, procesar solo botones de "jugar de nuevo"
        if (action === 'again' || action === 'double' || action === 'harder') {
          let newAmount = amount;
          let newDifficulty = difficulty;
          
          if (action === 'double') {
            newAmount = amount * 2;
          }
          
          if (action === 'harder') {
            // Subir un nivel de dificultad
            const difficulties = ['facil', 'normal', 'dificil', 'extremo'];
            const currentIndex = difficulties.indexOf(difficulty);
            if (currentIndex < difficulties.length - 1) {
              newDifficulty = difficulties[currentIndex + 1];
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
            content: `🔫 **RULETA RUSA VS CPU** - Nueva partida con ${newAmount} monedas en dificultad ${newDifficulty}`,
            embeds: [], 
            components: [] 
          });
          
          this.startCpuGame(context, newAmount, newDifficulty, updatedProfile);
        }
        
        return;
      }
      
      if (!playerTurn) {
        await i.reply({
          content: '❌ No es tu turno.',
          ephemeral: true
        });
        return;
      }
      
      if (action === 'shoot') {
        // El jugador dispara
        const shootEmbed = new EmbedBuilder()
          .setTitle('🔫 DISPARANDO')
          .setDescription(`
Tomas el revólver, apuntas a tu cabeza y aprietas el gatillo...
          `)
          .setColor('#ff5500');
        
        await i.update({ embeds: [shootEmbed], components: [] });
        
        // Esperar un momento para dar dramatismo
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        // Realizar el disparo
        const hasBullet = shoot();
        
        if (hasBullet) {
          // El jugador pierde
          gameActive = false;
          
          // Efectos visuales de derrota
          const loseEffects = ['💥', '💀', '☠️', '😵', '💸'];
          const randomEffects = Array(3).fill().map(() => loseEffects[Math.floor(Math.random() * loseEffects.length)]).join(' ');
          
          // Actualizar estadísticas
          profile.stats.losses += 1;
          
          // Actualizar estadísticas si existe en inventario
          if (profile.character.inventory) {
            let rrStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Ruleta Rusa");
            if (!rrStatsItem) {
              profile.character.inventory.push({
                item: "Estadísticas de Ruleta Rusa",
                quantity: 1,
                description: "Registro de tus partidas de Ruleta Rusa"
              });
              rrStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
            }
            
            // Inicializar metadatos si no existen
            if (!rrStatsItem.metadata) {
              rrStatsItem.metadata = {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                cpuGames: 0,
                pvpGames: 0,
                biggestWin: 0
              };
            }
            
            // Actualizar estadísticas
            rrStatsItem.metadata.gamesPlayed = (rrStatsItem.metadata.gamesPlayed || 0) + 1;
            rrStatsItem.metadata.losses = (rrStatsItem.metadata.losses || 0) + 1;
            rrStatsItem.metadata.cpuGames = (rrStatsItem.metadata.cpuGames || 0) + 1;
            
            // Actualizar descripción
            rrStatsItem.description = `Estadísticas de Ruleta Rusa: ${rrStatsItem.metadata.wins}/${rrStatsItem.metadata.gamesPlayed} victorias`;
          }
          
          await profile.save();
          
          const loseEmbed = new EmbedBuilder()
            .setTitle(`${randomEffects} ¡HAS PERDIDO! ${randomEffects}`)
            .setDescription(`
Has disparado y has perdido.

**Recámara:** 💥 BALA
**Perdiste:** ${amount} monedas
            `)
            .setColor('#ff0000')
            .setFooter({ text: `Dificultad: ${difficulty}` });
          
          // Botones para jugar de nuevo
          const playAgainButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`rr:again:${profile._id}:${amount}:${difficulty}`)
                .setLabel('🔄 JUGAR DE NUEVO')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`rr:double:${profile._id}:${amount}:${difficulty}`)
                .setLabel('💰 DOBLAR APUESTA')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId(`rr:easier:${profile._id}:${amount}:${difficulty}`)
                .setLabel('⬇️ REDUCIR DIFICULTAD')
                .setStyle(ButtonStyle.Secondary)
            );
          
          await gameMessage.edit({ embeds: [loseEmbed], components: [playAgainButtons] });
          collector.stop('lose');
          return;
        }
        
        // Si el jugador sobrevive, mostrar resultado
        const survivedEmbed = new EmbedBuilder()
          .setTitle('😅 ¡HAS SOBREVIVIDO!')
          .setDescription(`
Has disparado y has sobrevivido.

**Recámara:** 🟢 VACÍA
          `)
          .setColor('#00cc44');
        
        await gameMessage.edit({ embeds: [survivedEmbed], components: [] });
        
        // Esperar un momento
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Posibilidad de obtener habilidad aleatoria
        if (Math.random() < skillProbability && playerSkills.length < 3) {
          const newSkill = getRandomSkill();
          playerSkills.push(newSkill);
          
          const skillEmbed = new EmbedBuilder()
            .setTitle('🎁 ¡HAS OBTENIDO UNA HABILIDAD!')
            .setDescription(`
Has obtenido: **${newSkill.name}** ${newSkill.emoji}
${newSkill.description}
            `)
            .setColor('#9900ff');
          
          await gameMessage.edit({ embeds: [skillEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Verificar si es un turno de disparo múltiple
        consecutiveShots--;
        if (consecutiveShots > 0) {
          // Si aún quedan disparos pendientes, continuar con el turno del jugador
          const multiShotEmbed = new EmbedBuilder()
            .setTitle('🔄 ¡DISPARO ADICIONAL!')
            .setDescription(`
Debido a la habilidad "Doble Disparo", debes disparar ${consecutiveShots} vez más.
            `)
            .setColor('#ff5500');
          
          await gameMessage.edit({ embeds: [multiShotEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Mostrar turno del jugador nuevamente
          const turnEmbed = createTurnEmbed(true);
          await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
          return;
        }
        
        // Pasar turno a la CPU
        playerTurn = false;
        const cpuTurnEmbed = createTurnEmbed(false);
        await gameMessage.edit({ embeds: [cpuTurnEmbed], components: [] });
        
        // La CPU realiza su turno
        await cpuTurn();
      }
      
      if (action === 'skill') {
        // Usar habilidad seleccionada
        const index = parseInt(skillIndex);
        
        if (isNaN(index) || index < 0 || index >= playerSkills.length) {
          await i.reply({
            content: '❌ Habilidad no válida.',
            ephemeral: true
          });
          return;
        }
        
        const skill = playerSkills[index];
        
        // Eliminar la habilidad usada
        playerSkills.splice(index, 1);
        
        // Mostrar uso de habilidad
        const skillEmbed = new EmbedBuilder()
          .setTitle(`${skill.emoji} ¡USASTE UNA HABILIDAD!`)
          .setDescription(`
Has usado **${skill.name}**!
${skill.description}
          `)
          .setColor('#9900ff');
        
        await i.update({ embeds: [skillEmbed], components: [] });
        
        // Esperar un momento
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Aplicar efecto según la habilidad
        if (skill.name === 'Salto de turno') {
          // Si hay disparos pendientes, cancelarlos
          consecutiveShots = 0;
          
          // Pasar turno a la CPU
          playerTurn = false;
          const cpuTurnEmbed = createTurnEmbed(false);
          await gameMessage.edit({ embeds: [cpuTurnEmbed], components: [] });
          
          // La CPU realiza su turno
          await cpuTurn();
          return;
        }
        
        if (skill.name === 'Doble disparo') {
          // La CPU deberá disparar dos veces en su turno
          const doubleShotEmbed = new EmbedBuilder()
            .setTitle('🔄 ¡DOBLE DISPARO ACTIVADO!')
            .setDescription(`
Has activado Doble Disparo. La CPU deberá disparar dos veces seguidas en su próximo turno.
            `)
            .setColor('#ff5500');
          
          await gameMessage.edit({ embeds: [doubleShotEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Si hay disparos pendientes, el jugador debe completarlos
          if (consecutiveShots > 0) {
            const pendingEmbed = createTurnEmbed(true);
            await gameMessage.edit({ embeds: [pendingEmbed], components: createGameButtons(true) });
            return;
          }
          
          // Pasar turno a la CPU con doble disparo
          playerTurn = false;
          consecutiveShots = 2;  // La CPU tendrá que disparar dos veces
          const cpuTurnEmbed = createTurnEmbed(false);
          await gameMessage.edit({ embeds: [cpuTurnEmbed], components: [] });
          
          // La CPU realiza su turno
          await cpuTurn();
          return;
        }
        
        if (skill.name === 'Girar tambor') {
          // Mezclar el tambor aleatoriamente
          shuffleDrum();
          
          const shuffleEmbed = new EmbedBuilder()
            .setTitle('🔀 ¡TAMBOR MEZCLADO!')
            .setDescription(`
Has usado Girar Tambor. El tambor ha sido mezclado completamente.
            `)
            .setColor('#9900ff');
          
          await gameMessage.edit({ embeds: [shuffleEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Continuar con el turno del jugador
          const turnEmbed = createTurnEmbed(true);
          await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
          return;
        }
        
        if (skill.name === 'Intuición') {
          // Ver si la siguiente recámara tiene una bala
          const nextChamberHasBullet = chambers[currentChamber];
          
          const intuitionEmbed = new EmbedBuilder()
            .setTitle('👁️ ¡INTUICIÓN ACTIVADA!')
            .setDescription(`
Has usado tu intuición para ver la siguiente recámara.

**Recámara actual:** ${nextChamberHasBullet ? '💥 BALA' : '🟢 VACÍA'}
            `)
            .setColor('#9900ff');
          
          await gameMessage.edit({ embeds: [intuitionEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Continuar con el turno del jugador
          const turnEmbed = createTurnEmbed(true);
          await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
          return;
        }
        
        if (skill.name === 'Apuntar') {
          // 50% de probabilidad de evitar la bala
          const willAvoidBullet = Math.random() < 0.5;
          
          const aimEmbed = new EmbedBuilder()
            .setTitle('🎯 ¡APUNTANDO!')
            .setDescription(`
Has usado Apuntar. Tienes 50% de probabilidad de evitar una bala.

¿Quieres disparar ahora con esta protección?
            `)
            .setColor('#9900ff');
          
          // Botones para decidir si disparar con la protección o no
          const aimButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`rr:aimshoot:${profile._id}:${amount}`)
                .setLabel('DISPARAR CON PROTECCIÓN')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎯'),
              new ButtonBuilder()
                .setCustomId(`rr:cancel:${profile._id}:${amount}`)
                .setLabel('CANCELAR')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌')
            );
          
          await gameMessage.edit({ embeds: [aimEmbed], components: [aimButtons] });
          
          // Crear collector específico para esta decisión
          const aimFilter = j => {
            const [command, aimAction, aimProfileId] = j.customId.split(':');
            return command === 'rr' && ['aimshoot', 'cancel'].includes(aimAction) && 
                  aimProfileId === profile._id.toString() && 
                  j.user.id === (context.author ? context.author.id : context.user.id);
          };
          
          const aimCollector = gameMessage.createMessageComponentCollector({ 
            filter: aimFilter, 
            time: 30000,
            max: 1
          });
          
          aimCollector.on('collect', async j => {
            const [, aimAction] = j.customId.split(':');
            
            if (aimAction === 'cancel') {
              // Cancelar y devolver la habilidad
              playerSkills.push(skill);
              
              const cancelEmbed = new EmbedBuilder()
                .setTitle('❌ HABILIDAD CANCELADA')
                .setDescription(`
Has cancelado el uso de la habilidad Apuntar.
                `)
                .setColor('#999999');
              
              await j.update({ embeds: [cancelEmbed], components: [] });
              
              // Esperar un momento
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              // Continuar con el turno del jugador
              const turnEmbed = createTurnEmbed(true);
              await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
              return;
            }
            
            if (aimAction === 'aimshoot') {
              // Disparar con la protección de apuntar
              const hasBullet = chambers[currentChamber];
              
              if (hasBullet && willAvoidBullet) {
                // El jugador evita la bala
                const dodgeEmbed = new EmbedBuilder()
                  .setTitle('😎 ¡HAS EVITADO LA BALA!')
                  .setDescription(`
¡Has apuntado correctamente y has evitado la bala!

**Recámara:** 💥 BALA
                  `)
                  .setColor('#00cc44');
                
                await j.update({ embeds: [dodgeEmbed], components: [] });
                
                // Rotar el tambor para el siguiente disparo
                currentChamber = (currentChamber + 1) % chamberCount;
                
                // Esperar un momento
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Verificar si es un turno de disparo múltiple
                consecutiveShots--;
                if (consecutiveShots > 0) {
                  // Si aún quedan disparos pendientes, continuar con el turno del jugador
                  const multiShotEmbed = new EmbedBuilder()
                    .setTitle('🔄 ¡DISPARO ADICIONAL!')
                    .setDescription(`
Debido a la habilidad "Doble Disparo", debes disparar ${consecutiveShots} vez más.
                    `)
                    .setColor('#ff5500');
                  
                  await gameMessage.edit({ embeds: [multiShotEmbed], components: [] });
                  
                  // Esperar un momento
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Mostrar turno del jugador nuevamente
                  const turnEmbed = createTurnEmbed(true);
                  await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
                  return;
                }
                
                // Pasar turno a la CPU
                playerTurn = false;
                const cpuTurnEmbed = createTurnEmbed(false);
                await gameMessage.edit({ embeds: [cpuTurnEmbed], components: [] });
                
                // La CPU realiza su turno
                await cpuTurn();
                return;
              } else {
                // Si no evitó la bala o no había bala
                const shootResult = shoot();
                
                if (shootResult) {
                  // El jugador pierde (había bala y no la evitó)
                  gameActive = false;
                  
                  // Efectos visuales de derrota
                  const loseEffects = ['💥', '💀', '☠️', '😵', '💸'];
                  const randomEffects = Array(3).fill().map(() => loseEffects[Math.floor(Math.random() * loseEffects.length)]).join(' ');
                  
                  // Actualizar estadísticas
                  profile.stats.losses += 1;
                  
                  // Actualizar estadísticas si existe en inventario
                  if (profile.character.inventory) {
                    let rrStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Ruleta Rusa");
                    if (!rrStatsItem) {
                      profile.character.inventory.push({
                        item: "Estadísticas de Ruleta Rusa",
                        quantity: 1,
                        description: "Registro de tus partidas de Ruleta Rusa"
                      });
                      rrStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
                    }
                    
                    // Actualizar estadísticas
                    if (!rrStatsItem.metadata) {
                      rrStatsItem.metadata = {
                        gamesPlayed: 0,
                        wins: 0,
                        losses: 0,
                        cpuGames: 0,
                        pvpGames: 0
                      };
                    }
                    
                    rrStatsItem.metadata.gamesPlayed = (rrStatsItem.metadata.gamesPlayed || 0) + 1;
                    rrStatsItem.metadata.losses = (rrStatsItem.metadata.losses || 0) + 1;
                    rrStatsItem.metadata.cpuGames = (rrStatsItem.metadata.cpuGames || 0) + 1;
                    
                    // Actualizar descripción
                    rrStatsItem.description = `Estadísticas de Ruleta Rusa: ${rrStatsItem.metadata.wins}/${rrStatsItem.metadata.gamesPlayed} victorias`;
                  }
                  
                  await profile.save();
                  
                  const loseEmbed = new EmbedBuilder()
                    .setTitle(`${randomEffects} ¡HAS PERDIDO! ${randomEffects}`)
                    .setDescription(`
Has disparado y has perdido a pesar de intentar apuntar.

**Recámara:** 💥 BALA
**Perdiste:** ${amount} monedas
                    `)
                    .setColor('#ff0000')
                    .setFooter({ text: `Dificultad: ${difficulty}` });
                  
                  // Botones para jugar de nuevo
                  const playAgainButtons = new ActionRowBuilder()
                    .addComponents(
                      new ButtonBuilder()
                        .setCustomId(`rr:again:${profile._id}:${amount}:${difficulty}`)
                        .setLabel('🔄 JUGAR DE NUEVO')
                        .setStyle(ButtonStyle.Primary),
                      new ButtonBuilder()
                        .setCustomId(`rr:double:${profile._id}:${amount}:${difficulty}`)
                        .setLabel('💰 DOBLAR APUESTA')
                        .setStyle(ButtonStyle.Danger),
                      new ButtonBuilder()
                        .setCustomId(`rr:easier:${profile._id}:${amount}:${difficulty}`)
                        .setLabel('⬇️ REDUCIR DIFICULTAD')
                        .setStyle(ButtonStyle.Secondary)
                    );
                  
                  await j.update({ embeds: [loseEmbed], components: [playAgainButtons] });
                  collector.stop('lose');
                  return;
                } else {
                  // Sobreviviste (no había bala)
                  const survivedEmbed = new EmbedBuilder()
                    .setTitle('😅 ¡HAS SOBREVIVIDO!')
                    .setDescription(`
Has disparado y has sobrevivido.

**Recámara:** 🟢 VACÍA
                    `)
                    .setColor('#00cc44');
                  
                  await j.update({ embeds: [survivedEmbed], components: [] });
                  
                  // Esperar un momento
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Posibilidad de obtener habilidad aleatoria
                  if (Math.random() < skillProbability && playerSkills.length < 3) {
                    const newSkill = getRandomSkill();
                    playerSkills.push(newSkill);
                    
                    const skillEmbed = new EmbedBuilder()
                      .setTitle('🎁 ¡HAS OBTENIDO UNA HABILIDAD!')
                      .setDescription(`
Has obtenido: **${newSkill.name}** ${newSkill.emoji}
${newSkill.description}
                      `)
                      .setColor('#9900ff');
                    
                    await gameMessage.edit({ embeds: [skillEmbed], components: [] });
                    
                    // Esperar un momento
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  }
                  
                  // Verificar si es un turno de disparo múltiple
                  consecutiveShots--;
                  if (consecutiveShots > 0) {
                    // Si aún quedan disparos pendientes, continuar con el turno del jugador
                    const multiShotEmbed = new EmbedBuilder()
                      .setTitle('🔄 ¡DISPARO ADICIONAL!')
                      .setDescription(`
Debido a la habilidad "Doble Disparo", debes disparar ${consecutiveShots} vez más.
                      `)
                      .setColor('#ff5500');
                    
                    await gameMessage.edit({ embeds: [multiShotEmbed], components: [] });
                    
                    // Esperar un momento
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Mostrar turno del jugador nuevamente
                    const turnEmbed = createTurnEmbed(true);
                    await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
                    return;
                  }
                  
                  // Pasar turno a la CPU
                  playerTurn = false;
                  const cpuTurnEmbed = createTurnEmbed(false);
                  await gameMessage.edit({ embeds: [cpuTurnEmbed], components: [] });
                  
                  // La CPU realiza su turno
                  await cpuTurn();
                }
              }
            }
          });
          
          aimCollector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0 && gameActive) {
              // Si el tiempo expiró y no tomaste una decisión, se cancela la habilidad
              playerSkills.push(skill); // Devolver la habilidad
              
              const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ TIEMPO AGOTADO')
                .setDescription(`
No tomaste una decisión a tiempo. Se cancela el uso de la habilidad Apuntar.
                `)
                .setColor('#999999');
              
              await gameMessage.edit({ embeds: [timeoutEmbed], components: [] });
              
              // Esperar un momento
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              // Continuar con el turno del jugador
              const turnEmbed = createTurnEmbed(true);
              await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(true) });
            }
          });
        }
      }
    });
    
    // Si se acaba el tiempo del collector
    collector.on('end', async (collected, reason) => {
      if (gameActive && reason !== 'lose') {
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
  async startPlayerVsPlayerGame(context, opponent, amount, playerProfile, opponentProfile) {
    // Configuración del juego
    const chamberCount = 6; // Revólver clásico de 6 balas
    const bulletsCount = 1; // Una sola bala
    
    // Estado del juego
    let chambers = Array(chamberCount).fill(false); // false = vacío, true = bala
    let currentChamber = 0;
    let currentTurn = 0; // 0 = jugador que inició, 1 = oponente
    let gameActive = true;
    let consecutiveShots = [1, 1]; // Número de disparos consecutivos para cada jugador
    
    // Cargar la bala en una posición aleatoria
    const bulletPosition = Math.floor(Math.random() * chamberCount);
    chambers[bulletPosition] = true;
    
    // Mezclar el tambor
    let shuffleAmount = Math.floor(Math.random() * 10) + 5; // Entre 5 y 14 rotaciones
    for (let i = 0; i < shuffleAmount; i++) {
      chambers.unshift(chambers.pop()); // Rotar el tambor
    }
    
    // Habilidades especiales disponibles
    const skillTypes = [
      { name: 'Salto de turno', description: 'Pasas tu turno al oponente', emoji: '⏭️' },
      { name: 'Doble disparo', description: 'Tu oponente debe disparar dos veces seguidas', emoji: '🔄' },
      { name: 'Girar tambor', description: 'El tambor se mezcla nuevamente', emoji: '🔀' },
      { name: 'Intuición', description: 'Puedes ver si la siguiente recámara tiene una bala', emoji: '👁️' },
      { name: 'Apuntar', description: '50% de probabilidad de apuntar a un lado y evitar la bala', emoji: '🎯' }
    ];
    
    // Probabilidad de obtener una habilidad en cada turno
    const skillProbability = 0.3; // 30% de probabilidad
    
    // Habilidades activas para cada jugador
    let playersSkills = [[], []]; // [jugador iniciador, oponente]
    
    // Función para obtener una habilidad aleatoria
    const getRandomSkill = () => {
      return skillTypes[Math.floor(Math.random() * skillTypes.length)];
    };
    
    // Función para rotar el tambor
    function rotateDrum() {
      chambers.unshift(chambers.pop());
    }
    
    // Función para mezclar completamente el tambor
    function shuffleDrum() {
      for (let i = chambers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chambers[i], chambers[j]] = [chambers[j], chambers[i]];
      }
      currentChamber = 0;
    }
    
    // Crear botones del juego
    const createGameButtons = (playerIndex) => {
      const rows = [];
      
      // Fila para disparar
      const mainRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`pvp:shoot:${playerIndex}:${amount}`)
            .setLabel('DISPARAR')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔫')
        );
      
      rows.push(mainRow);
      
      // Fila para habilidades si el jugador tiene alguna
      if (playersSkills[playerIndex].length > 0) {
        const skillRow = new ActionRowBuilder();
        
        for (let i = 0; i < Math.min(playersSkills[playerIndex].length, 5); i++) {
          skillRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`pvp:skill:${playerIndex}:${amount}:${i}`)
              .setLabel(playersSkills[playerIndex][i].name)
              .setStyle(ButtonStyle.Success)
              .setEmoji(playersSkills[playerIndex][i].emoji)
          );
        }
        
        rows.push(skillRow);
      }
      
      return rows;
    };
    
    // Función para obtener el perfil y usuario según el índice
    const getPlayerData = (index) => {
      if (index === 0) {
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
    
    // Crear embed para mostrar el turno actual
    const createTurnEmbed = (playerIndex) => {
      const currentPlayer = getPlayerData(playerIndex);
      const otherPlayer = getPlayerData(playerIndex === 0 ? 1 : 0);
      
      return new EmbedBuilder()
        .setTitle(`🔫 TURNO DE ${currentPlayer.user.username.toUpperCase()}`)
        .setDescription(`
Es el turno de ${currentPlayer.user}.
${consecutiveShots[playerIndex] > 1 ? `\n**¡Debes disparar ${consecutiveShots[playerIndex]} veces!**` : ''}

**Apuesta:** ${amount} monedas cada uno (Total: ${amount * 2} monedas)
**Tambor:** ${chamberCount} recámaras, ${bulletsCount} bala(s)
**Jugadores:** ${getPlayerData(0).user} vs ${getPlayerData(1).user}
${playersSkills[playerIndex].length > 0 ? `**Habilidades disponibles:** ${playersSkills[playerIndex].map(s => s.emoji).join(' ')}` : ''}
        `)
        .setColor('#ff5500')
        .setFooter({ text: `Juega con cuidado` });
    };
    
    // Función para disparar
    const shoot = () => {
      const hasBullet = chambers[currentChamber];
      
      // Rotar el tambor para el siguiente disparo
      currentChamber = (currentChamber + 1) % chamberCount;
      
      return hasBullet;
    };
    
    // Enviar mensaje inicial
    const initialEmbed = new EmbedBuilder()
      .setTitle('🔫 RULETA RUSA - JUGADOR VS JUGADOR 🔫')
      .setDescription(`
¡Bienvenidos al juego de la Ruleta Rusa!

**Jugadores:** ${getPlayerData(0).user} vs ${getPlayerData(1).user}
**Apuesta:** ${amount} monedas cada uno (Total: ${amount * 2} monedas)
**Tambor:** ${chamberCount} recámaras, ${bulletsCount} bala(s)

El revólver se ha cargado y el tambor se ha mezclado.
¡Que comience el duelo!
      `)
      .addFields(
        { name: '💡 INSTRUCCIONES', value: 
          `- Por turnos, cada jugador deberá disparar el revólver.\n` +
          `- Si te toca una bala, pierdes la partida y la apuesta.\n` +
          `- Durante el juego podrás obtener habilidades especiales.\n` +
          `- Usa tus habilidades estratégicamente para sobrevivir.`
        }
      )
      .setColor('#ff5500');
    
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed] }) 
      : await context.reply({ embeds: [initialEmbed] });
    
    // Esperar un momento para dar dramatismo
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Comenzar el juego con el primer turno
    let firstTurnEmbed = createTurnEmbed(currentTurn);
    await gameMessage.edit({ embeds: [firstTurnEmbed], components: createGameButtons(currentTurn) });
    
    // Crear collector para las interacciones
    const filter = i => {
      const [command, action, playerIndex] = i.customId.split(':');
      const playerData = getPlayerData(parseInt(playerIndex));
      
      return command === 'pvp' && 
             parseInt(playerIndex) === currentTurn && 
             i.user.id === playerData.user.id;
    };
    
    const collector = gameMessage.createMessageComponentCollector({ 
      filter, 
      time: 180000 
    });
    
    // Procesar interacciones
    collector.on('collect', async i => {
      const [, action, playerIndex, , skillIndex] = i.customId.split(':');
      const currentPlayerIndex = parseInt(playerIndex);
      const currentPlayer = getPlayerData(currentPlayerIndex);
      const nextPlayerIndex = (currentPlayerIndex + 1) % 2;
      const nextPlayer = getPlayerData(nextPlayerIndex);
      
      if (!gameActive) {
        // Si el juego ya terminó, procesar solo botones de "jugar de nuevo"
        if (action === 'rematch') {
          // Mostrar mensaje de invitación a revancha al otro jugador
          const rematchButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`pvp:acceptRematch:${nextPlayerIndex}:${amount}`)
                .setLabel('ACEPTAR REVANCHA')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
              new ButtonBuilder()
                .setCustomId(`pvp:declineRematch:${nextPlayerIndex}:${amount}`)
                .setLabel('RECHAZAR')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
            );
          
          const rematchEmbed = new EmbedBuilder()
            .setTitle('🔄 PETICIÓN DE REVANCHA')
            .setDescription(`
${currentPlayer.user} solicita una revancha con ${nextPlayer.user}.

**Apuesta:** ${amount} monedas

¿Aceptas la revancha?
            `)
            .setColor('#ff5500')
            .setFooter({ text: 'La petición expira en 60 segundos' });
          
          await i.update({ embeds: [rematchEmbed], components: [rematchButtons] });
          
          // Crear collector para la respuesta a la revancha
          const rematchFilter = j => {
            const [command, rematchAction, rematchPlayerIndex] = j.customId.split(':');
            return command === 'pvp' && 
                  ['acceptRematch', 'declineRematch'].includes(rematchAction) && 
                  parseInt(rematchPlayerIndex) === nextPlayerIndex && 
                  j.user.id === nextPlayer.user.id;
          };
          
          const rematchCollector = gameMessage.createMessageComponentCollector({ 
            filter: rematchFilter, 
            time: 60000,
            max: 1
          });
          
          rematchCollector.on('collect', async j => {
            const [, rematchAction] = j.customId.split(':');
            
            if (rematchAction === 'declineRematch') {
              // Revancha rechazada
              const declineEmbed = new EmbedBuilder()
                .setTitle('❌ REVANCHA RECHAZADA')
                .setDescription(`
${nextPlayer.user} ha rechazado la petición de revancha.
                `)
                .setColor('#ff0000');
              
              await j.update({ embeds: [declineEmbed], components: [] });
              return;
            }
            
            if (rematchAction === 'acceptRematch') {
              // Revancha aceptada - Verificar una última vez los saldos
              const updatedProfileA = await Profile.findById(playerProfile._id);
              const updatedProfileB = await Profile.findById(opponentProfile._id);
              
              if (updatedProfileA.character.currency < amount || updatedProfileB.character.currency < amount) {
                await j.reply({ 
                  content: `❌ Uno de los jugadores ya no tiene suficientes monedas para la apuesta.`,
                  ephemeral: true
                });
                return;
              }
              
              // Restar las monedas de la apuesta a ambos jugadores
              updatedProfileA.character.currency -= amount;
              updatedProfileB.character.currency -= amount;
              
              await updatedProfileA.save();
              await updatedProfileB.save();
              
              // Iniciar nueva partida
              await j.update({ 
                content: '🔫 ¡Revancha aceptada! Comenzando nueva partida...',
                embeds: [], 
                components: [] 
              });
              
              // Aleatorizar quién comienza
              const startingPlayer = Math.random() < 0.5 ? 0 : 1;
              
              if (startingPlayer === 0) {
                this.startPlayerVsPlayerGame(context, opponent, amount, updatedProfileA, updatedProfileB);
              } else {
                // Si el oponente comienza, invertimos los roles
                this.startPlayerVsPlayerGame(context, getPlayerData(0).user, amount, updatedProfileB, updatedProfileA);
              }
            }
          });
          
          rematchCollector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
              // Tiempo expirado sin respuesta
              const expiredEmbed = new EmbedBuilder()
                .setTitle('⏰ PETICIÓN EXPIRADA')
                .setDescription(`
${nextPlayer.user} no respondió a la petición de revancha a tiempo.
                `)
                .setColor('#999999');
              
              await gameMessage.edit({ embeds: [expiredEmbed], components: [] });
            }
          });
        }
        
        return;
      }
      
      if (action === 'shoot') {
        // El jugador dispara
        const shootEmbed = new EmbedBuilder()
          .setTitle('🔫 DISPARANDO')
          .setDescription(`
${currentPlayer.user} toma el revólver, apunta a su cabeza y aprieta el gatillo...
          `)
          .setColor('#ff5500');
        
        await i.update({ embeds: [shootEmbed], components: [] });
        
        // Esperar un momento para dar dramatismo
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        // Realizar el disparo
        const hasBullet = shoot();
        
        if (hasBullet) {
          // El jugador pierde
          gameActive = false;
          
          // Efectos visuales de derrota
          const loseEffects = ['💥', '💀', '☠️', '😵', '💸'];
          const randomEffects = Array(3).fill().map(() => loseEffects[Math.floor(Math.random() * loseEffects.length)]).join(' ');
          
          // El oponente gana la apuesta del jugador
          nextPlayer.profile.character.currency += amount * 2;
          nextPlayer.profile.stats.wins += 1;
          currentPlayer.profile.stats.losses += 1;
          
          // Actualizar estadísticas si existe en inventario
          // Para el ganador
          if (nextPlayer.profile.character.inventory) {
            let rrStatsItem = nextPlayer.profile.character.inventory.find(item => item.item === "Estadísticas de Ruleta Rusa");
            if (!rrStatsItem) {
              nextPlayer.profile.character.inventory.push({
                item: "Estadísticas de Ruleta Rusa",
                quantity: 1,
                description: "Registro de tus partidas de Ruleta Rusa"
              });
              rrStatsItem = nextPlayer.profile.character.inventory[nextPlayer.profile.character.inventory.length - 1];
            }
            
            // Inicializar metadatos si no existen
            if (!rrStatsItem.metadata) {
              rrStatsItem.metadata = {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                cpuGames: 0,
                pvpGames: 0,
                biggestWin: 0
              };
            }
            
            // Actualizar estadísticas
            rrStatsItem.metadata.gamesPlayed = (rrStatsItem.metadata.gamesPlayed || 0) + 1;
            rrStatsItem.metadata.wins = (rrStatsItem.metadata.wins || 0) + 1;
            rrStatsItem.metadata.pvpGames = (rrStatsItem.metadata.pvpGames || 0) + 1;
            
            // Actualizar mayor victoria
            if (amount > (rrStatsItem.metadata.biggestWin || 0)) {
              rrStatsItem.metadata.biggestWin = amount;
            }
            
            // Actualizar descripción
            rrStatsItem.description = `Estadísticas de Ruleta Rusa: ${rrStatsItem.metadata.wins}/${rrStatsItem.metadata.gamesPlayed} victorias`;
          }
          
          // Para el perdedor
          if (currentPlayer.profile.character.inventory) {
            let rrStatsItem = currentPlayer.profile.character.inventory.find(item => item.item === "Estadísticas de Ruleta Rusa");
            if (!rrStatsItem) {
              currentPlayer.profile.character.inventory.push({
                item: "Estadísticas de Ruleta Rusa",
                quantity: 1,
                description: "Registro de tus partidas de Ruleta Rusa"
              });
              rrStatsItem = currentPlayer.profile.character.inventory[currentPlayer.profile.character.inventory.length - 1];
            }
            
            // Inicializar metadatos si no existen
            if (!rrStatsItem.metadata) {
              rrStatsItem.metadata = {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                cpuGames: 0,
                pvpGames: 0,
                biggestWin: 0
              };
            }
            
            // Actualizar estadísticas
            rrStatsItem.metadata.gamesPlayed = (rrStatsItem.metadata.gamesPlayed || 0) + 1;
            rrStatsItem.metadata.losses = (rrStatsItem.metadata.losses || 0) + 1;
            rrStatsItem.metadata.pvpGames = (rrStatsItem.metadata.pvpGames || 0) + 1;
            
            // Actualizar descripción
            rrStatsItem.description = `Estadísticas de Ruleta Rusa: ${rrStatsItem.metadata.wins}/${rrStatsItem.metadata.gamesPlayed} victorias`;
          }
          
          await Promise.all([
            nextPlayer.profile.save(),
            currentPlayer.profile.save()
          ]);
          
          const loseEmbed = new EmbedBuilder()
            .setTitle(`${randomEffects} ¡DISPARO FATAL! ${randomEffects}`)
            .setDescription(`
${currentPlayer.user} ha disparado y ha perdido.

**Recámara:** 💥 BALA
**Ganador:** ${nextPlayer.user}
**Premio:** ${amount * 2} monedas
            `)
            .setColor('#ff0000')
            .setFooter({ text: 'La partida ha terminado' });
          
          // Botones para jugar de nuevo
          const playAgainButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`pvp:rematch:${currentPlayerIndex}:${amount}`)
                .setLabel('🔄 REVANCHA')
                .setStyle(ButtonStyle.Primary)
            );
          
          await gameMessage.edit({ embeds: [loseEmbed], components: [playAgainButtons] });
          collector.stop('lose');
          return;
        }
        
        // Si el jugador sobrevive, mostrar resultado
        const survivedEmbed = new EmbedBuilder()
          .setTitle('😅 ¡SOBREVIVISTE!')
          .setDescription(`
${currentPlayer.user} ha disparado y ha sobrevivido.

**Recámara:** 🟢 VACÍA
          `)
          .setColor('#00cc44');
        
        await gameMessage.edit({ embeds: [survivedEmbed], components: [] });
        
        // Esperar un momento
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Posibilidad de obtener habilidad aleatoria
        if (Math.random() < skillProbability && playersSkills[currentPlayerIndex].length < 3) {
          const newSkill = getRandomSkill();
          playersSkills[currentPlayerIndex].push(newSkill);
          
          const skillEmbed = new EmbedBuilder()
            .setTitle('🎁 ¡HABILIDAD OBTENIDA!')
            .setDescription(`
${currentPlayer.user} ha obtenido: **${newSkill.name}** ${newSkill.emoji}
${newSkill.description}
            `)
            .setColor('#9900ff');
          
          await gameMessage.edit({ embeds: [skillEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Verificar si es un turno de disparo múltiple
        consecutiveShots[currentPlayerIndex]--;
        if (consecutiveShots[currentPlayerIndex] > 0) {
          // Si aún quedan disparos pendientes, continuar con el turno del jugador
          const multiShotEmbed = new EmbedBuilder()
            .setTitle('🔄 ¡DISPARO ADICIONAL!')
            .setDescription(`
Debido a la habilidad "Doble Disparo", ${currentPlayer.user} debe disparar ${consecutiveShots[currentPlayerIndex]} vez más.
            `)
            .setColor('#ff5500');
          
          await gameMessage.edit({ embeds: [multiShotEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Mostrar turno del jugador nuevamente
          const turnEmbed = createTurnEmbed(currentPlayerIndex);
          await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(currentPlayerIndex) });
          return;
        }
        
        // Pasar turno al otro jugador
        currentTurn = nextPlayerIndex;
        const nextTurnEmbed = createTurnEmbed(nextPlayerIndex);
        await gameMessage.edit({ embeds: [nextTurnEmbed], components: createGameButtons(nextPlayerIndex) });
      }
      
      if (action === 'skill') {
        // Usar habilidad seleccionada
        const index = parseInt(skillIndex);
        
        if (isNaN(index) || index < 0 || index >= playersSkills[currentPlayerIndex].length) {
          await i.reply({
            content: '❌ Habilidad no válida.',
            ephemeral: true
          });
          return;
        }
        
        const skill = playersSkills[currentPlayerIndex][index];
        
        // Eliminar la habilidad usada
        playersSkills[currentPlayerIndex].splice(index, 1);
        
        // Mostrar uso de habilidad
        const skillEmbed = new EmbedBuilder()
          .setTitle(`${skill.emoji} ¡HABILIDAD USADA!`)
          .setDescription(`
${currentPlayer.user} ha usado **${skill.name}**!
${skill.description}
          `)
          .setColor('#9900ff');
        
        await i.update({ embeds: [skillEmbed], components: [] });
        
        // Esperar un momento
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Aplicar efecto según la habilidad
        if (skill.name === 'Salto de turno') {
          // Si hay disparos pendientes, cancelarlos
          consecutiveShots[currentPlayerIndex] = 1;
          
          // Pasar turno al otro jugador
          currentTurn = nextPlayerIndex;
          const nextTurnEmbed = createTurnEmbed(nextPlayerIndex);
          await gameMessage.edit({ embeds: [nextTurnEmbed], components: createGameButtons(nextPlayerIndex) });
          return;
        }
        
        if (skill.name === 'Doble disparo') {
          // El otro jugador deberá disparar dos veces en su turno
          const doubleShotEmbed = new EmbedBuilder()
            .setTitle('🔄 ¡DOBLE DISPARO ACTIVADO!')
            .setDescription(`
${currentPlayer.user} ha activado Doble Disparo. ${nextPlayer.user} deberá disparar dos veces seguidas en su próximo turno.
            `)
            .setColor('#ff5500');
          
          await gameMessage.edit({ embeds: [doubleShotEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Si hay disparos pendientes, el jugador actual debe completarlos
          if (consecutiveShots[currentPlayerIndex] > 0) {
            const pendingEmbed = createTurnEmbed(currentPlayerIndex);
            await gameMessage.edit({ embeds: [pendingEmbed], components: createGameButtons(currentPlayerIndex) });
            return;
          }
          
          // Pasar turno al otro jugador con doble disparo
          currentTurn = nextPlayerIndex;
          consecutiveShots[nextPlayerIndex] = 2;  // El otro jugador tendrá que disparar dos veces
          const nextTurnEmbed = createTurnEmbed(nextPlayerIndex);
          await gameMessage.edit({ embeds: [nextTurnEmbed], components: createGameButtons(nextPlayerIndex) });
          return;
        }
        
        if (skill.name === 'Girar tambor') {
          // Mezclar el tambor aleatoriamente
          shuffleDrum();
          
          const shuffleEmbed = new EmbedBuilder()
            .setTitle('🔀 ¡TAMBOR MEZCLADO!')
            .setDescription(`
${currentPlayer.user} ha usado Girar Tambor. El tambor ha sido mezclado completamente.
            `)
            .setColor('#9900ff');
          
          await gameMessage.edit({ embeds: [shuffleEmbed], components: [] });
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Continuar con el turno del jugador actual
          const turnEmbed = createTurnEmbed(currentPlayerIndex);
          await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(currentPlayerIndex) });
          return;
        }
        
        if (skill.name === 'Intuición') {
          // Ver si la siguiente recámara tiene una bala
          const nextChamberHasBullet = chambers[currentChamber];
          
          const intuitionEmbed = new EmbedBuilder()
            .setTitle('👁️ ¡INTUICIÓN ACTIVADA!')
            .setDescription(`
${currentPlayer.user} ha usado su intuición para ver la siguiente recámara.
            `)
            .setColor('#9900ff');
          
          await gameMessage.edit({ embeds: [intuitionEmbed], components: [] });
          
          // Enviar mensaje privado al jugador con la información
          try {
            await currentPlayer.user.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle('👁️ RESULTADO DE INTUICIÓN')
                  .setDescription(`
Has usado tu intuición en la partida de Ruleta Rusa.

**Recámara actual:** ${nextChamberHasBullet ? '💥 BALA' : '🟢 VACÍA'}

Esta información solo es visible para ti.
                  `)
                  .setColor('#9900ff')
              ]
            });
          } catch (error) {
            // Si no se puede enviar DM, mostrar un mensaje en el canal
            await gameMessage.channel.send({
              content: `⚠️ No se pudo enviar un mensaje privado a ${currentPlayer.user}. Asegúrate de tener habilitados los mensajes directos.`,
              ephemeral: true
            });
          }
          
          // Esperar un momento
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Continuar con el turno del jugador actual
          const turnEmbed = createTurnEmbed(currentPlayerIndex);
          await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(currentPlayerIndex) });
          return;
        }
        
        if (skill.name === 'Apuntar') {
          // 50% de probabilidad de evitar la bala
          const willAvoidBullet = Math.random() < 0.5;
          
          const aimEmbed = new EmbedBuilder()
            .setTitle('🎯 ¡APUNTANDO!')
            .setDescription(`
${currentPlayer.user} ha usado Apuntar. Tiene 50% de probabilidad de evitar una bala.

¿Quieres disparar ahora con esta protección?
            `)
            .setColor('#9900ff');
          
          // Botones para decidir si disparar con la protección o no
          const aimButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`pvp:aimshoot:${currentPlayerIndex}:${amount}`)
                .setLabel('DISPARAR CON PROTECCIÓN')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎯'),
              new ButtonBuilder()
                .setCustomId(`pvp:cancel:${currentPlayerIndex}:${amount}`)
                .setLabel('CANCELAR')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌')
            );
          
          await gameMessage.edit({ embeds: [aimEmbed], components: [aimButtons] });
          
          // Crear collector específico para esta decisión
          const aimFilter = j => {
            const [command, aimAction, aimPlayerIndex] = j.customId.split(':');
            return command === 'pvp' && ['aimshoot', 'cancel'].includes(aimAction) && 
                  parseInt(aimPlayerIndex) === currentPlayerIndex && 
                  j.user.id === currentPlayer.user.id;
          };
          
          const aimCollector = gameMessage.createMessageComponentCollector({ 
            filter: aimFilter, 
            time: 30000,
            max: 1
          });
          
          aimCollector.on('collect', async j => {
            const [, aimAction] = j.customId.split(':');
            
            if (aimAction === 'cancel') {
              // Cancelar y devolver la habilidad
              playersSkills[currentPlayerIndex].push(skill);
              
              const cancelEmbed = new EmbedBuilder()
                .setTitle('❌ HABILIDAD CANCELADA')
                .setDescription(`
${currentPlayer.user} ha cancelado el uso de la habilidad Apuntar.
                `)
                .setColor('#999999');
              
              await j.update({ embeds: [cancelEmbed], components: [] });
              
              // Esperar un momento
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              // Continuar con el turno del jugador
              const turnEmbed = createTurnEmbed(currentPlayerIndex);
              await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(currentPlayerIndex) });
              return;
            }
            
            if (aimAction === 'aimshoot') {
              // Disparar con la protección de apuntar
              const hasBullet = chambers[currentChamber];
              
              if (hasBullet && willAvoidBullet) {
                // El jugador evita la bala
                const dodgeEmbed = new EmbedBuilder()
                  .setTitle('😎 ¡BALA ESQUIVADA!')
                  .setDescription(`
¡${currentPlayer.user} ha apuntado correctamente y ha evitado la bala!

**Recámara:** 💥 BALA
                  `)
                  .setColor('#00cc44');
                
                await j.update({ embeds: [dodgeEmbed], components: [] });
                
                // Rotar el tambor para el siguiente disparo
                currentChamber = (currentChamber + 1) % chamberCount;
                
                // Esperar un momento
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Verificar si es un turno de disparo múltiple
                consecutiveShots[currentPlayerIndex]--;
                if (consecutiveShots[currentPlayerIndex] > 0) {
                  // Si aún quedan disparos pendientes, continuar con el turno del jugador
                  const multiShotEmbed = new EmbedBuilder()
                    .setTitle('🔄 ¡DISPARO ADICIONAL!')
                    .setDescription(`
Debido a la habilidad "Doble Disparo", ${currentPlayer.user} debe disparar ${consecutiveShots[currentPlayerIndex]} vez más.
                    `)
                    .setColor('#ff5500');
                  
                  await gameMessage.edit({ embeds: [multiShotEmbed], components: [] });
                  
                  // Esperar un momento
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Mostrar turno del jugador nuevamente
                  const turnEmbed = createTurnEmbed(currentPlayerIndex);
                  await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(currentPlayerIndex) });
                  return;
                }
                
                // Pasar turno al otro jugador
                currentTurn = nextPlayerIndex;
                const nextTurnEmbed = createTurnEmbed(nextPlayerIndex);
                await gameMessage.edit({ embeds: [nextTurnEmbed], components: createGameButtons(nextPlayerIndex) });
                return;
              } else {
                // Si no evitó la bala o no había bala
                const shootResult = shoot();
                
                if (shootResult) {
                  // El jugador pierde (había bala y no la evitó)
                  gameActive = false;
                  
                  // Efectos visuales de derrota
                  const loseEffects = ['💥', '💀', '☠️', '😵', '💸'];
                  const randomEffects = Array(3).fill().map(() => loseEffects[Math.floor(Math.random() * loseEffects.length)]).join(' ');
                  
                  // El oponente gana la apuesta del jugador
                  nextPlayer.profile.character.currency += amount * 2;
                  nextPlayer.profile.stats.wins += 1;
                  currentPlayer.profile.stats.losses += 1;
                  
                  // Actualizar estadísticas si existe en inventario
                  updatePlayerStats(nextPlayer.profile, true); // Ganador
                  updatePlayerStats(currentPlayer.profile, false); // Perdedor
                  
                  await Promise.all([
                    nextPlayer.profile.save(),
                    currentPlayer.profile.save()
                  ]);
                  
                  const loseEmbed = new EmbedBuilder()
                    .setTitle(`${randomEffects} ¡DISPARO FATAL! ${randomEffects}`)
                    .setDescription(`
${currentPlayer.user} ha disparado con protección pero ha fallado y ha perdido.

**Recámara:** 💥 BALA
**Ganador:** ${nextPlayer.user}
**Premio:** ${amount * 2} monedas
                    `)
                    .setColor('#ff0000')
                    .setFooter({ text: 'La partida ha terminado' });
                  
                  // Botones para jugar de nuevo
                  const playAgainButtons = new ActionRowBuilder()
                    .addComponents(
                      new ButtonBuilder()
                        .setCustomId(`pvp:rematch:${currentPlayerIndex}:${amount}`)
                        .setLabel('🔄 REVANCHA')
                        .setStyle(ButtonStyle.Primary)
                    );
                  
                  await j.update({ embeds: [loseEmbed], components: [playAgainButtons] });
                  collector.stop('lose');
                  return;
                } else {
                  // Sobreviviste (no había bala)
                  const survivedEmbed = new EmbedBuilder()
                    .setTitle('😅 ¡SOBREVIVISTE!')
                    .setDescription(`
${currentPlayer.user} ha disparado y ha sobrevivido.

**Recámara:** 🟢 VACÍA
                    `)
                    .setColor('#00cc44');
                  
                  await j.update({ embeds: [survivedEmbed], components: [] });
                  
                  // Esperar un momento
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Posibilidad de obtener habilidad aleatoria
                  if (Math.random() < skillProbability && playersSkills[currentPlayerIndex].length < 3) {
                    const newSkill = getRandomSkill();
                    playersSkills[currentPlayerIndex].push(newSkill);
                    
                    const skillEmbed = new EmbedBuilder()
                      .setTitle('🎁 ¡HABILIDAD OBTENIDA!')
                      .setDescription(`
${currentPlayer.user} ha obtenido: **${newSkill.name}** ${newSkill.emoji}
${newSkill.description}
                      `)
                      .setColor('#9900ff');
                    
                    await gameMessage.edit({ embeds: [skillEmbed], components: [] });
                    
                    // Esperar un momento
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  }
                  
                  // Verificar si es un turno de disparo múltiple
                  consecutiveShots[currentPlayerIndex]--;
                  if (consecutiveShots[currentPlayerIndex] > 0) {
                    // Si aún quedan disparos pendientes, continuar con el turno del jugador
                    const multiShotEmbed = new EmbedBuilder()
                      .setTitle('🔄 ¡DISPARO ADICIONAL!')
                      .setDescription(`
Debido a la habilidad "Doble Disparo", ${currentPlayer.user} debe disparar ${consecutiveShots[currentPlayerIndex]} vez más.
                      `)
                      .setColor('#ff5500');
                    
                    await gameMessage.edit({ embeds: [multiShotEmbed], components: [] });
                    
                    // Esperar un momento
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Mostrar turno del jugador nuevamente
                    const turnEmbed = createTurnEmbed(currentPlayerIndex);
                    await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(currentPlayerIndex) });
                    return;
                  }
                  
                  // Pasar turno al otro jugador
                  currentTurn = nextPlayerIndex;
                  const nextTurnEmbed = createTurnEmbed(nextPlayerIndex);
                  await gameMessage.edit({ embeds: [nextTurnEmbed], components: createGameButtons(nextPlayerIndex) });
                }
              }
            }
          });
          
          aimCollector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0 && gameActive) {
              // Si el tiempo expiró y no tomaste una decisión, se cancela la habilidad
              playersSkills[currentPlayerIndex].push(skill); // Devolver la habilidad
              
              const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ TIEMPO AGOTADO')
                .setDescription(`
${currentPlayer.user} no tomó una decisión a tiempo. Se cancela el uso de la habilidad Apuntar.
                `)
                .setColor('#999999');
              
              await gameMessage.edit({ embeds: [timeoutEmbed], components: [] });
              
              // Esperar un momento
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              // Continuar con el turno del jugador
              const turnEmbed = createTurnEmbed(currentPlayerIndex);
              await gameMessage.edit({ embeds: [turnEmbed], components: createGameButtons(currentPlayerIndex) });
            }
          });
        }
      }
    });
    
    // Función para actualizar estadísticas de jugadores
    function updatePlayerStats(profile, isWinner) {
      if (profile.character.inventory) {
        let rrStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Ruleta Rusa");
        if (!rrStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Ruleta Rusa",
            quantity: 1,
            description: "Registro de tus partidas de Ruleta Rusa"
          });
          rrStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!rrStatsItem.metadata) {
          rrStatsItem.metadata = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            cpuGames: 0,
            pvpGames: 0,
            biggestWin: 0
          };
        }
        
        // Actualizar estadísticas
        rrStatsItem.metadata.gamesPlayed = (rrStatsItem.metadata.gamesPlayed || 0) + 1;
        rrStatsItem.metadata.pvpGames = (rrStatsItem.metadata.pvpGames || 0) + 1;
        
        if (isWinner) {
          rrStatsItem.metadata.wins = (rrStatsItem.metadata.wins || 0) + 1;
          // Actualizar mayor victoria
          if (amount > (rrStatsItem.metadata.biggestWin || 0)) {
            rrStatsItem.metadata.biggestWin = amount;
          }
        } else {
          rrStatsItem.metadata.losses = (rrStatsItem.metadata.losses || 0) + 1;
        }
        
        // Actualizar descripción
        rrStatsItem.description = `Estadísticas de Ruleta Rusa: ${rrStatsItem.metadata.wins}/${rrStatsItem.metadata.gamesPlayed} victorias`;
      }
    }
    
    // Si se acaba el tiempo del collector
    collector.on('end', async (collected, reason) => {
      if (gameActive && reason !== 'lose') {
        // Si el juego sigue activo y no terminó por una acción del usuario, considerarlo como un empate
        gameActive = false;
        
        // Devolver las monedas apostadas a ambos jugadores
        playerProfile.character.currency += amount;
        opponentProfile.character.currency += amount;
        
        await Promise.all([
          playerProfile.save(),
          opponentProfile.save()
        ]);
        
        const timeoutEmbed = new EmbedBuilder()
          .setTitle('⏰ TIEMPO AGOTADO')
          .setDescription(`
Se acabó el tiempo para tomar una decisión.
Por seguridad, la partida ha sido cancelada y se devuelven las apuestas.

**Apuestas devueltas:** ${amount} monedas a cada jugador
          `)
          .setColor('#ff9900');
        
        try {
          await gameMessage.edit({ embeds: [timeoutEmbed], components: [] });
        } catch (err) {
          // Ignorar errores al editar mensajes antiguos
        }
      }
    });
  }
};