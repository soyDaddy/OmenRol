const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'test',
  aliases: ['t'],
  description: 'Probar si el bot funciona',
  category: 'mod',
  cooldown: 0,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('Probar si el bot funciona'),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client) {
    const embed = new EmbedBuilder()
    .setTitle('Test')
    .setDescription('El bot funciona correctamente');

    message.reply({ embeds: [embed]})
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client) {
    const embed = new EmbedBuilder()
    .setTitle('Test')
    .setDescription('El bot funciona correctamente');

    interaction.reply({ embeds: [embed]})
  }
};