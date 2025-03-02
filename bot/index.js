const { Client, GatewayIntentBits, Collection, Events, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config');
const Logger = require('../services/logger');

// Iniciar la conexión a MongoDB
mongoose.connect(config.database.uri, config.database.options).then(() => console.log('Conectado a MongoDB'))
  .catch(err => {
    console.error('Error al conectar a MongoDB:', err);
    process.exit(1);
  });

// Crear una nueva instancia del cliente de Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Colecciones para comandos y aliases
client.commands = new Collection();
client.slashCommands = new Collection();
client.aliases = new Collection();
client.cooldowns = new Collection();
client.config = config;

// Logger
const logger = new Logger(client);
global.logger = logger; 

// Cargar eventos
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// Cargar comandos tradicionales (con prefijo)
const loadPrefixCommands = () => {
  const categories = fs.readdirSync(path.join(__dirname, 'commands'));
  
  for (const category of categories) {
    const commandsPath = path.join(__dirname, 'commands', category);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      
      if (command.name) {
        client.commands.set(command.name, command);
        console.log(`Comando cargado: ${command.name} (${category})`);
        
        if (command.aliases && Array.isArray(command.aliases)) {
          command.aliases.forEach(alias => {
            client.aliases.set(alias, command.name);
          });
        }
      }
    }
  }
};

// Cargar y registrar comandos slash
const loadSlashCommands = async () => {
  const commands = [];
  const categories = fs.readdirSync(path.join(__dirname, 'commands'));
  
  for (const category of categories) {
    const commandsPath = path.join(__dirname, 'commands', category);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      
      if (command.data) {
        client.slashCommands.set(command.data.name, command);
        commands.push(command.data.toJSON());
        console.log(`Comando slash cargado: ${command.data.name} (${category})`);
      }
    }
  }
  
  // Registrar comandos slash con la API de Discord
  const rest = new REST({ version: '10' }).setToken(config.bot.token);
  
  try {
    console.log('Comenzando la actualización de comandos slash...');
    
    await rest.put(
      Routes.applicationCommands(config.bot.clientId),
      { body: commands }
    );
    
    console.log('Comandos slash actualizados con éxito');
  } catch (error) {
    console.error('Error al actualizar comandos slash:', error);
  }
};

// Evento ready
client.once(Events.ClientReady, async () => {
  console.log(`Bot listo como ${client.user.tag}`);
  
  // Cargar comandos
  loadPrefixCommands();
  await loadSlashCommands();
  
  // Establecer estado y actividad
  client.user.setPresence({
    activities: [{ name: `${config.bot.prefix}help | v${config.version}`, type: 0 }],
    status: 'online'
  });
});

// Manejar errores no capturados
process.on('unhandledRejection', error => {
  console.error('Error no manejado:', error);
});

// Iniciar sesión del bot
client.login(config.bot.token);

module.exports = client;