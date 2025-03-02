const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Profile = require('../../../models/Profile');
const Skill = require('../../../models/Skill');
const Server = require('../../../models/Server');

module.exports = {
  name: 'habilidades',
  aliases: ['skills', 'hab'],
  description: 'Muestra tus habilidades o las de otro usuario',
  category: 'roleplay',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('habilidades')
    .setDescription('Muestra tus habilidades o las de otro usuario')
    .addUserOption(option => 
      option.setName('usuario')
      .setDescription('Usuario cuyas habilidades quieres ver')
      .setRequired(false)),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client) {
    
    try {
      // Buscar configuración del servidor
      const serverConfig = await Server.findOne({ serverId: message.guild.id });
      
      if (!serverConfig || !serverConfig.roleplay.enabled) {
        return message.reply('El sistema de roleplay no está habilitado en este servidor.');
      }
      
      // Determinar el usuario objetivo
      let targetUser = message.author;
      
      if (args.length > 0) {
        const mentionedUser = message.mentions.users.first();
        if (mentionedUser) {
          targetUser = mentionedUser;
        }
      }
      
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ 
        userId: targetUser.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        return message.reply(targetUser.id === message.author.id ? 
          'No tienes un perfil de roleplay. Crea uno con el comando `!perfil`.' : 
          'Este usuario no tiene un perfil de roleplay.');
      }
      
      // Si no tiene habilidades
      if (!profile.character.skills || profile.character.skills.length === 0) {
        return message.reply(targetUser.id === message.author.id ? 
          'No has aprendido ninguna habilidad.' : 
          'Este usuario no ha aprendido ninguna habilidad.');
      }
      
      // Buscar información de las habilidades
      const skillIds = profile.character.skills.map(skill => skill.skillId);
      const skills = await Skill.find({ 
        _id: { $in: skillIds },
        serverId: message.guild.id
      });
      
      // Crear mensaje de habilidades
      const characterName = profile.character.name || targetUser.username;
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`Habilidades de ${characterName}`)
        .setDescription(`Raza: ${profile.character.race} | Clase: ${profile.character.class} | Nivel: ${profile.character.level}`)
        .setThumbnail(profile.character.avatar || targetUser.displayAvatarURL());
      
      // Agrupar habilidades por categoría
      const attackSkills = [];
      const defenseSkills = [];
      const utilitySkills = [];
      const passiveSkills = [];
      
      profile.character.skills.forEach(characterSkill => {
        const skillInfo = skills.find(s => s._id.toString() === characterSkill.skillId);
        
        if (!skillInfo) return; // Skip if skill info not found
        
        let statusText = '';
        if (characterSkill.cooldownUntil && characterSkill.cooldownUntil > new Date()) {
          const timeLeft = Math.ceil((characterSkill.cooldownUntil - new Date()) / 1000 / 60);
          statusText = ` (Cooldown: ${timeLeft} minutos)`;
        } else if (characterSkill.usesLeft !== null) {
          statusText = ` (Usos restantes: ${characterSkill.usesLeft})`;
        }
        
        const skillEntry = {
          name: `${skillInfo.name} Nv.${characterSkill.level}${statusText}`,
          value: skillInfo.description || 'Sin descripción',
          inline: true
        };
        
        switch (skillInfo.category) {
          case 'attack':
            attackSkills.push(skillEntry);
            break;
          case 'defense':
            defenseSkills.push(skillEntry);
            break;
          case 'passive':
            passiveSkills.push(skillEntry);
            break;
          default:
            utilitySkills.push(skillEntry);
        }
      });
      
      // Añadir secciones al embed
      if (attackSkills.length > 0) {
        embed.addFields({ name: '⚔️ Habilidades de Ataque', value: '\u200B' });
        attackSkills.forEach(skill => {
          embed.addFields(skill);
        });
      }
      
      if (defenseSkills.length > 0) {
        embed.addFields({ name: '🛡️ Habilidades de Defensa', value: '\u200B' });
        defenseSkills.forEach(skill => {
          embed.addFields(skill);
        });
      }
      
      if (utilitySkills.length > 0) {
        embed.addFields({ name: '🧙 Habilidades de Utilidad', value: '\u200B' });
        utilitySkills.forEach(skill => {
          embed.addFields(skill);
        });
      }
      
      if (passiveSkills.length > 0) {
        embed.addFields({ name: '📜 Habilidades Pasivas', value: '\u200B' });
        passiveSkills.forEach(skill => {
          embed.addFields(skill);
        });
      }
      
      message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error al mostrar habilidades:', error);
      message.reply('Ha ocurrido un error al mostrar las habilidades.');
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client) {
    
    try {
      // Buscar configuración del servidor
      const serverConfig = await Server.findOne({ serverId: interaction.guild.id });
      
      if (!serverConfig || !serverConfig.roleplay.enabled) {
        return interaction.reply({ content: 'El sistema de roleplay no está habilitado en este servidor.', ephemeral: true });
      }
      
      // Determinar el usuario objetivo
      let targetUser = interaction.options.getUser('usuario') || interaction.user;
      
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ 
        userId: targetUser.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        return interaction.reply({ 
          content: targetUser.id === interaction.user.id ? 
            'No tienes un perfil de roleplay. Crea uno con el comando `/perfil`.' : 
            'Este usuario no tiene un perfil de roleplay.',
          ephemeral: true
        });
      }
      
      // Si no tiene habilidades
      if (!profile.character.skills || profile.character.skills.length === 0) {
        return interaction.reply({
          content: targetUser.id === interaction.user.id ? 
            'No has aprendido ninguna habilidad.' : 
            'Este usuario no ha aprendido ninguna habilidad.',
          ephemeral: true
        });
      }
      
      // Buscar información de las habilidades
      const skillIds = profile.character.skills.map(skill => skill.skillId);
      const skills = await Skill.find({ 
        _id: { $in: skillIds },
        serverId: interaction.guild.id
      });
      
      // Crear mensaje de habilidades
      const characterName = profile.character.name || targetUser.username;
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`Habilidades de ${characterName}`)
        .setDescription(`Raza: ${profile.character.race} | Clase: ${profile.character.class} | Nivel: ${profile.character.level}`)
        .setThumbnail(profile.character.avatar || targetUser.displayAvatarURL());
      
      // Agrupar habilidades por categoría
      const attackSkills = [];
      const defenseSkills = [];
      const utilitySkills = [];
      const passiveSkills = [];
      
      profile.character.skills.forEach(characterSkill => {
        const skillInfo = skills.find(s => s._id.toString() === characterSkill.skillId);
        
        if (!skillInfo) return; // Skip if skill info not found
        
        let statusText = '';
        if (characterSkill.cooldownUntil && characterSkill.cooldownUntil > new Date()) {
          const timeLeft = Math.ceil((characterSkill.cooldownUntil - new Date()) / 1000 / 60);
          statusText = ` (Cooldown: ${timeLeft} minutos)`;
        } else if (characterSkill.usesLeft !== null) {
          statusText = ` (Usos restantes: ${characterSkill.usesLeft})`;
        }
        
        const skillEntry = {
          name: `${skillInfo.name} Nv.${characterSkill.level}${statusText}`,
          value: skillInfo.description || 'Sin descripción',
          inline: true
        };
        
        switch (skillInfo.category) {
          case 'attack':
            attackSkills.push(skillEntry);
            break;
          case 'defense':
            defenseSkills.push(skillEntry);
            break;
          case 'passive':
            passiveSkills.push(skillEntry);
            break;
          default:
            utilitySkills.push(skillEntry);
        }
      });
      
      // Añadir secciones al embed
      if (attackSkills.length > 0) {
        embed.addFields({ name: '⚔️ Habilidades de Ataque', value: '\u200B' });
        attackSkills.forEach(skill => {
          embed.addFields(skill);
        });
      }
      
      if (defenseSkills.length > 0) {
        embed.addFields({ name: '🛡️ Habilidades de Defensa', value: '\u200B' });
        defenseSkills.forEach(skill => {
          embed.addFields(skill);
        });
      }
      
      if (utilitySkills.length > 0) {
        embed.addFields({ name: '🧙 Habilidades de Utilidad', value: '\u200B' });
        utilitySkills.forEach(skill => {
          embed.addFields(skill);
        });
      }
      
      if (passiveSkills.length > 0) {
        embed.addFields({ name: '📜 Habilidades Pasivas', value: '\u200B' });
        passiveSkills.forEach(skill => {
          embed.addFields(skill);
        });
      }
      
      interaction.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error al mostrar habilidades:', error);
      interaction.reply({ content: 'Ha ocurrido un error al mostrar las habilidades.', ephemeral: true });
    }
  }
};