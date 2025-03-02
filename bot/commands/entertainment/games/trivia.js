const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Profile = require('../../../../models/Profile');
const TriviaQuestion = require('../../../../models/TriviaQuestion');

// Preguntas por defecto (se usarán si no hay preguntas en la DB)
const defaultQuestions = [
  {
    question: '¿Cuál es el planeta más grande del sistema solar?',
    options: ['Tierra', 'Júpiter', 'Saturno', 'Neptuno'],
    answer: 1, // Júpiter
    difficulty: 'fácil',
    category: 'Ciencia'
  },
  {
    question: '¿Quién pintó la Mona Lisa?',
    options: ['Vincent van Gogh', 'Pablo Picasso', 'Leonardo da Vinci', 'Miguel Ángel'],
    answer: 2, // Leonardo da Vinci
    difficulty: 'fácil',
    category: 'Arte'
  },
  {
    question: '¿Cuál es el hueso más largo del cuerpo humano?',
    options: ['Fémur', 'Húmero', 'Tibia', 'Radio'],
    answer: 0, // Fémur
    difficulty: 'medio',
    category: 'Ciencia'
  },
  {
    question: '¿En qué año comenzó la Primera Guerra Mundial?',
    options: ['1910', '1914', '1918', '1939'],
    answer: 1, // 1914
    difficulty: 'medio',
    category: 'Historia'
  },
  {
    question: '¿Cuál es el elemento químico con símbolo "Au"?',
    options: ['Plata', 'Oro', 'Aluminio', 'Argón'],
    answer: 1, // Oro
    difficulty: 'medio',
    category: 'Ciencia'
  }
];

