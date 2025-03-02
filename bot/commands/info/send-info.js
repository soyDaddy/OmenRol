const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  // Definir el comando Slash
  data: new SlashCommandBuilder()
    .setName('send-info')
    .setDescription('Envía la información para que los usuarios creen su perfil'),

  // Ejecutar el comando Slash
  async executeSlash(interaction) {
    try {
      // Crear el embed
      const embed = new EmbedBuilder()
        .setTitle('📜 **Roleplay Info**')
        .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 1024 }))
        .setDescription('🎭 Para crear tu perfil de roleplay, haz click en el botón de abajo.')
        .setColor('#3498db')
        .setFooter({ text: '¡Diviértete en el rol!' })

      // Crear el botón
      const button = new ButtonBuilder()
        .setLabel('🔗 Crear Perfil')
        .setURL(`https://roleplay.pulsey.xyz/servers/${interaction.guild.id}/profile`)
        .setStyle(ButtonStyle.Link);

      // Crear la fila de botones
      const row = new ActionRowBuilder().addComponents(button);

      // Confirmar la ejecución del comando al usuario
      await interaction.reply({ content: '✅ Información enviada con éxito.', ephemeral: true });

      // Enviar el embed con el botón al canal
      await interaction.channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Error al ejecutar el comando send-info:', error);
      await interaction.reply({ content: '❌ Ocurrió un error al enviar la información.', ephemeral: true });
    }
  },
};
