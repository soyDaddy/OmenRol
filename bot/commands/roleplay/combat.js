const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Profile = require('../../../models/Profile');
const Server = require('../../../models/Server');
const Combat = require('../../../models/Combat');
const Enemy = require('../../../models/Enemy');
const Item = require('../../../models/Items');
const CombatService = require('../../../services/combatService');

module.exports = {
  name: 'combate',
  aliases: ['combat', 'luchar', 'battle'],
  description: 'Inicia un combate contra enemigos o monstruos',
  category: 'roleplay',
  cooldown: 20,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('combate')
    .setDescription('Sistema de combate por turnos')
    .addSubcommand(subcommand =>
      subcommand
        .setName('iniciar')
        .setDescription('Inicia un nuevo combate')
        .addStringOption(option => 
          option.setName('dificultad')
          .setDescription('Nivel de dificultad del combate')
          .setRequired(false)
          .addChoices(
            { name: 'Fácil', value: 'easy' },
            { name: 'Media', value: 'medium' },
            { name: 'Difícil', value: 'hard' },
            { name: 'Extrema', value: 'extreme' }
          ))
        .addIntegerOption(option => 
          option.setName('enemigos')
          .setDescription('Número de enemigos (1-5)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(5)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('estado')
        .setDescription('Muestra el estado de un combate activo'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('abandonar')
        .setDescription('Abandona un combate en curso')),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    try {
      // Verificar si el sistema de roleplay está habilitado
      if (!serverConfig.roleplay || !serverConfig.roleplay.enabled) {
        return message.reply('El sistema de roleplay no está habilitado en este servidor.');
      }
      
      const subCommand = args[0]?.toLowerCase();
      
      switch (subCommand) {
        case 'iniciar':
        case 'start':
          await this.handleStartCombat(message, args.slice(1), serverConfig);
          break;
        case 'estado':
        case 'status':
          await this.handleCombatStatus(message, serverConfig);
          break;
        case 'abandonar':
        case 'exit':
          await this.handleAbandonCombat(message, serverConfig);
          break;
        default:
          // Si no se proporciona un subcomando, verificar si hay combate activo
          const hasActiveCombat = await Combat.getActiveByUser(message.author.id);
          if (hasActiveCombat) {
            await this.handleCombatStatus(message, serverConfig);
          } else {
            // Mostrar ayuda
            await this.showHelpMessage(message, serverConfig);
          }
      }
    } catch (error) {
      console.error('Error en comando de combate:', error);
      message.reply('Ha ocurrido un error al procesar el comando de combate.');
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    try {
      // Verificar si el sistema de roleplay está habilitado
      if (!serverConfig.roleplay || !serverConfig.roleplay.enabled) {
        return interaction.reply({
          content: 'El sistema de roleplay no está habilitado en este servidor.',
          ephemeral: true
        });
      }
      
      const subCommand = interaction.options.getSubcommand();
      
      switch (subCommand) {
        case 'iniciar':
          await interaction.deferReply();
          await this.handleStartCombatSlash(interaction, serverConfig);
          break;
        case 'estado':
          await interaction.deferReply();
          await this.handleCombatStatusSlash(interaction, serverConfig);
          break;
        case 'abandonar':
          await interaction.deferReply();
          await this.handleAbandonCombatSlash(interaction, serverConfig);
          break;
      }
    } catch (error) {
      console.error('Error en comando slash de combate:', error);
      if (interaction.deferred) {
        await interaction.editReply('Ha ocurrido un error al procesar el comando de combate.');
      } else {
        await interaction.reply({
          content: 'Ha ocurrido un error al procesar el comando de combate.',
          ephemeral: true
        });
      }
    }
  },
  
  // Manejador para iniciar combate (prefix)
  async handleStartCombat(message, args, serverConfig) {
    try {
      // Verificar si el usuario ya está en un combate
      const existingCombat = await Combat.getActiveByUser(message.author.id);
      
      if (existingCombat) {
        return message.reply('Ya estás en un combate activo. Usa `!combate estado` para ver tu combate actual o `!combate abandonar` para salir.');
      }
      
      // Verificar si el usuario tiene un perfil
      const profile = await Profile.findOne({
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        return message.reply(`No tienes un perfil de roleplay. Crea uno con el comando \`${serverConfig.config.prefix}perfil\`.`);
      }
      
      // Verificar salud del personaje
      if (profile.character.health.current < profile.character.health.max * 0.3) {
        return message.reply('Tu salud es demasiado baja para iniciar un combate. Recupérate primero.');
      }
      
      // Procesar argumentos
      let difficulty = 'medium';
      let enemyCount = 1;
      
      for (let i = 0; i < args.length; i++) {
        const arg = args[i].toLowerCase();
        
        if (['easy', 'facil', 'medium', 'media', 'hard', 'dificil', 'extreme', 'extrema'].includes(arg)) {
          // Mapear dificultad
          if (arg === 'facil') difficulty = 'easy';
          else if (arg === 'media') difficulty = 'medium';
          else if (arg === 'dificil') difficulty = 'hard';
          else if (arg === 'extrema') difficulty = 'extreme';
          else difficulty = arg;
        } else if (!isNaN(arg) && Number(arg) >= 1 && Number(arg) <= 5) {
          // Número de enemigos
          enemyCount = Number(arg);
        }
      }
      
      // Iniciar mensaje de carga
      const loadingMsg = await message.reply('Preparando combate...');
      
      // Iniciar combate con el servicio
      const combat = await CombatService.startPvECombat({
        serverId: message.guild.id,
        channelId: message.channel.id,
        playerIds: [message.author.id],
        enemyLevel: profile.character.level,
        enemyCount: enemyCount,
        difficulty: difficulty
      });
      
      // Obtener visualización del combate
      const combatDisplay = await CombatService.getCombatDisplay(combat._id);
      
      // Crear embed y botones
      const embed = CombatService.createCombatEmbed(combatDisplay);
      const buttons = CombatService.createCombatButtons(combatDisplay, message.author.id);
      
      // Guardar el ID del mensaje para futuras actualizaciones
      combat.messageId = loadingMsg.id;
      await combat.save();
      
      // Enviar mensaje de combate
      await loadingMsg.edit({
        content: null,
        embeds: [embed],
        components: buttons
      });
      
      // Crear colector de botones
      this.createButtonCollector(loadingMsg, combat, message.author.id);
      
    } catch (error) {
      console.error('Error al iniciar combate:', error);
      message.reply('Ha ocurrido un error al iniciar el combate.');
    }
  },
  
  // Manejador para iniciar combate (slash)
  async handleStartCombatSlash(interaction, serverConfig) {
    try {
      // Verificar si el usuario ya está en un combate
      const existingCombat = await Combat.getActiveByUser(interaction.user.id);
      
      if (existingCombat) {
        return interaction.editReply('Ya estás en un combate activo. Usa `/combate estado` para ver tu combate actual o `/combate abandonar` para salir.');
      }
      
      // Verificar si el usuario tiene un perfil
      const profile = await Profile.findOne({
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        return interaction.editReply(`No tienes un perfil de roleplay. Crea uno con el comando \`/perfil\`.`);
      }
      
      // Verificar salud del personaje
      if (profile.character.health.current < profile.character.health.max * 0.3) {
        return interaction.editReply('Tu salud es demasiado baja para iniciar un combate. Recupérate primero.');
      }
      
      // Obtener opciones
      const difficulty = interaction.options.getString('dificultad') || 'medium';
      const enemyCount = interaction.options.getInteger('enemigos') || 1;
      
      // Iniciar combate con el servicio
      const combat = await CombatService.startPvECombat({
        serverId: interaction.guild.id,
        channelId: interaction.channel.id,
        playerIds: [interaction.user.id],
        enemyLevel: profile.character.level,
        enemyCount: enemyCount,
        difficulty: difficulty
      });
      
      // Obtener visualización del combate
      const combatDisplay = await CombatService.getCombatDisplay(combat._id);
      
      // Crear embed y botones
      const embed = CombatService.createCombatEmbed(combatDisplay);
      const buttons = CombatService.createCombatButtons(combatDisplay, interaction.user.id);
      
      // Enviar mensaje de combate
      const message = await interaction.editReply({
        content: null,
        embeds: [embed],
        components: buttons
      });
      
      // Guardar el ID del mensaje para futuras actualizaciones
      combat.messageId = message.id;
      await combat.save();
      
      // Crear colector de botones
      this.createButtonCollector(message, combat, interaction.user.id);
      
    } catch (error) {
      console.error('Error al iniciar combate:', error);
      interaction.editReply('Ha ocurrido un error al iniciar el combate.');
    }
  },
  
  // Manejador para ver estado de combate (prefix)
  async handleCombatStatus(message, serverConfig) {
    try {
      // Buscar combate activo del usuario
      const combat = await Combat.getActiveByUser(message.author.id);
      
      if (!combat) {
        return message.reply('No tienes ningún combate activo.');
      }
      
      // Obtener visualización del combate
      const combatDisplay = await CombatService.getCombatDisplay(combat._id);
      
      // Crear embed y botones
      const embed = CombatService.createCombatEmbed(combatDisplay);
      const buttons = CombatService.createCombatButtons(combatDisplay, message.author.id);
      
      // Enviar mensaje
      const reply = await message.reply({
        embeds: [embed],
        components: buttons
      });
      
      // Si el mensaje del combate es diferente, actualizar referencia
      if (combat.messageId !== reply.id) {
        combat.messageId = reply.id;
        await combat.save();
      }
      
      // Crear colector de botones
      this.createButtonCollector(reply, combat, message.author.id);
      
    } catch (error) {
      console.error('Error al mostrar estado de combate:', error);
      message.reply('Ha ocurrido un error al mostrar el estado del combate.');
    }
  },
  
  // Manejador para ver estado de combate (slash)
  async handleCombatStatusSlash(interaction, serverConfig) {
    try {
      // Buscar combate activo del usuario
      const combat = await Combat.getActiveByUser(interaction.user.id);
      
      if (!combat) {
        return interaction.editReply('No tienes ningún combate activo.');
      }
      
      // Obtener visualización del combate
      const combatDisplay = await CombatService.getCombatDisplay(combat._id);
      
      // Crear embed y botones
      const embed = CombatService.createCombatEmbed(combatDisplay);
      const buttons = CombatService.createCombatButtons(combatDisplay, interaction.user.id);
      
      // Enviar mensaje
      const message = await interaction.editReply({
        embeds: [embed],
        components: buttons
      });
      
      // Si el mensaje del combate es diferente, actualizar referencia
      if (combat.messageId !== message.id) {
        combat.messageId = message.id;
        await combat.save();
      }
      
      // Crear colector de botones
      this.createButtonCollector(message, combat, interaction.user.id);
      
    } catch (error) {
      console.error('Error al mostrar estado de combate:', error);
      interaction.editReply('Ha ocurrido un error al mostrar el estado del combate.');
    }
  },
  
  // Manejador para abandonar combate (prefix)
  async handleAbandonCombat(message, serverConfig) {
    try {
      // Buscar combate activo del usuario
      const combat = await Combat.getActiveByUser(message.author.id);
      
      if (!combat) {
        return message.reply('No tienes ningún combate activo.');
      }
      
      // Confirmar abandono
      const confirmEmbed = new EmbedBuilder()
        .setTitle('Abandonar combate')
        .setDescription('¿Estás seguro de que quieres abandonar este combate? No recibirás ninguna recompensa y contará como una derrota.')
        .setColor(0xe74c3c);
      
      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`combat_abandon_confirm:${combat._id}:${message.author.id}`)
            .setLabel('Confirmar')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`combat_abandon_cancel:${combat._id}:${message.author.id}`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary)
        );
      
      const reply = await message.reply({
        embeds: [confirmEmbed],
        components: [confirmRow]
      });
      
      // Crear colector para confirmar/cancelar
      const filter = i => 
        i.customId.startsWith('combat_abandon_') && 
        i.customId.includes(message.author.id);
      
      const collector = reply.createMessageComponentCollector({
        filter,
        time: 30000,
        componentType: ComponentType.Button,
        max: 1
      });
      
      collector.on('collect', async interaction => {
        if (interaction.customId.startsWith(`combat_abandon_confirm`)) {
          // Abandonar combate
          await combat.abandonCombat();
          
          // Actualizar mensaje
          const embed = new EmbedBuilder()
            .setTitle('Combate abandonado')
            .setDescription('Has abandonado el combate. No has recibido ninguna recompensa.')
            .setColor(0x95a5a6);
          
          await interaction.update({
            embeds: [embed],
            components: []
          });
        } else {
          // Cancelar abandono
          await interaction.update({
            content: 'Has cancelado el abandono del combate.',
            embeds: [],
            components: []
          });
        }
      });
      
      collector.on('end', collected => {
        if (collected.size === 0) {
          reply.edit({
            content: 'Se ha agotado el tiempo para confirmar.',
            embeds: [],
            components: []
          }).catch(console.error);
        }
      });
      
    } catch (error) {
      console.error('Error al abandonar combate:', error);
      message.reply('Ha ocurrido un error al abandonar el combate.');
    }
  },
  
  // Manejador para abandonar combate (slash)
  async handleAbandonCombatSlash(interaction, serverConfig) {
    try {
      // Buscar combate activo del usuario
      const combat = await Combat.getActiveByUser(interaction.user.id);
      
      if (!combat) {
        return interaction.editReply('No tienes ningún combate activo.');
      }
      
      // Confirmar abandono
      const confirmEmbed = new EmbedBuilder()
        .setTitle('Abandonar combate')
        .setDescription('¿Estás seguro de que quieres abandonar este combate? No recibirás ninguna recompensa y contará como una derrota.')
        .setColor(0xe74c3c);
      
      const confirmRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`combat_abandon_confirm:${combat._id}:${interaction.user.id}`)
            .setLabel('Confirmar')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`combat_abandon_cancel:${combat._id}:${interaction.user.id}`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary)
        );
      
      const message = await interaction.editReply({
        embeds: [confirmEmbed],
        components: [confirmRow]
      });
      
      // Crear colector para confirmar/cancelar
      const filter = i => 
        i.customId.startsWith('combat_abandon_') && 
        i.customId.includes(interaction.user.id);
      
      const collector = message.createMessageComponentCollector({
        filter,
        time: 30000,
        componentType: ComponentType.Button,
        max: 1
      });
      
      collector.on('collect', async buttonInteraction => {
        if (buttonInteraction.customId.startsWith(`combat_abandon_confirm`)) {
          // Abandonar combate
          await combat.abandonCombat();
          
          // Actualizar mensaje
          const embed = new EmbedBuilder()
            .setTitle('Combate abandonado')
            .setDescription('Has abandonado el combate. No has recibido ninguna recompensa.')
            .setColor(0x95a5a6);
          
          await buttonInteraction.update({
            embeds: [embed],
            components: []
          });
        } else {
          // Cancelar abandono
          await buttonInteraction.update({
            content: 'Has cancelado el abandono del combate.',
            embeds: [],
            components: []
          });
        }
      });
      
      collector.on('end', collected => {
        if (collected.size === 0) {
          interaction.editReply({
            content: 'Se ha agotado el tiempo para confirmar.',
            embeds: [],
            components: []
          }).catch(console.error);
        }
      });
      
    } catch (error) {
      console.error('Error al abandonar combate:', error);
      interaction.editReply('Ha ocurrido un error al abandonar el combate.');
    }
  },
  
  // Mostrar mensaje de ayuda
  async showHelpMessage(message, serverConfig) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('Ayuda del Sistema de Combate')
        .setDescription('El sistema de combate te permite enfrentarte a enemigos en batallas por turnos.')
        .setColor(0x3498db)
        .addFields(
          {
            name: `${serverConfig.config.prefix}combate iniciar [dificultad] [enemigos]`,
            value: 'Inicia un nuevo combate. La dificultad puede ser: fácil, media, difícil o extrema. El número de enemigos puede ser de 1 a 5.'
          },
          {
            name: `${serverConfig.config.prefix}combate estado`,
            value: 'Muestra el estado de tu combate actual.'
          },
          {
            name: `${serverConfig.config.prefix}combate abandonar`,
            value: 'Abandona un combate en curso.'
          }
        )
        .setFooter({ text: 'Durante el combate usa los botones para realizar acciones.' });
      
      message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error al mostrar mensaje de ayuda:', error);
      message.reply('Ha ocurrido un error al mostrar la ayuda del comando.');
    }
  },
  
  // Crear colector de botones para acciones de combate
  createButtonCollector(message, combat, userId) {
    // Filtrar interacciones
    const filter = i => 
      i.customId.startsWith('combat:') && 
      i.user.id === userId;
    
    // Crear colector
    const collector = message.createMessageComponentCollector({
      filter,
      time: 300000, // 5 minutos
      componentType: ComponentType.Button
    });
    
    collector.on('collect', async interaction => {
      try {
        // Extraer información del ID personalizado
        const [prefix, action, combatId, targetId] = interaction.customId.split(':');
        
        // Verificar que el combate siga activo
        const currentCombat = await Combat.findById(combatId);
        if (!currentCombat || currentCombat.status !== 'active') {
          return interaction.reply({
            content: 'Este combate ya no está activo.',
            ephemeral: true
          });
        }
        
        // Procesar acción según tipo
        switch (action) {
          case 'attack':
            // Solicitar selección de objetivo si no se ha elegido
            if (!targetId) {
              return interaction.reply({
                content: 'Debes seleccionar un objetivo para atacar usando uno de los botones de objetivo.',
                ephemeral: true
              });
            }
            
            // Procesar ataque
            await this.handleCombatAction(interaction, combatId, userId, {
              type: 'attack',
              targetId: targetId
            });
            break;
            
          case 'skill':
            // Mostrar menú de habilidades
            await this.showSkillMenu(interaction, combatId, userId);
            break;
            
          case 'item':
            // Mostrar menú de items
            await this.showItemMenu(interaction, combatId, userId);
            break;
            
          case 'defend':
            // Procesar defensa
            await this.handleCombatAction(interaction, combatId, userId, {
              type: 'defend'
            });
            break;
            
          case 'flee':
            // Procesar intento de huida
            await this.handleCombatAction(interaction, combatId, userId, {
              type: 'flee'
            });
            break;
            
          case 'target':
            // Guardar selección de objetivo temporalmente
            return interaction.reply({
              content: `Has seleccionado un objetivo. Ahora elige qué acción realizar (Atacar, Habilidad, etc).`,
              ephemeral: true
            });
            break;
        }
      } catch (error) {
        console.error('Error procesando interacción de botón de combate:', error);
        interaction.reply({
          content: 'Ha ocurrido un error al procesar tu acción.',
          ephemeral: true
        });
      }
    });
    
    collector.on('end', collected => {
      // Si no se ha recogido nada y el mensaje sigue existiendo, actualizar componentes
      if (collected.size === 0) {
        message.edit({
          components: []
        }).catch(console.error);
      }
    });
  },
  
  // Manejar acción de combate
  async handleCombatAction(interaction, combatId, userId, actionData) {
    try {
      await interaction.deferUpdate();
      
      // Procesar la acción
      const result = await CombatService.processPlayerAction(combatId, userId, actionData);
      
      // Obtener visualización actualizada del combate
      const combatDisplay = await CombatService.getCombatDisplay(combatId);
      
      // Crear embed y botones actualizados
      const embed = CombatService.createCombatEmbed(combatDisplay);
      const buttons = CombatService.createCombatButtons(combatDisplay, userId);
      
      // Actualizar mensaje
      await interaction.editReply({
        embeds: [embed],
        components: buttons
      });
      
      // Si el combate ha terminado, mostrar resultado en un mensaje separado
      if (result.combatEnded) {
        const resultEmbed = new EmbedBuilder()
          .setTitle(result.result === 'victory' ? '¡Victoria!' : 'Derrota')
          .setDescription(result.result === 'victory' 
            ? 'Has ganado el combate y obtenido recompensas.'
            : 'Has sido derrotado en combate.')
          .setColor(result.result === 'victory' ? 0x2ecc71 : 0xe74c3c);
        
        // Enviar mensaje de resultado
        await interaction.followUp({ embeds: [resultEmbed] });
      }
    } catch (error) {
      console.error('Error al procesar acción de combate:', error);
      interaction.followUp({
        content: `Error: ${error.message}`,
        ephemeral: true
      });
    }
  },
  
  // Mostrar menú de selección de habilidades
  async showSkillMenu(interaction, combatId, userId) {
    try {
      // Obtener datos del combate
      const combat = await Combat.findById(combatId);
      if (!combat || combat.status !== 'active') {
        return interaction.reply({
          content: 'Este combate ya no está activo.',
          ephemeral: true
        });
      }
      
      // Obtener el participante del jugador
      const playerParticipant = combat.participants.find(p => 
        p.type === 'player' && p.userId === userId
      );
      
      if (!playerParticipant) {
        return interaction.reply({
          content: 'No se encontró tu participación en este combate.',
          ephemeral: true
        });
      }
      
      // Verificar si tiene habilidades
      const skills = playerParticipant.skills || [];
      
      if (skills.length === 0) {
        return interaction.reply({
          content: 'No tienes habilidades para usar en combate.',
          ephemeral: true
        });
      }
      
      // Crear embed con información de habilidades
      const embed = new EmbedBuilder()
        .setTitle('Tus Habilidades')
        .setDescription('Selecciona una habilidad para usar:')
        .setColor(0x3498db);
      
      // Añadir habilidades al embed
      skills.forEach(skill => {
        const cooldownText = skill.currentCooldown > 0 
          ? `(En cooldown: ${skill.currentCooldown} turnos)` 
          : '';
        
        const manaText = `Coste de Maná: ${skill.manaCost}`;
        
        let description = `${skill.description || 'Sin descripción'}\n${manaText}`;
        
        if (skill.baseDamage > 0) {
          description += `\nDaño Base: ${skill.baseDamage}`;
        }
        
        if (skill.healing > 0) {
          description += `\nCuración: ${skill.healing}`;
        }
        
        embed.addFields({
          name: `${skill.name} ${cooldownText}`,
          value: description,
          inline: true
        });
      });
      
      // Crear botones para seleccionar habilidades (máximo 5)
      const buttons = [];
      const maxButtons = Math.min(skills.length, 5);
      
      for (let i = 0; i < maxButtons; i++) {
        const skill = skills[i];
        
        // Solo añadir botones para habilidades disponibles
        if (skill.currentCooldown === 0 && playerParticipant.stats.mana >= skill.manaCost) {
          buttons.push(
            new ButtonBuilder()
              .setCustomId(`combat_skill:${combatId}:${skill.skillId}`)
              .setLabel(skill.name)
              .setStyle(ButtonStyle.Primary)
          );
        } else {
          buttons.push(
            new ButtonBuilder()
              .setCustomId(`combat_skill_disabled:${combatId}:${skill.skillId}`)
              .setLabel(skill.name)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
        }
      }
      
      // Añadir botón de cancelar
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`combat_skill_cancel:${combatId}`)
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      );
      
      // Crear filas de botones (máximo 5 botones por fila)
      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        const row = new ActionRowBuilder()
          .addComponents(buttons.slice(i, i + 5));
        rows.push(row);
      }
      
      // Responder con el embed y botones
      const reply = await interaction.reply({
        embeds: [embed],
        components: rows,
        ephemeral: true
      });
      
      // Crear colector para la selección de habilidad
      const filter = i => 
        i.customId.startsWith('combat_skill') && 
        i.user.id === userId;
      
      const collector = reply.createMessageComponentCollector({
        filter,
        time: 30000,
        componentType: ComponentType.Button,
        max: 1
      });
      
      collector.on('collect', async buttonInteraction => {
        if (buttonInteraction.customId.startsWith('combat_skill_cancel')) {
          // Cancelar selección
          return buttonInteraction.update({
            content: 'Has cancelado la selección de habilidad.',
            embeds: [],
            components: []
          });
        } else if (buttonInteraction.customId.startsWith('combat_skill_disabled')) {
          // Habilidad no disponible
          return buttonInteraction.update({
            content: 'Esta habilidad no está disponible actualmente.',
            embeds: [embed],
            components: rows
          });
        } else {
          // Extraer ID de la habilidad
          const skillId = buttonInteraction.customId.split(':')[2];
          
          // Solicitar objetivo si la habilidad lo requiere
          const skill = skills.find(s => s.skillId === skillId);
          
          if (skill.baseDamage > 0) {
            // Habilidad de daño, mostrar selección de objetivo
            await buttonInteraction.update({
              content: 'Selecciona un objetivo para tu habilidad:',
              embeds: [],
              components: await this.createTargetSelectionRows(combatId)
            });
            
            // Crear collector para la selección de objetivo
            const targetFilter = i => 
              i.customId.startsWith('combat_target') && 
              i.user.id === userId;
            
            const targetCollector = reply.createMessageComponentCollector({
              filter: targetFilter,
              time: 30000,
              componentType: ComponentType.Button,
              max: 1
            });
            
            targetCollector.on('collect', async targetInteraction => {
              if (targetInteraction.customId.startsWith('combat_target_cancel')) {
                // Cancelar selección
                return targetInteraction.update({
                  content: 'Has cancelado la selección de objetivo.',
                  embeds: [],
                  components: []
                });
              } else {
                // Extraer ID del objetivo
                const targetId = targetInteraction.customId.split(':')[2];
                
                // Ejecutar acción de habilidad con objetivo
                await targetInteraction.update({
                  content: 'Procesando acción...',
                  embeds: [],
                  components: []
                });
                
                // Ejecutar la habilidad
                await this.handleCombatAction(
                  await interaction.fetchReply(),
                  combatId,
                  userId,
                  {
                    type: 'skill',
                    skillId: skillId,
                    targetId: targetId
                  }
                );
              }
            });
            
            targetCollector.on('end', collected => {
              if (collected.size === 0) {
                buttonInteraction.editReply({
                  content: 'Se ha agotado el tiempo para seleccionar un objetivo.',
                  embeds: [],
                  components: []
                }).catch(console.error);
              }
            });
          } else {
            // Habilidad sin objetivo (autobuff, curación propia, etc.)
            await buttonInteraction.update({
              content: 'Procesando acción...',
              embeds: [],
              components: []
            });
            
            // Ejecutar la habilidad sin objetivo
            await this.handleCombatAction(
              await interaction.fetchReply(),
              combatId,
              userId,
              {
                type: 'skill',
                skillId: skillId
              }
            );
          }
        }
      });
      
      collector.on('end', collected => {
        if (collected.size === 0) {
          interaction.editReply({
            content: 'Se ha agotado el tiempo para seleccionar una habilidad.',
            embeds: [],
            components: []
          }).catch(console.error);
        }
      });
    } catch (error) {
      console.error('Error al mostrar menú de habilidades:', error);
      interaction.reply({
        content: 'Ha ocurrido un error al mostrar tus habilidades.',
        ephemeral: true
      });
    }
  },
  
  // Mostrar menú de selección de items
  async showItemMenu(interaction, combatId, userId) {
    try {
      // Obtener perfil del jugador
      const combat = await Combat.findById(combatId);
      if (!combat) {
        throw new Error('Combate no encontrado');
      }
      
      const participant = combat.participants.find(p => 
        p.type === 'player' && p.userId === userId
      );
      
      if (!participant) {
        throw new Error('Participante no encontrado en el combate');
      }
      
      // Buscar perfil del jugador para obtener inventario
      const profile = await Profile.findOne({
        userId: userId,
        serverId: combat.serverId
      });
      
      if (!profile) {
        return interaction.reply({
          content: 'No se encontró tu perfil de personaje.',
          ephemeral: true
        });
      }
      
      // Filtrar items que se pueden usar en combate
      const inventory = profile.inventory || [];
      const usableItems = [];
      
      for (const item of inventory) {
        if (item.quantity > 0 && item.usableInCombat) {
          const itemData = await Item.findById(item.itemId);
          if (itemData) {
            usableItems.push({
              _id: item.itemId,
              name: itemData.name,
              quantity: item.quantity,
              description: itemData.description,
              type: itemData.type,
              effects: itemData.effects,
              rarity: itemData.rarity
            });
          }
        }
      }
      
      if (usableItems.length === 0) {
        return interaction.reply({
          content: 'No tienes items que puedas usar en combate.',
          ephemeral: true
        });
      }
      
      // Crear embed con los items
      const embed = new EmbedBuilder()
        .setTitle('Tus Items')
        .setDescription('Selecciona un item para usar:')
        .setColor(0x3498db);
      
      // Añadir items al embed
      usableItems.forEach(item => {
        let description = `${item.description || 'Sin descripción'}\nCantidad: ${item.quantity}`;
        
        if (item.effects) {
          if (item.effects.health) {
            description += `\nSalud: ${item.effects.health > 0 ? '+' : ''}${item.effects.health}`;
          }
          if (item.effects.mana) {
            description += `\nManá: ${item.effects.mana > 0 ? '+' : ''}${item.effects.mana}`;
          }
          if (item.effects.damage) {
            description += `\nDaño: ${item.effects.damage > 0 ? '+' : ''}${item.effects.damage}`;
          }
        }
        
        embed.addFields({
          name: item.name,
          value: description,
          inline: true
        });
      });
      
      // Crear botones para seleccionar items (máximo 5)
      const buttons = [];
      const maxButtons = Math.min(usableItems.length, 5);
      
      for (let i = 0; i < maxButtons; i++) {
        const item = usableItems[i];
        
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`combat_item:${combatId}:${item._id.toString()}`)
            .setLabel(item.name)
            .setStyle(ButtonStyle.Primary)
        );
      }
      
      // Añadir botón de cancelar
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`combat_item_cancel:${combatId}`)
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
      );
      
      // Crear filas de botones (máximo 5 botones por fila)
      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        const row = new ActionRowBuilder()
          .addComponents(buttons.slice(i, i + 5));
        rows.push(row);
      }
      
      // Responder con el embed y botones
      const reply = await interaction.reply({
        embeds: [embed],
        components: rows,
        ephemeral: true
      });
      
      // Crear colector para la selección de item
      const filter = i => 
        i.customId.startsWith('combat_item') && 
        i.user.id === userId;
      
      const collector = reply.createMessageComponentCollector({
        filter,
        time: 30000,
        componentType: ComponentType.Button,
        max: 1
      });
      
      collector.on('collect', async buttonInteraction => {
        if (buttonInteraction.customId.startsWith('combat_item_cancel')) {
          // Cancelar selección
          return buttonInteraction.update({
            content: 'Has cancelado la selección de item.',
            embeds: [],
            components: []
          });
        } else {
          // Extraer ID del item
          const itemId = buttonInteraction.customId.split(':')[2];
          
          // Verificar si el item necesita un objetivo
          const item = usableItems.find(i => i._id.toString() === itemId);
          
          if (item && item.effects && (item.effects.health < 0 || item.type === 'offensive')) {
            // Item de daño o debuff, mostrar selección de objetivo
            await buttonInteraction.update({
              content: 'Selecciona un objetivo para tu item:',
              embeds: [],
              components: await this.createTargetSelectionRows(combatId)
            });
            
            // Crear collector para la selección de objetivo
            const targetFilter = i => 
              i.customId.startsWith('combat_target') && 
              i.user.id === userId;
            
            const targetCollector = reply.createMessageComponentCollector({
              filter: targetFilter,
              time: 30000,
              componentType: ComponentType.Button,
              max: 1
            });
            
            targetCollector.on('collect', async targetInteraction => {
              if (targetInteraction.customId.startsWith('combat_target_cancel')) {
                // Cancelar selección
                return targetInteraction.update({
                  content: 'Has cancelado la selección de objetivo.',
                  embeds: [],
                  components: []
                });
              } else {
                // Extraer ID del objetivo
                const targetId = targetInteraction.customId.split(':')[2];
                
                // Ejecutar acción de item con objetivo
                await targetInteraction.update({
                  content: 'Procesando acción...',
                  embeds: [],
                  components: []
                });
                
                // Usar el item
                await this.handleCombatAction(
                  await interaction.fetchReply(),
                  combatId,
                  userId,
                  {
                    type: 'item',
                    itemId: itemId,
                    targetId: targetId
                  }
                );
              }
            });
            
            targetCollector.on('end', collected => {
              if (collected.size === 0) {
                buttonInteraction.editReply({
                  content: 'Se ha agotado el tiempo para seleccionar un objetivo.',
                  embeds: [],
                  components: []
                }).catch(console.error);
              }
            });
          } else {
            // Item sin objetivo específico (poción, buff, etc.)
            await buttonInteraction.update({
              content: 'Procesando acción...',
              embeds: [],
              components: []
            });
            
            // Usar el item sin objetivo
            await this.handleCombatAction(
              await interaction.fetchReply(),
              combatId,
              userId,
              {
                type: 'item',
                itemId: itemId
              }
            );
          }
        }
      });
      
      collector.on('end', collected => {
        if (collected.size === 0) {
          interaction.editReply({
            content: 'Se ha agotado el tiempo para seleccionar un item.',
            embeds: [],
            components: []
          }).catch(console.error);
        }
      });
    } catch (error) {
      console.error('Error al mostrar menú de items:', error);
      interaction.reply({
        content: 'Ha ocurrido un error al mostrar tus items.',
        ephemeral: true
      });
    }
  },
  
  // Crear filas para selección de objetivos
  async createTargetSelectionRows(combatId) {
    try {
      // Obtener combate
      const combat = await Combat.findById(combatId);
      if (!combat) {
        throw new Error('Combate no encontrado');
      }
      
      // Obtener enemigos vivos
      const aliveEnemies = combat.participants.filter(p => 
        p.type === 'enemy' && !p.isDefeated
      );
      
      if (aliveEnemies.length === 0) {
        throw new Error('No hay enemigos disponibles como objetivo');
      }
      
      // Crear botones para cada enemigo
      const buttons = aliveEnemies.map(enemy => 
        new ButtonBuilder()
          .setCustomId(`combat_target:${combatId}:${enemy._id.toString()}`)
          .setLabel(enemy.duplicateNumber > 0 ? `${enemy.name} ${enemy.duplicateNumber}` : enemy.name)
          .setStyle(ButtonStyle.Danger)
      );
      
      // Añadir botón de cancelar
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`combat_target_cancel:${combatId}`)
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Secondary)
      );
      
      // Crear filas de botones
      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        const row = new ActionRowBuilder()
          .addComponents(buttons.slice(i, i + 5));
        rows.push(row);
      }
      
      return rows;
    } catch (error) {
      console.error('Error al crear filas de selección de objetivos:', error);
      return [];
    }
  }
};