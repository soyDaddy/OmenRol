const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');
const User = require('../../../models/User');

module.exports = {
  name: 'profile',
  aliases: ['perfil', 'p'],
  description: 'Muestra o gestiona un perfil de roleplay',
  category: 'roleplay',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Muestra o gestiona un perfil de roleplay')
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Muestra un perfil de usuario')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuario del que deseas ver el perfil (opcional)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Crea un nuevo perfil de personaje')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edita tu perfil de personaje actual')
    ),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    const subCommand = args[0]?.toLowerCase();
    
    switch (subCommand) {
      case 'show':
      case 'ver':
        await this.showProfile(message, args.slice(1), serverConfig);
        break;
      case 'create':
      case 'crear':
        await this.createProfile(message, serverConfig);
        break;
      case 'edit':
      case 'editar':
        await this.editProfile(message, serverConfig);
        break;
      default:
        // Si no se proporciona un subcomando, mostrar el perfil del usuario
        await this.showProfile(message, args, serverConfig);
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const subCommand = interaction.options.getSubcommand();
    
    switch (subCommand) {
      case 'show':
        await this.showProfileSlash(interaction, serverConfig);
        break;
      case 'create':
        await this.createProfileSlash(interaction, serverConfig);
        break;
      case 'edit':
        await this.editProfileSlash(interaction, serverConfig);
        break;
    }
  },
  
  // Mostrar perfil (comando con prefijo)
  async showProfile(message, args, serverConfig) {
    try {
      const targetUser = message.mentions.users.first() || message.author;
      
      // Buscar el perfil en la base de datos
      const profile = await Profile.findOne({
        userId: targetUser.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        return message.reply(`No se encontró un perfil para ${targetUser.username === message.author.username ? 'ti' : targetUser.username}. Puedes crear uno con \`${serverConfig.config.prefix}profile create\``);
      }
      
      // Crear embed con la información del perfil
      const embed = this.createProfileEmbed(profile, targetUser);
      
      // Crear botones
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`profile:view:${profile._id}`)
            .setLabel('Ver detalles')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`profile:inventory:${profile._id}`)
            .setLabel('Inventario')
            .setStyle(ButtonStyle.Secondary)
        );
      
      // Si el perfil pertenece al usuario o es un admin/mod
      if (targetUser.id === message.author.id || 
          message.member.permissions.has('ManageGuild') ||
          serverConfig.config.adminRoles.some(role => message.member.roles.cache.has(role))) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`profile:edit:${profile._id}`)
            .setLabel('Editar')
            .setStyle(ButtonStyle.Success)
        );
      }

      logger.logCommand(
        message.guild.id,
        message.author.id,
        'perfil',
        message.channel.id,
        {
          args: args,
          result: profile ? 'success' : 'not_found',
          targetUser: targetUser.id
        }
      );
      
      await message.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Error al mostrar perfil:', error);
      logger.logCommand(
        message.guild.id,
        message.author.id,
        'perfil',
        message.channel.id,
        {
          args: args,
          error: error.message
        }
      );
      message.reply('Ha ocurrido un error al obtener el perfil.');
    }
  },
  
  // Mostrar perfil (comando slash)
  async showProfileSlash(interaction, serverConfig) {
    try {
      await interaction.deferReply();
      
      const targetUser = interaction.options.getUser('usuario') || interaction.user;
      
      // Buscar el perfil en la base de datos
      const profile = await Profile.findOne({
        userId: targetUser.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        return interaction.editReply(`No se encontró un perfil para ${targetUser.username === interaction.user.username ? 'ti' : targetUser.username}. Puedes crear uno con \`/profile create\``);
      }
      
      // Crear embed con la información del perfil
      const embed = this.createProfileEmbed(profile, targetUser);
      
      // Crear botones
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`profile:view:${profile._id}`)
            .setLabel('Ver detalles')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`profile:inventory:${profile._id}`)
            .setLabel('Inventario')
            .setStyle(ButtonStyle.Secondary)
        );
      
      // Si el perfil pertenece al usuario o es un admin/mod
      if (targetUser.id === interaction.user.id || 
          interaction.member.permissions.has('ManageGuild') ||
          serverConfig.config.adminRoles.some(role => interaction.member.roles.cache.has(role))) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`profile:edit:${profile._id}`)
            .setLabel('Editar')
            .setStyle(ButtonStyle.Success)
        );
      }

      logger.logCommand(
        interaction.guild.id,
        interaction.user.id,
        'perfil',
        interaction.channel.id,
        {
          args: 'Show Profile',
          result: profile ? 'success' : 'not_found',
          targetUser: targetUser.id
        }
      );
      
      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Error al mostrar perfil:', error);
      logger.logCommand(
        interaction.guild.id,
        interaction.user.id,
        'perfil',
        interaction.channel.id,
        {
          args: 'Show Profile',
          error: error.message
        }
      )
      await interaction.editReply('Ha ocurrido un error al obtener el perfil.');
    }
  },
  
  // Crear perfil (comando con prefijo)
  async createProfile(message, serverConfig) {
    try {
      // Verificar si el usuario ya tiene un perfil
      const existingProfile = await Profile.findOne({
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (existingProfile) {
        return message.reply(`Ya tienes un perfil en este servidor. Usa \`${serverConfig.config.prefix}profile edit\` para editarlo.`);
      }
      
      // Enviar mensaje para continuar en el dashboard
      await message.reply(`Para crear tu perfil, visita el dashboard: http://${process.env.DASHBOARD_HOST || 'localhost'}:${process.env.DASHBOARD_PORT || 3000}/servers/${message.guild.id}/profile`);
      
      // Alternativamente, aquí se podría implementar un sistema de creación de perfil interactivo con botones y modales
    } catch (error) {
      console.error('Error al crear perfil:', error);
      message.reply('Ha ocurrido un error al crear el perfil.');
    }
  },
  
  // Crear perfil (comando slash)
  async createProfileSlash(interaction, serverConfig) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      // Verificar si el usuario ya tiene un perfil
      const existingProfile = await Profile.findOne({
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (existingProfile) {
        return interaction.editReply(`Ya tienes un perfil en este servidor. Usa \`/profile edit\` para editarlo.`);
      }
      
      // Enviar mensaje para continuar en el dashboard
      await interaction.editReply(`Para crear tu perfil, visita el dashboard: http://${process.env.DASHBOARD_HOST || 'localhost'}:${process.env.DASHBOARD_PORT || 3000}/servers/${interaction.guild.id}/profile`);
      
      // Alternativamente, aquí se podría implementar un sistema de creación de perfil interactivo con modales
    } catch (error) {
      console.error('Error al crear perfil:', error);
      await interaction.editReply('Ha ocurrido un error al crear el perfil.');
    }
  },
  
  // Editar perfil (comando con prefijo)
  async editProfile(message, serverConfig) {
    try {
      // Verificar si el usuario tiene un perfil
      const existingProfile = await Profile.findOne({
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (!existingProfile) {
        return message.reply(`No tienes un perfil en este servidor. Usa \`${serverConfig.config.prefix}profile create\` para crear uno.`);
      }
      
      // Enviar mensaje para continuar en el dashboard
      await message.reply(`Para editar tu perfil, visita el dashboard: http://${process.env.DASHBOARD_HOST || 'localhost'}:${process.env.DASHBOARD_PORT || 3000}/servers/${message.guild.id}/profile`);
      
      // Alternativamente, aquí se podría implementar un sistema de edición de perfil interactivo con botones y modales
    } catch (error) {
      console.error('Error al editar perfil:', error);
      message.reply('Ha ocurrido un error al editar el perfil.');
    }
  },
  
  // Editar perfil (comando slash)
  async editProfileSlash(interaction, serverConfig) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      // Verificar si el usuario tiene un perfil
      const existingProfile = await Profile.findOne({
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (!existingProfile) {
        return interaction.editReply(`No tienes un perfil en este servidor. Usa \`/profile create\` para crear uno.`);
      }
      
      // Enviar mensaje para continuar en el dashboard
      await interaction.editReply(`Para editar tu perfil, visita el dashboard: http://${process.env.DASHBOARD_HOST || 'localhost'}:${process.env.DASHBOARD_PORT || 3000}/servers/${interaction.guild.id}/profile`);
      
      // Alternativamente, aquí se podría implementar un sistema de edición de perfil interactivo con modales
    } catch (error) {
      console.error('Error al editar perfil:', error);
      await interaction.editReply('Ha ocurrido un error al editar el perfil.');
    }
  },
  
  // Función auxiliar para crear el embed del perfil
  createProfileEmbed(profile, user) {
    const embed = new EmbedBuilder()
      .setTitle(`${profile.character.name || user.username}`)
      .setDescription(profile.character.bio || '*Sin descripción*')
      .setColor('#3498db')
      .setThumbnail(profile.character.avatar || user.displayAvatarURL())
      .addFields(
        { name: '🧝 Raza', value: profile.character.race, inline: true },
        { name: '⚔️ Clase', value: profile.character.class, inline: true },
        { name: '👴 Edad', value: profile.character.age.toString(), inline: true },
        { name: '📊 Nivel', value: profile.character.level.toString(), inline: true },
        { name: '❤️ Salud', value: `${profile.character.health.current}/${profile.character.health.max}`, inline: true },
        { name: '💰 Monedas', value: profile.character.currency.toString(), inline: true }
      )
      .setFooter({ text: `ID: ${profile._id} • Creado` })
      .setTimestamp(profile.createdAt);
    
    // Añadir habilidades si existen
    if (profile.character.skills && profile.character.skills.length > 0) {
      const skillsText = profile.character.skills
        .map(skill => `${skill.name} (Nv. ${skill.level})`)
        .join(', ');
      
      embed.addFields({ name: '🔮 Habilidades', value: skillsText });
    }
    
    return embed;
  }
};