module.exports = {
  // Obtener una pregunta aleatoria para un servidor específico
  async getRandomQuestion(serverId) {
    try {
      // Buscar preguntas específicas del servidor y globales que estén habilitadas
      const questions = await TriviaQuestion.find({
        $or: [
          { createdInServerId: serverId, isGlobal: false }, // Preguntas específicas de este servidor
          { isGlobal: true } // Preguntas globales
        ],
        enabled: true
      });
      
      // Si no hay preguntas en la base de datos, usar las predeterminadas
      if (!questions || questions.length === 0) {
        return defaultQuestions[Math.floor(Math.random() * defaultQuestions.length)];
      }
      
      // Seleccionar una pregunta aleatoria
      const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
      
      // Incrementar el contador de veces preguntada
      randomQuestion.stats.timesAsked += 1;
      await randomQuestion.save();
      
      return randomQuestion;
    } catch (error) {
      console.error('Error al obtener pregunta de trivia:', error);
      // En caso de error, devolver una pregunta predeterminada
      return defaultQuestions[Math.floor(Math.random() * defaultQuestions.length)];
    }
  },
  
  // Actualizar estadísticas de la pregunta
  async updateQuestionStats(questionId, correct) {
    if (!questionId) return; // Si es una pregunta predeterminada, no tiene ID
    
    try {
      const question = await TriviaQuestion.findById(questionId);
      if (!question) return;
      
      if (correct) {
        question.stats.timesCorrect += 1;
      } else {
        question.stats.timesWrong += 1;
      }
      
      await question.save();
    } catch (error) {
      console.error('Error al actualizar estadísticas de pregunta:', error);
    }
  },
  
  // Determinar la recompensa basada en la dificultad
  calculateReward(difficulty) {
    switch (difficulty) {
      case 'fácil':
        return Math.floor(Math.random() * 6) + 5; // 5-10 monedas
      case 'medio':
        return Math.floor(Math.random() * 11) + 10; // 10-20 monedas
      case 'difícil':
        return Math.floor(Math.random() * 16) + 20; // 20-35 monedas
      default:
        return 10;
    }
  },
  
  // Juego de trivia (con prefijo)
  async playTriviaGame(message, serverConfig) {
    try {
      // Verificar si el usuario tiene un perfil
      const profile = await Profile.findOne({
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        return message.reply(`No tienes un perfil en este servidor. Crea uno con \`${serverConfig.config.prefix}profile create\` para ganar monedas.`);
      }
      
      // Obtener una pregunta aleatoria
      const randomQuestion = await this.getRandomQuestion(message.guild.id);
      
      // Crear el embed con la pregunta
      const questionEmbed = new EmbedBuilder()
        .setTitle(`❓ Trivia - ${randomQuestion.category || 'General'}`)
        .setDescription(randomQuestion.question)
        .setColor('#9b59b6')
        .setFooter({ text: `Dificultad: ${randomQuestion.difficulty} • Tienes 20 segundos para responder` });
      
      // Crear botones para las opciones
      const row = new ActionRowBuilder()
        .addComponents(
          randomQuestion.options.map((option, index) =>
            new ButtonBuilder()
              .setCustomId(`trivia:${message.author.id}:${index}:${randomQuestion.answer}:${randomQuestion._id || 'default'}`)
              .setLabel(option)
              .setStyle(ButtonStyle.Secondary)
          )
        );
      
      const response = await message.reply({ embeds: [questionEmbed], components: [row] });
      
      // Crear collector para los botones
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 20000, // 20 segundos
        filter: i => i.customId.startsWith(`trivia:${message.author.id}`)
      });
      
      collector.on('collect', async i => {
        // Verificar que sea el usuario que inició el juego
        if (i.user.id !== message.author.id) {
          return i.reply({
            content: '¡Esta trivia no es tuya! Inicia tu propia trivia con el comando minigame.',
            ephemeral: true
          });
        }
        
        const [_, userId, selectedOption, correctOption, questionId] = i.customId.split(':');
        const selected = parseInt(selectedOption);
        const correct = parseInt(correctOption);
        
        // Determinar si la respuesta es correcta
        if (selected === correct) {
          // Calcular recompensa basada en la dificultad
          const reward = this.calculateReward(randomQuestion.difficulty);
          
          // Actualizar perfil
          profile.character.currency += reward;
          await profile.save();
          
          // Actualizar estadísticas de la pregunta
          await this.updateQuestionStats(questionId !== 'default' ? questionId : null, true);
          
          const correctEmbed = new EmbedBuilder()
            .setTitle('✅ ¡Respuesta Correcta!')
            .setDescription(`La respuesta "${randomQuestion.options[correct]}" es correcta.\n\nHas ganado ${reward} monedas.`)
            .setColor('#2ecc71')
            .setFooter({ text: `Balance actual: ${profile.character.currency} monedas` });
          
          await i.update({ embeds: [correctEmbed], components: [] });
        } else {
          // Actualizar estadísticas de la pregunta
          await this.updateQuestionStats(questionId !== 'default' ? questionId : null, false);
          
          const wrongEmbed = new EmbedBuilder()
            .setTitle('❌ Respuesta Incorrecta')
            .setDescription(`Tu respuesta "${randomQuestion.options[selected]}" es incorrecta.\nLa respuesta correcta era "${randomQuestion.options[correct]}".`)
            .setColor('#e74c3c')
            .setFooter({ text: `Usa "${serverConfig.config.prefix}minigame trivia" para jugar de nuevo.` });
          
          await i.update({ embeds: [wrongEmbed], components: [] });
        }
        
        collector.stop();
      });
      
      collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ Tiempo agotado')
            .setDescription(`Se acabó el tiempo. La respuesta correcta era "${randomQuestion.options[randomQuestion.answer]}".`)
            .setColor('#7f8c8d');
          
          response.edit({ embeds: [timeoutEmbed], components: [] }).catch(console.error);
        }
      });
      
    } catch (error) {
      console.error('Error en el minijuego de trivia:', error);
      message.reply('Ha ocurrido un error al iniciar el minijuego.');
    }
  },
  
  // Juego de trivia (slash)
  async playTriviaGameSlash(interaction, serverConfig) {
    try {
      // Verificar si el usuario tiene un perfil
      const profile = await Profile.findOne({
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        return interaction.editReply(`No tienes un perfil en este servidor. Crea uno con \`/profile create\` para ganar monedas.`);
      }
      
      // Obtener una pregunta aleatoria
      const randomQuestion = await this.getRandomQuestion(interaction.guild.id);
      
      // Crear el embed con la pregunta
      const questionEmbed = new EmbedBuilder()
        .setTitle(`❓ Trivia - ${randomQuestion.category || 'General'}`)
        .setDescription(randomQuestion.question)
        .setColor('#9b59b6')
        .setFooter({ text: `Dificultad: ${randomQuestion.difficulty} • Tienes 20 segundos para responder` });
      
      // Crear botones para las opciones
      const row = new ActionRowBuilder()
        .addComponents(
          randomQuestion.options.map((option, index) =>
            new ButtonBuilder()
              .setCustomId(`trivia:${interaction.user.id}:${index}:${randomQuestion.answer}:${randomQuestion._id || 'default'}`)
              .setLabel(option)
              .setStyle(ButtonStyle.Secondary)
          )
        );
      
      const response = await interaction.editReply({ embeds: [questionEmbed], components: [row] });
      
      // Crear collector para los botones
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 20000, // 20 segundos
        filter: i => i.customId.startsWith(`trivia:${interaction.user.id}`)
      });
      
      collector.on('collect', async i => {
        // Verificar que sea el usuario que inició el juego
        if (i.user.id !== interaction.user.id) {
          return i.reply({
            content: '¡Esta trivia no es tuya! Inicia tu propia trivia con el comando minigame.',
            ephemeral: true
          });
        }
        
        const [_, userId, selectedOption, correctOption, questionId] = i.customId.split(':');
        const selected = parseInt(selectedOption);
        const correct = parseInt(correctOption);
        
        // Determinar si la respuesta es correcta
        if (selected === correct) {
          // Calcular recompensa basada en la dificultad
          const reward = this.calculateReward(randomQuestion.difficulty);
          
          // Actualizar perfil
          profile.character.currency += reward;
          await profile.save();
          
          // Actualizar estadísticas de la pregunta
          await this.updateQuestionStats(questionId !== 'default' ? questionId : null, true);
          
          const correctEmbed = new EmbedBuilder()
            .setTitle('✅ ¡Respuesta Correcta!')
            .setDescription(`La respuesta "${randomQuestion.options[correct]}" es correcta.\n\nHas ganado ${reward} monedas.`)
            .setColor('#2ecc71')
            .setFooter({ text: `Balance actual: ${profile.character.currency} monedas` });
          
          await i.update({ embeds: [correctEmbed], components: [] });
        } else {
          // Actualizar estadísticas de la pregunta
          await this.updateQuestionStats(questionId !== 'default' ? questionId : null, false);
          
          const wrongEmbed = new EmbedBuilder()
            .setTitle('❌ Respuesta Incorrecta')
            .setDescription(`Tu respuesta "${randomQuestion.options[selected]}" es incorrecta.\nLa respuesta correcta era "${randomQuestion.options[correct]}".`)
            .setColor('#e74c3c')
            .setFooter({ text: 'Usa "/minigame trivia" para jugar de nuevo.' });
          
          await i.update({ embeds: [wrongEmbed], components: [] });
        }
        
        collector.stop();
      });
      
      collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ Tiempo agotado')
            .setDescription(`Se acabó el tiempo. La respuesta correcta era "${randomQuestion.options[randomQuestion.answer]}".`)
            .setColor('#7f8c8d');
          
          interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(console.error);
        }
      });
      
    } catch (error) {
      console.error('Error en el minijuego de trivia:', error);
      interaction.editReply('Ha ocurrido un error al iniciar el minijuego.');
    }
  }
};