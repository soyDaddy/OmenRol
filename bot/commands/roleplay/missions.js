const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');
const { Mission } = require('../../../models/Missions');
const Server = require('../../../models/Server');

module.exports = {
  name: 'misiones',
  description: 'Muestra tus misiones disponibles en un menú.',
  category: 'roleplay',

  data: new SlashCommandBuilder()
    .setName('misiones')
    .setDescription('Muestra tus misiones activas o lista las misiones disponibles')
    .addStringOption(option => 
      option.setName('tipo')
      .setDescription('Tipo de misiones a mostrar')
      .setRequired(false)
      .addChoices(
        { name: 'Activas', value: 'activas' },
        { name: 'Disponibles', value: 'disponibles' }
      )),

  async executeSlash(interaction, client) {
    try {
      const serverConfig = await Server.findOne({ serverId: interaction.guild.id });
      if (!serverConfig || !serverConfig.roleplay.enabled) {
        return interaction.reply({ content: 'El sistema de roleplay no está habilitado en este servidor.', ephemeral: true });
      }

      const profile = await Profile.findOne({ userId: interaction.user.id, serverId: interaction.guild.id });
      if (!profile) {
        return interaction.reply({ content: 'No tienes un perfil de roleplay. Usa `/perfil` para crearlo.', ephemeral: true });
      }

      const now = new Date();
      const availableMissions = await Mission.find({
        serverId: interaction.guild.id,
        status: 'active',
        levelRequired: { $lte: profile.character.level },
        $or: [
          { raceRestrictions: { $size: 0 } },
          { raceRestrictions: profile.character.race }
        ],
        $or: [
          { classRestrictions: { $size: 0 } },
          { classRestrictions: profile.character.class }
        ],
        $or: [
          { availableFrom: null },
          { availableFrom: { $lte: now } }
        ],
        $or: [
          { availableUntil: null },
          { availableUntil: { $gt: now } }
        ]
      });

      if (availableMissions.length === 0) {
        return interaction.reply({ content: 'No hay misiones disponibles en este momento.', ephemeral: true });
      }

      // Función para crear un menú de selección
      function createMissionMenus(missions, page = 0) {
        const maxItemsPerMenu = 25;
        const menus = [];

        for (let i = 0; i < missions.length; i += maxItemsPerMenu) {
          const options = missions.slice(i, i + maxItemsPerMenu).map(m => ({
            label: `${m.title}`.substring(0, 100),
            description: m.description.substring(0, 100),
            value: m._id.toString()
          }));

          const menu = new StringSelectMenuBuilder()
            .setCustomId(`mission_select_${page}`)
            .setPlaceholder('Selecciona una misión')
            .addOptions(options);

          menus.push(new ActionRowBuilder().addComponents(menu));
        }

        return menus;
      }

      // Función para crear los botones de navegación
      function createPaginationButtons(currentPage, totalPages) {
        const buttons = new ActionRowBuilder();

        if (currentPage > 0) {
          buttons.addComponents(
            new ButtonBuilder()
              .setCustomId(`prev_page_${currentPage}`)
              .setLabel('⬅️ Anterior')
              .setStyle(ButtonStyle.Primary)
          );
        }

        if (currentPage < totalPages - 1) {
          buttons.addComponents(
            new ButtonBuilder()
              .setCustomId(`next_page_${currentPage}`)
              .setLabel('➡️ Siguiente')
              .setStyle(ButtonStyle.Primary)
          );
        }

        return buttons;
      }

      const pageSize = 100;
      const totalPages = Math.ceil(availableMissions.length / pageSize);
      const currentPage = 0;

      const paginatedMissions = availableMissions.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
      const missionMenus = createMissionMenus(paginatedMissions, currentPage);
      const paginationButtons = createPaginationButtons(currentPage, totalPages);

      // Determinar el modo (activas o disponibles)
      const mode = interaction.options.getString('tipo');
      
      if (mode === 'disponibles') {
        // Mostrar misiones disponibles
        const now = new Date();
        
        // Buscar misiones disponibles según el nivel, raza y clase del personaje
        const availableMissions = await Mission.find({
          serverId: interaction.guild.id,
          status: 'active',
          levelRequired: { $lte: profile.character.level },
          $or: [
            { raceRestrictions: { $size: 0 } },
            { raceRestrictions: profile.character.race }
          ],
          $or: [
            { classRestrictions: { $size: 0 } },
            { classRestrictions: profile.character.class }
          ],
          $or: [
            { availableFrom: null },
            { availableFrom: { $lte: now } }
          ],
          $or: [
            { availableUntil: null },
            { availableUntil: { $gt: now } }
          ]
        }).limit(10);
        
        if (availableMissions.length === 0) {
          return interaction.reply({ 
            content: 'No hay misiones disponibles para ti en este momento.',
            ephemeral: true
          });
        }
        
        // Crear embed con las misiones disponibles
        const embed = new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle('📜 Misiones Disponibles')
          .setDescription('Estas son las misiones que puedes aceptar:');
        
        availableMissions.forEach(mission => {
          let difficulty = '';
          switch (mission.difficulty) {
            case 'easy': difficulty = '🟢 Fácil'; break;
            case 'medium': difficulty = '🟡 Media'; break;
            case 'hard': difficulty = '🟠 Difícil'; break;
            case 'extreme': difficulty = '🔴 Extrema'; break;
          }
          
          embed.addFields({
            name: `${mission.title} - ${difficulty}`,
            value: `${mission.description}\n` +
                  `**Recompensas:** ${mission.rewards.experience} EXP, ${mission.rewards.currency} monedas\n` +
                  `Para aceptar esta misión, usa \`/mision aceptar\` con el ID \`${mission._id}\``
          });
        });
        
        interaction.reply({ embeds: [embed] });
        
      } else {
        // Mostrar misiones activas por defecto
        if (!profile.progress.activeMissions || profile.progress.activeMissions.length === 0) {
          return interaction.reply({
            content: 'No tienes misiones activas. Usa `/misiones disponibles` para ver las misiones que puedes aceptar.',
            ephemeral: true
          });
        }
        
        // Buscar información detallada de las misiones activas
        const missionIds = profile.progress.activeMissions.map(m => m.missionId);
        const missions = await Mission.find({ 
          _id: { $in: missionIds }
        });
        
        // Crear embed con las misiones activas
        const embed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle('🗺️ Tus Misiones Activas')
          .setThumbnail(profile.character.avatar || interaction.user.displayAvatarURL());
        
        profile.progress.activeMissions.forEach(activeMission => {
          const missionInfo = missions.find(m => m._id.toString() === activeMission.missionId);
          
          if (!missionInfo) return; // Skip if mission info not found
          
          let expiryInfo = '';
          if (activeMission.expiresAt && activeMission.expiresAt > new Date()) {
            const timeLeft = Math.ceil((activeMission.expiresAt - new Date()) / 1000 / 60 / 60);
            expiryInfo = `\nTiempo restante: ${timeLeft} horas`;
          }
          
          let stageInfo = '';
          if (missionInfo.stages && missionInfo.stages.length > 0) {
            const currentStage = missionInfo.stages[activeMission.currentStage];
            if (currentStage) {
              stageInfo = `\n**Etapa actual:** ${currentStage.name} - ${activeMission.progress}%`;
            }
          }
          
          embed.addFields({
            name: missionInfo.title,
            value: `${missionInfo.description}\n` +
                  `**Progreso:** ${activeMission.completed ? 'Completada' : `En progreso ${activeMission.progress}%`}` +
                  stageInfo +
                  expiryInfo
          });
        });
        
        interaction.reply({ embeds: [embed] });
      }

    } catch (error) {
      console.error('Error al mostrar las misiones:', error);
      return interaction.reply({ content: 'Hubo un error al mostrar las misiones.', ephemeral: true });
    }
  }
};
