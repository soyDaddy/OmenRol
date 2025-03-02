const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');
const { Mission } = require('../../../models/Missions');
const Server = require('../../../models/Server');
const Item = require('../../../models/Items');
const Skill = require('../../../models/Skill');

module.exports = {
  name: 'mision',
  aliases: ['mission', 'quest'],
  description: 'Gestiona misiones individuales (aceptar, abandonar, info)',
  category: 'roleplay',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('mision')
    .setDescription('Gestiona misiones individuales')
    .addSubcommand(subcommand =>
      subcommand
        .setName('aceptar')
        .setDescription('Acepta una misión disponible')
        .addStringOption(option => 
          option.setName('id')
          .setDescription('ID de la misión a aceptar')
          .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('abandonar')
        .setDescription('Abandona una misión activa')
        .addStringOption(option => 
          option.setName('id')
          .setDescription('ID de la misión a abandonar')
          .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Muestra información detallada de una misión')
        .addStringOption(option => 
          option.setName('id')
          .setDescription('ID de la misión')
          .setRequired(true))),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client) {
    
    try {
      if (!args[0]) {
        return message.reply('Debes especificar una acción: `aceptar`, `abandonar` o `info`');
      }
      
      const action = args[0].toLowerCase();
      const missionId = args[1];
      
      if (!missionId && action !== 'help') {
        return message.reply('Debes especificar el ID de la misión.');
      }
      
      // Buscar configuración del servidor
      const serverConfig = await Server.findOne({ serverId: message.guild.id });
      
      if (!serverConfig || !serverConfig.roleplay.enabled) {
        return message.reply('El sistema de roleplay no está habilitado en este servidor.');
      }
      
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ 
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        return message.reply('No tienes un perfil de roleplay. Crea uno con el comando `!perfil`.');
      }
      
      switch (action) {
        case 'aceptar':
        case 'accept':
          // Aceptar una nueva misión
          const mission = await Mission.findById(missionId);
          
          if (!mission || mission.serverId !== message.guild.id || mission.status !== 'active') {
            return message.reply('Misión no encontrada o no disponible.');
          }
          
          // Verificar si ya tiene esta misión activa
          if (profile.progress.activeMissions.some(m => m.missionId === missionId)) {
            return message.reply('Ya tienes esta misión activa.');
          }
          
          // Verificar número máximo de misiones
          if (profile.progress.activeMissions.length >= serverConfig.roleplay.maxActiveMissions) {
            return message.reply(`Ya tienes el máximo de misiones activas (${serverConfig.roleplay.maxActiveMissions}). Completa o abandona una para aceptar otra.`);
          }
          
          // Verificar requisitos
          if (profile.character.level < mission.levelRequired) {
            return message.reply(`No cumples el nivel requerido para esta misión. Necesitas nivel ${mission.levelRequired}.`);
          }
          
          // Verificar restricciones de raza
          if (mission.raceRestrictions && mission.raceRestrictions.length > 0) {
            if (!mission.raceRestrictions.includes(profile.character.race)) {
              // Obtener la razón de la restricción si existe
              let reason = '';
              if (mission.restrictionReasons && mission.restrictionReasons.has(profile.character.race)) {
                reason = `\nRazón: ${mission.restrictionReasons.get(profile.character.race)}`;
              }
              
              return message.reply(`Esta misión no está disponible para la raza ${profile.character.race}.${reason}`);
            }
          }
          
          // Verificar restricciones de clase
          if (mission.classRestrictions && mission.classRestrictions.length > 0) {
            if (!mission.classRestrictions.includes(profile.character.class)) {
              // Obtener la razón de la restricción si existe
              let reason = '';
              if (mission.restrictionReasons && mission.restrictionReasons.has(profile.character.class)) {
                reason = `\nRazón: ${mission.restrictionReasons.get(profile.character.class)}`;
              }
              
              return message.reply(`Esta misión no está disponible para la clase ${profile.character.class}.${reason}`);
            }
          }
          
          // Verificar costos
          if (mission.costs) {
            // Verificar monedas
            if (mission.costs.currency > 0 && profile.character.currency < mission.costs.currency) {
              return message.reply(`No tienes suficientes monedas para aceptar esta misión. Necesitas ${mission.costs.currency} monedas.`);
            }
            
            // Verificar items necesarios
            if (mission.costs.items && mission.costs.items.length > 0) {
              for (const costItem of mission.costs.items) {
                const inventoryItem = profile.character.inventory.find(i => i.itemId === costItem.itemId);
                if (!inventoryItem || inventoryItem.quantity < costItem.quantity) {
                  const item = await Item.findById(costItem.itemId);
                  return message.reply(`No tienes suficientes ${item ? item.name : 'items requeridos'} para aceptar esta misión. Necesitas ${costItem.quantity}.`);
                }
              }
            }
          }
          
          // Aplicar costos si los hay
          if (mission.costs) {
            // Restar monedas
            if (mission.costs.currency > 0) {
              profile.character.currency -= mission.costs.currency;
            }
            
            // Restar items
            if (mission.costs.items && mission.costs.items.length > 0) {
              for (const costItem of mission.costs.items) {
                const inventoryItem = profile.character.inventory.find(i => i.itemId === costItem.itemId);
                if (inventoryItem) {
                  inventoryItem.quantity -= costItem.quantity;
                  if (inventoryItem.quantity <= 0) {
                    profile.character.inventory = profile.character.inventory.filter(i => i.itemId !== costItem.itemId);
                  }
                }
              }
            }
          }
          
          // Añadir la misión a las activas
          const expiresAt = mission.duration > 0 ? new Date(Date.now() + mission.duration * 60 * 1000) : null;
          
          profile.progress.activeMissions.push({
            missionId: mission._id.toString(),
            startedAt: new Date(),
            expiresAt,
            currentStage: 0,
            progress: 0,
            completed: false
          });
          
          await profile.save();
          
          message.reply(`Has aceptado la misión "${mission.title}". ¡Buena suerte!`);
          break;
          
        case 'abandonar':
        case 'abandon':
          // Abandonar una misión activa
          const activeMissionIndex = profile.progress.activeMissions.findIndex(m => m.missionId === missionId);
          
          if (activeMissionIndex === -1) {
            return message.reply('No tienes esa misión activa.');
          }
          
          // Eliminar la misión de las activas
          profile.progress.activeMissions.splice(activeMissionIndex, 1);
          await profile.save();
          
          message.reply('Has abandonado la misión.');
          break;
          
        case 'info':
          // Mostrar información detallada de una misión
          const missionInfo = await Mission.findById(missionId);
          
          if (!missionInfo || missionInfo.serverId !== message.guild.id) {
            return message.reply('Misión no encontrada.');
          }
          
          // Verificar si el usuario tiene la misión activa
          const activeMission = profile.progress.activeMissions.find(m => m.missionId === missionId);
          
          // Crear embed con la información de la misión
          const embed = new EmbedBuilder()
            .setColor(activeMission ? 0x3498db : 0xf39c12)
            .setTitle(missionInfo.title)
            .setDescription(missionInfo.description);
          
          // Información general de la misión
          embed.addFields({
            name: '📊 Información',
            value: `**Tipo:** ${missionInfo.type}\n` +
                  `**Dificultad:** ${missionInfo.difficulty}\n` +
                  `**Nivel requerido:** ${missionInfo.levelRequired}\n` +
                  `**Duración:** ${missionInfo.duration > 0 ? `${missionInfo.duration} minutos` : 'Sin límite'}`
          });
          
          // Añadir restricciones si las hay
          if (missionInfo.raceRestrictions && missionInfo.raceRestrictions.length > 0) {
            embed.addFields({
              name: '⚠️ Restricciones de Raza',
              value: missionInfo.raceRestrictions.join(', ')
            });
          }
          
          if (missionInfo.classRestrictions && missionInfo.classRestrictions.length > 0) {
            embed.addFields({
              name: '⚠️ Restricciones de Clase',
              value: missionInfo.classRestrictions.join(', ')
            });
          }
          
          // Recompensas
          let rewardsText = `**Experiencia:** ${missionInfo.rewards.experience}\n` +
                         `**Monedas:** ${missionInfo.rewards.currency}\n`;
                         
          if (missionInfo.rewards.items && missionInfo.rewards.items.length > 0) {
            const itemIds = missionInfo.rewards.items.map(i => i.itemId);
            const items = await Item.find({ _id: { $in: itemIds } });
            
            rewardsText += '**Items:**\n';
            missionInfo.rewards.items.forEach(rewardItem => {
              const item = items.find(i => i._id.toString() === rewardItem.itemId);
              if (item) {
                rewardsText += `- ${item.name} x${rewardItem.quantity}\n`;
              }
            });
          }
          
          if (missionInfo.rewards.skills && missionInfo.rewards.skills.length > 0) {
            const skills = await Skill.find({ _id: { $in: missionInfo.rewards.skills } });
            
            rewardsText += '**Habilidades:**\n';
            skills.forEach(skill => {
              rewardsText += `- ${skill.name}\n`;
            });
          }
          
          embed.addFields({
            name: '🏆 Recompensas',
            value: rewardsText
          });
          
          // Añadir progreso si la misión está activa
          if (activeMission) {
            let progressText = `**Progreso:** ${activeMission.progress}%\n`;
            
            if (activeMission.expiresAt) {
              const timeLeft = Math.max(0, Math.ceil((activeMission.expiresAt - new Date()) / 1000 / 60));
              progressText += `**Tiempo restante:** ${timeLeft} minutos\n`;
            }
            
            // Mostrar etapa actual si hay etapas
            if (missionInfo.stages && missionInfo.stages.length > 0 && activeMission.currentStage < missionInfo.stages.length) {
              const currentStage = missionInfo.stages[activeMission.currentStage];
              progressText += `**Etapa actual:** ${currentStage.name}\n`;
              progressText += `**Descripción:** ${currentStage.description}\n`;
            }
            
            embed.addFields({
              name: '📈 Progreso',
              value: progressText
            });
          }
          
          message.reply({ embeds: [embed] });
          break;
          
        case 'help':
          // Mostrar ayuda sobre el comando
          const helpEmbed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('📋 Ayuda del Comando Misión')
            .setDescription('Gestiona tus misiones individuales con los siguientes subcomandos:')
            .addFields(
              {
                name: '!mision aceptar <id>',
                value: 'Acepta una nueva misión. Puedes ver las misiones disponibles con `!misiones disponibles`.'
              },
              {
                name: '!mision abandonar <id>',
                value: 'Abandona una misión activa. No recibirás ninguna recompensa.'
              },
              {
                name: '!mision info <id>',
                value: 'Muestra información detallada sobre una misión específica.'
              }
            );
          
          message.reply({ embeds: [helpEmbed] });
          break;
          
        default:
          message.reply('Acción desconocida. Usa `aceptar`, `abandonar` o `info`.');
      }
    } catch (error) {
      console.error('Error al gestionar misión:', error);
      message.reply('Ha ocurrido un error al gestionar la misión.');
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client) {
    
    try {
      // Obtener acción y parámetros
      const action = interaction.options.getSubcommand();
      const missionId = interaction.options.getString('id');
      
      // Buscar configuración del servidor
      const serverConfig = await Server.findOne({ serverId: interaction.guild.id });
      
      if (!serverConfig || !serverConfig.roleplay.enabled) {
        return interaction.reply({ content: 'El sistema de roleplay no está habilitado en este servidor.', ephemeral: true });
      }
      
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ 
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        return interaction.reply({ 
          content: 'No tienes un perfil de roleplay. Crea uno con el comando `/perfil`.',
          ephemeral: true
        });
      }
      
      switch (action) {
        case 'aceptar':
          // Aceptar una nueva misión
          const mission = await Mission.findById(missionId);
          
          if (!mission || mission.serverId !== interaction.guild.id || mission.status !== 'active') {
            return interaction.reply({ content: 'Misión no encontrada o no disponible.', ephemeral: true });
          }
          
          // Verificar si ya tiene esta misión activa
          if (profile.progress.activeMissions.some(m => m.missionId === missionId)) {
            return interaction.reply({ content: 'Ya tienes esta misión activa.', ephemeral: true });
          }
          
          // Verificar número máximo de misiones
          if (profile.progress.activeMissions.length >= serverConfig.roleplay.maxActiveMissions) {
            return interaction.reply({ 
              content: `Ya tienes el máximo de misiones activas (${serverConfig.roleplay.maxActiveMissions}). Completa o abandona una para aceptar otra.`, 
              ephemeral: true 
            });
          }
          
          // Verificar requisitos
          if (profile.character.level < mission.levelRequired) {
            return interaction.reply({ 
              content: `No cumples el nivel requerido para esta misión. Necesitas nivel ${mission.levelRequired}.`, 
              ephemeral: true 
            });
          }
          
          // Verificar restricciones de raza
          if (mission.raceRestrictions && mission.raceRestrictions.length > 0) {
            if (!mission.raceRestrictions.includes(profile.character.race)) {
              // Obtener la razón de la restricción si existe
              let reason = '';
              if (mission.restrictionReasons && mission.restrictionReasons.has(profile.character.race)) {
                reason = `\nRazón: ${mission.restrictionReasons.get(profile.character.race)}`;
              }
              
              return interaction.reply({ 
                content: `Esta misión no está disponible para la raza ${profile.character.race}.${reason}`, 
                ephemeral: true 
              });
            }
          }
          
          // Verificar restricciones de clase
          if (mission.classRestrictions && mission.classRestrictions.length > 0) {
            if (!mission.classRestrictions.includes(profile.character.class)) {
              // Obtener la razón de la restricción si existe
              let reason = '';
              if (mission.restrictionReasons && mission.restrictionReasons.has(profile.character.class)) {
                reason = `\nRazón: ${mission.restrictionReasons.get(profile.character.class)}`;
              }
              
              return interaction.reply({ 
                content: `Esta misión no está disponible para la clase ${profile.character.class}.${reason}`, 
                ephemeral: true 
              });
            }
          }
          
          // Verificar costos
          if (mission.costs) {
            // Verificar monedas
            if (mission.costs.currency > 0 && profile.character.currency < mission.costs.currency) {
              return interaction.reply({ 
                content: `No tienes suficientes monedas para aceptar esta misión. Necesitas ${mission.costs.currency} monedas.`, 
                ephemeral: true 
              });
            }
            
            // Verificar items necesarios
            if (mission.costs.items && mission.costs.items.length > 0) {
              for (const costItem of mission.costs.items) {
                const inventoryItem = profile.character.inventory.find(i => i.itemId === costItem.itemId);
                if (!inventoryItem || inventoryItem.quantity < costItem.quantity) {
                  const item = await Item.findById(costItem.itemId);
                  return interaction.reply({ 
                    content: `No tienes suficientes ${item ? item.name : 'items requeridos'} para aceptar esta misión. Necesitas ${costItem.quantity}.`, 
                    ephemeral: true 
                  });
                }
              }
            }
          }
          
          // Aplicar costos si los hay
          if (mission.costs) {
            // Restar monedas
            if (mission.costs.currency > 0) {
              profile.character.currency -= mission.costs.currency;
            }
            
            // Restar items
            if (mission.costs.items && mission.costs.items.length > 0) {
              for (const costItem of mission.costs.items) {
                const inventoryItem = profile.character.inventory.find(i => i.itemId === costItem.itemId);
                if (inventoryItem) {
                  inventoryItem.quantity -= costItem.quantity;
                  if (inventoryItem.quantity <= 0) {
                    profile.character.inventory = profile.character.inventory.filter(i => i.itemId !== costItem.itemId);
                  }
                }
              }
            }
          }
          
          // Añadir la misión a las activas
          const expiresAt = mission.duration > 0 ? new Date(Date.now() + mission.duration * 60 * 1000) : null;
          
          profile.progress.activeMissions.push({
            missionId: mission._id.toString(),
            startedAt: new Date(),
            expiresAt,
            currentStage: 0,
            progress: 0,
            completed: false
          });
          
          await profile.save();
          
          interaction.reply(`Has aceptado la misión "${mission.title}". ¡Buena suerte!`);
          break;
          
        case 'abandonar':
          // Abandonar una misión activa
          const activeMissionIndex = profile.progress.activeMissions.findIndex(m => m.missionId === missionId);
          
          if (activeMissionIndex === -1) {
            return interaction.reply({ content: 'No tienes esa misión activa.', ephemeral: true });
          }
          
          // Eliminar la misión de las activas
          profile.progress.activeMissions.splice(activeMissionIndex, 1);
          await profile.save();
          
          interaction.reply('Has abandonado la misión.');
          break;
          
        case 'info':
          // Mostrar información detallada de una misión
          const missionInfo = await Mission.findById(missionId);
          
          if (!missionInfo || missionInfo.serverId !== interaction.guild.id) {
            return interaction.reply({ content: 'Misión no encontrada.', ephemeral: true });
          }
          
          // Verificar si el usuario tiene la misión activa
          const activeMission = profile.progress.activeMissions.find(m => m.missionId === missionId);
          
          // Crear embed con la información de la misión
          const embed = new EmbedBuilder()
            .setColor(activeMission ? 0x3498db : 0xf39c12)
            .setTitle(missionInfo.title)
            .setDescription(missionInfo.description);
          
          // Información general de la misión
          embed.addFields({
            name: '📊 Información',
            value: `**Tipo:** ${missionInfo.type}\n` +
                  `**Dificultad:** ${missionInfo.difficulty}\n` +
                  `**Nivel requerido:** ${missionInfo.levelRequired}\n` +
                  `**Duración:** ${missionInfo.duration > 0 ? `${missionInfo.duration} minutos` : 'Sin límite'}`
          });
          
          // Añadir restricciones si las hay
          if (missionInfo.raceRestrictions && missionInfo.raceRestrictions.length > 0) {
            embed.addFields({
              name: '⚠️ Restricciones de Raza',
              value: missionInfo.raceRestrictions.join(', ')
            });
          }
          
          if (missionInfo.classRestrictions && missionInfo.classRestrictions.length > 0) {
            embed.addFields({
              name: '⚠️ Restricciones de Clase',
              value: missionInfo.classRestrictions.join(', ')
            });
          }
          
          // Recompensas
          let rewardsText = `**Experiencia:** ${missionInfo.rewards.experience}\n` +
                         `**Monedas:** ${missionInfo.rewards.currency}\n`;
                         
          if (missionInfo.rewards.items && missionInfo.rewards.items.length > 0) {
            const itemIds = missionInfo.rewards.items.map(i => i.itemId);
            const items = await Item.find({ _id: { $in: itemIds } });
            
            rewardsText += '**Items:**\n';
            missionInfo.rewards.items.forEach(rewardItem => {
              const item = items.find(i => i._id.toString() === rewardItem.itemId);
              if (item) {
                rewardsText += `- ${item.name} x${rewardItem.quantity}\n`;
              }
            });
          }
          
          if (missionInfo.rewards.skills && missionInfo.rewards.skills.length > 0) {
            const skills = await Skill.find({ _id: { $in: missionInfo.rewards.skills } });
            
            rewardsText += '**Habilidades:**\n';
            skills.forEach(skill => {
              rewardsText += `- ${skill.name}\n`;
            });
          }
          
          embed.addFields({
            name: '🏆 Recompensas',
            value: rewardsText
          });
          
          // Añadir progreso si la misión está activa
          if (activeMission) {
            let progressText = `**Progreso:** ${activeMission.progress}%\n`;
            
            if (activeMission.expiresAt) {
              const timeLeft = Math.max(0, Math.ceil((activeMission.expiresAt - new Date()) / 1000 / 60));
              progressText += `**Tiempo restante:** ${timeLeft} minutos\n`;
            }
            
            // Mostrar etapa actual si hay etapas
            if (missionInfo.stages && missionInfo.stages.length > 0 && activeMission.currentStage < missionInfo.stages.length) {
              const currentStage = missionInfo.stages[activeMission.currentStage];
              progressText += `**Etapa actual:** ${currentStage.name}\n`;
              progressText += `**Descripción:** ${currentStage.description}\n`;
            }
            
            embed.addFields({
              name: '📈 Progreso',
              value: progressText
            });
          }
          
          interaction.reply({ embeds: [embed] });
          break;
      }
    } catch (error) {
      console.error('Error al gestionar misión:', error);
      interaction.reply({ content: 'Ha ocurrido un error al gestionar la misión.', ephemeral: true });
    }
  }
};