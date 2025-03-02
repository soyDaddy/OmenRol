const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const guessGame = require('./games/guess');
const memoryGame = require('./games/memory');
const triviaGame = require('./games/trivia');

module.exports = {
  name: 'minigame',
  aliases: ['mg', 'juego'],
  description: 'Juega un minijuego para ganar monedas',
  category: 'entertainment',
  cooldown: 10,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('minigame')
    .setDescription('Juega un minijuego para ganar monedas')
    .addSubcommand(subcommand =>
      subcommand
        .setName('guess')
        .setDescription('Adivina el número correcto')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('memory')
        .setDescription('Juega a memoria de emojis')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('trivia')
        .setDescription('Responde preguntas de trivia')
    ),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    const subCommand = args[0]?.toLowerCase();
    
    switch (subCommand) {
      case 'guess':
      case 'adivina':
        await guessGame.playGuessGame(message, serverConfig);
        break;
      case 'memory':
      case 'memoria':
        await memoryGame.playMemoryGame(message, serverConfig);
        break;
      case 'trivia':
        await triviaGame.playTriviaGame(message, serverConfig);
        break;
      default:
        // Si no se proporciona un subcomando, mostrar opciones disponibles
        await this.showOptions(message, serverConfig);
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const subCommand = interaction.options.getSubcommand();
    
    await interaction.deferReply();
    
    switch (subCommand) {
      case 'guess':
        await guessGame.playGuessGameSlash(interaction, serverConfig);
        break;
      case 'memory':
        await memoryGame.playMemoryGameSlash(interaction, serverConfig);
        break;
      case 'trivia':
        await triviaGame.playTriviaGameSlash(interaction, serverConfig);
        break;
    }
  },
  
  // Mostrar opciones de juegos
  async showOptions(message, serverConfig) {
    const embed = new EmbedBuilder()
      .setTitle('🎮 Minijuegos')
      .setDescription('Elige uno de los siguientes minijuegos para ganar monedas:')
      .setColor('#e74c3c')
      .addFields(
        { name: '🔢 Adivina el número', value: `\`${serverConfig.config.prefix}minigame guess\`` },
        { name: '🧠 Memoria de emojis', value: `\`${serverConfig.config.prefix}minigame memory\`` },
        { name: '❓ Trivia', value: `\`${serverConfig.config.prefix}minigame trivia\`` }
      )
      .setFooter({ text: '¡Gana monedas para mejorar tu personaje!' });
    
    await message.reply({ embeds: [embed] });
  }
};