const { Events } = require('discord.js');
const Server = require('../../models/Server');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild, client) {
    try {
      console.log(`El bot se ha unido a un nuevo servidor: ${guild.name} (${guild.id})`);
      
      // Verificar si el servidor ya está en la base de datos
      let serverConfig = await Server.findOne({ serverId: guild.id });
      
      // Si no existe, crear un nuevo registro
      if (!serverConfig) {
        serverConfig = new Server({
          serverId: guild.id,
          name: guild.name,
          icon: guild.iconURL(),
          ownerId: guild.ownerId
        });
        
        await serverConfig.save();
        console.log(`Configuración creada para el servidor: ${guild.name}`);
      }
      
      // Intentar enviar un mensaje de bienvenida al canal principal
      const systemChannel = guild.systemChannel;
      
      if (systemChannel && systemChannel.permissionsFor(guild.members.me).has('SendMessages')) {
        await systemChannel.send({
          content: `¡Hola! Gracias por añadirme a **${guild.name}**. Puedes configurar todas mis funciones a través de mi dashboard web o utilizando el comando \`${client.config.bot.prefix}setup\`. Para ver todos mis comandos, usa \`${client.config.bot.prefix}help\`.`
        });
      }

      global.logger.logSystem(
        guild.id,
        'bot_joined',
        {
          guildName: guild.name,
          memberCount: guild.memberCount,
          timestamp: new Date()
        }
      );
      
    } catch (error) {
      console.error(`Error al unirse al servidor ${guild.name}:`, error);
    }
  }
};