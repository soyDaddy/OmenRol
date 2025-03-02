const { Events } = require('discord.js');
const Server = require('../../models/Server');

module.exports = {
  name: Events.GuildDelete,
  async execute(guild, client) {
    try {
      // Verificar si el servidor ya está en la base de datos
      let serverConfig = await Server.findOne({ serverId: guild.id });
      
      // Si no existe, crear un nuevo registro
      if (serverConfig) {
        await Server.deleteOne({ serverId: guild.id });
      }

      global.logger.logSystem(
        guild.id,
        'bot_leave',
        {
          guildName: guild.name,
          memberCount: guild.memberCount,
          timestamp: new Date()
        }
      );
      
    } catch (error) {
      console.error(`Error al irse del servidor ${guild.name}:`, error);
    }
  }
};