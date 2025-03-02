const { Events } = require('discord.js');
const Server = require('../../models/Server');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // Ignorar interacciones que no son de un servidor
    if (!interaction.guild) return;
    
    try {
      // Obtener configuración del servidor
      let serverConfig = await Server.findOne({ serverId: interaction.guild.id });
      
      if (!serverConfig) {
        serverConfig = new Server({
          serverId: interaction.guild.id,
          name: interaction.guild.name,
          icon: interaction.guild.iconURL(),
          ownerId: interaction.guild.ownerId
        });
        await serverConfig.save();
      }
      
      // Manejar comandos slash
      if (interaction.isChatInputCommand()) {
        const command = client.slashCommands.get(interaction.commandName);
        
        if (!command) {
          console.error(`No se encontró el comando slash ${interaction.commandName}`);
          return interaction.reply({ content: 'Ha ocurrido un error con este comando.', ephemeral: true });
        }
        
        // Actualizar estadísticas del comando
        if (!serverConfig.stats.commandUsage.has(interaction.commandName)) {
          serverConfig.stats.commandUsage.set(interaction.commandName, 0);
        }
        
        serverConfig.stats.commandUsage.set(
          interaction.commandName, 
          serverConfig.stats.commandUsage.get(interaction.commandName) + 1
        );
        
        await serverConfig.save();
        
        // Ejecutar el comando
        try {
          await command.executeSlash(interaction, client, serverConfig);
        } catch (error) {
          console.error(`Error ejecutando el comando slash ${interaction.commandName}:`, error);
          
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Hubo un error al ejecutar este comando.', ephemeral: true });
          } else {
            await interaction.reply({ content: 'Hubo un error al ejecutar este comando.', ephemeral: true });
          }
        }
      }
    } catch (error) {
      console.error('Error en el evento interactionCreate:', error);
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Ha ocurrido un error inesperado.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Ha ocurrido un error inesperado.', ephemeral: true });
      }
    }
  }
};