const { Events, Collection } = require('discord.js');
const Server = require('../../models/Server');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Ignorar mensajes de bots o DM
    if (message.author.bot || !message.guild) return;
    
    try {
      // Obtener configuración del servidor o crear si no existe
      let serverConfig = await Server.findOne({ serverId: message.guild.id });
      
      if (!serverConfig) {
        serverConfig = new Server({
          serverId: message.guild.id,
          name: message.guild.name,
          icon: message.guild.iconURL(),
          ownerId: message.guild.ownerId
        });
        await serverConfig.save();
      }
      
      // Actualizar estadísticas
      serverConfig.stats.totalMessages += 1;
      
      // Obtener prefijo del servidor o usar el predeterminado
      const prefix = serverConfig.config?.prefix || client.config.bot.prefix;
      
      // Verificar si el mensaje comienza con el prefijo
      if (!message.content.startsWith(prefix)) return;
      
      // Extraer argumentos y nombre del comando
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      
      // Buscar el comando por nombre o alias
      const command = client.commands.get(commandName) || client.commands.get(client.aliases.get(commandName));
      
      if (!command) return;
      
      // Verificar permisos
      if (command.permissions && command.permissions.length > 0) {
        const missingPermissions = command.permissions.filter(perm => 
          !message.member.permissions.has(perm)
        );
        
        if (missingPermissions.length > 0) {
          return message.reply({ content: `No tienes los permisos necesarios para usar este comando. Necesitas: ${missingPermissions.join(', ')}` });
        }
      }
      
      // Sistema de cooldown
      if (!client.cooldowns.has(command.name)) {
        client.cooldowns.set(command.name, new Collection());
      }
      
      const now = Date.now();
      const timestamps = client.cooldowns.get(command.name);
      const cooldownAmount = (command.cooldown || 3) * 1000;
      
      if (timestamps.has(message.author.id)) {
        const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
        
        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          return message.reply({ content: `Por favor espera ${timeLeft.toFixed(1)} segundos antes de usar el comando \`${command.name}\` nuevamente.` });
        }
      }
      
      timestamps.set(message.author.id, now);
      setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);
      
      // Actualizar estadísticas del comando
      if (!serverConfig.stats.commandUsage.has(command.name)) {
        serverConfig.stats.commandUsage.set(command.name, 0);
      }
      serverConfig.stats.commandUsage.set(
        command.name, 
        serverConfig.stats.commandUsage.get(command.name) + 1
      );
      
      // Guardar cambios en el servidor
      await serverConfig.save();
      
      // Ejecutar el comando
      try {
        command.execute(message, args, client, serverConfig);
      } catch (error) {
        console.error(`Error ejecutando el comando ${command.name}:`, error);
        message.reply({ content: 'Hubo un error al ejecutar el comando. Por favor, inténtalo de nuevo más tarde.' });
      }
    } catch (error) {
      console.error('Error en el evento messageCreate:', error);
    }
  }
};