const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'bot',
  description: 'Ver la info del bot',
  category: 'info',
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Ver la info del bot'),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client) {
    const embed = new EmbedBuilder()
    .setTitle('Bot info')
    .setDescription(`**Nombre: ** ${client.user.username}
    **ID: ** ${client.user.id}
    **Uptime: ** ${client.uptime}`);
    const button = new ButtonBuilder()
    .setLabel('Dashboard')
    .setURL('https://dashboard.omenrol.com')
    .setStyle(ButtonStyle.Link);

    const button2 = new ButtonBuilder()
    .setLabel('Invite')
    .setURL('https://dashboard.omenrol.com')
    .setStyle(ButtonStyle.Link);

    const row = new ActionRowBuilder().addComponents(button, button2);
    message.reply({ embeds: [embed], components: [row]})

  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client) {
    const embed = new EmbedBuilder()
    .setTitle('Bot info')
    .setDescription(`**Nombre: ** ${client.user.username}
    **ID: ** ${client.user.id}
    **Uptime: ** ${client.uptime}`);
    const button = new ButtonBuilder()
    .setLabel('Dashboard')
    .setURL('https://dashboard.omenrol.com')
    .setStyle(ButtonStyle.Link);

    const button2 = new ButtonBuilder()
    .setLabel('Invite')
    .setURL('https://dashboard.omenrol.com')
    .setStyle(ButtonStyle.Link);

    const row = new ActionRowBuilder().addComponents(button, button2);
    interaction.reply({ embeds: [embed], components: [row]})
  }
};