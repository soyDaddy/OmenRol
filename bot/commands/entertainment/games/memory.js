const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Profile = require('../../../../models/Profile');

module.exports = {
  // Juego de memoria (con prefijo)
  async playMemoryGame(message, serverConfig) {
    try {
      // Verificar si el usuario tiene un perfil
      const profile = await Profile.findOne({
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        return message.reply(`No tienes un perfil en este servidor. Crea uno con \`${serverConfig.config.prefix}profile create\` para ganar monedas.`);
      }
      
      // Emojis para el juego
      const emojis = ['🍎', '🍌', '🍇', '🍊', '🍒', '🍓', '🥝', '🥥', '🍉', '🥭'];
      
      // Elegir 5 emojis aleatorios
      const gameEmojis = [];
      const usedIndexes = new Set();
      
      while (gameEmojis.length < 5) {
        const randomIndex = Math.floor(Math.random() * emojis.length);
        if (!usedIndexes.has(randomIndex)) {
          usedIndexes.add(randomIndex);
          gameEmojis.push(emojis[randomIndex]);
        }
      }
      
      // Crear el embed de inicio
      const startEmbed = new EmbedBuilder()
        .setTitle('🧠 Juego de Memoria')
        .setDescription('Memoriza la secuencia de emojis. Tendrás 5 segundos para verla, y luego deberás seleccionarlos en el orden correcto.')
        .setColor('#3498db')
        .setFooter({ text: 'El juego comenzará en unos segundos...' });
      
      const startMessage = await message.reply({ embeds: [startEmbed] });
      
      // Mostrar los emojis a memorizar
      setTimeout(async () => {
        const sequenceEmbed = new EmbedBuilder()
          .setTitle('🧠 Memoriza esta secuencia')
          .setDescription(`${gameEmojis.join(' ')}`)
          .setColor('#3498db')
          .setFooter({ text: 'Tienes 5 segundos para memorizar' });
        
        await startMessage.edit({ embeds: [sequenceEmbed] });
        
        // Ocultar los emojis después de 5 segundos y mostrar los botones
        setTimeout(async () => {
          const playEmbed = new EmbedBuilder()
            .setTitle('🧠 Juego de Memoria')
            .setDescription('Selecciona los emojis en el orden correcto')
            .setColor('#3498db')
            .setFooter({ text: 'Haz clic en los emojis en el orden que aparecieron' });
          
          // Crear botones con todos los emojis en orden aleatorio
          const shuffledEmojis = [...emojis].sort(() => 0.5 - Math.random()).slice(0, 10);
          
          const row1 = new ActionRowBuilder()
            .addComponents(
              shuffledEmojis.slice(0, 5).map(emoji =>
                new ButtonBuilder()
                  .setCustomId(`memory:${message.author.id}:${emoji}:0`)
                  .setLabel(emoji)
                  .setStyle(ButtonStyle.Secondary)
              )
            );
          
          const row2 = new ActionRowBuilder()
            .addComponents(
              shuffledEmojis.slice(5, 10).map(emoji =>
                new ButtonBuilder()
                  .setCustomId(`memory:${message.author.id}:${emoji}:0`)
                  .setLabel(emoji)
                  .setStyle(ButtonStyle.Secondary)
              )
            );
          
          const gameMessage = await startMessage.edit({ embeds: [playEmbed], components: [row1, row2] });
          
          // Variables para el seguimiento del juego
          let userSequence = [];
          let currentStep = 0;
          
          // Crear collector para los botones
          const collector = gameMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000, // 30 segundos
            filter: i => i.customId.startsWith(`memory:${message.author.id}`)
          });
          
          collector.on('collect', async i => {
            // Verificar que sea el usuario que inició el juego
            if (i.user.id !== message.author.id) {
              return i.reply({
                content: '¡Este juego no es tuyo! Inicia tu propio juego con el comando minigame.',
                ephemeral: true
              });
            }
            
            const [_, userId, selectedEmoji] = i.customId.split(':');
            userSequence.push(selectedEmoji);
            currentStep++;
            
            // Actualizar el embed con la selección actual
            const updatedEmbed = new EmbedBuilder()
              .setTitle('🧠 Juego de Memoria')
              .setDescription(`Selección actual: ${userSequence.join(' ')}`)
              .setColor('#3498db')
              .setFooter({ text: `Paso ${currentStep}/5` });
            
            await i.update({ embeds: [updatedEmbed], components: [row1, row2] });
            
            // Verificar si ya se seleccionaron todos los emojis
            if (currentStep === 5) {
              // Comprobar si la secuencia es correcta
              const isCorrect = gameEmojis.every((emoji, index) => emoji === userSequence[index]);
              
              if (isCorrect) {
                // Calcular recompensa basada en la dificultad
                const reward = Math.floor(Math.random() * 16) + 15; // 15-30 monedas
                
                // Actualizar perfil
                profile.character.currency += reward;
                await profile.save();
                
                const winEmbed = new EmbedBuilder()
                  .setTitle('🎉 ¡Secuencia Correcta!')
                  .setDescription(`Has recordado correctamente la secuencia:\n${gameEmojis.join(' ')}\n\nHas ganado ${reward} monedas.`)
                  .setColor('#2ecc71')
                  .setFooter({ text: `Balance actual: ${profile.character.currency} monedas` });
                
                await i.editReply({ embeds: [winEmbed], components: [] });
              } else {
                const loseEmbed = new EmbedBuilder()
                  .setTitle('❌ Secuencia Incorrecta')
                  .setDescription(`La secuencia correcta era:\n${gameEmojis.join(' ')}\n\nTu secuencia:\n${userSequence.join(' ')}`)
                  .setColor('#e74c3c')
                  .setFooter({ text: `Usa "${serverConfig.config.prefix}minigame memory" para jugar de nuevo.` });
                
                await i.editReply({ embeds: [loseEmbed], components: [] });
              }
              
              collector.stop();
            }
          });
          
          collector.on('end', (collected, reason) => {
            if (reason === 'time' && currentStep < 5) {
              const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Tiempo agotado')
                .setDescription(`Se acabó el tiempo. La secuencia correcta era:\n${gameEmojis.join(' ')}`)
                .setColor('#7f8c8d');
              
              gameMessage.edit({ embeds: [timeoutEmbed], components: [] }).catch(console.error);
            }
          });
        }, 5000); // 5 segundos para memorizar
      }, 3000); // 3 segundos de preparación
      
    } catch (error) {
      console.error('Error en el minijuego de memoria:', error);
      message.reply('Ha ocurrido un error al iniciar el minijuego.');
    }
  },
  
  // Juego de memoria (slash)
  async playMemoryGameSlash(interaction, serverConfig) {
    try {
      // Verificar si el usuario tiene un perfil
      const profile = await Profile.findOne({
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        return interaction.editReply(`No tienes un perfil en este servidor. Crea uno con \`/profile create\` para ganar monedas.`);
      }
      
      // Emojis para el juego
      const emojis = ['🍎', '🍌', '🍇', '🍊', '🍒', '🍓', '🥝', '🥥', '🍉', '🥭'];
      
      // Elegir 5 emojis aleatorios
      const gameEmojis = [];
      const usedIndexes = new Set();
      
      while (gameEmojis.length < 5) {
        const randomIndex = Math.floor(Math.random() * emojis.length);
        if (!usedIndexes.has(randomIndex)) {
          usedIndexes.add(randomIndex);
          gameEmojis.push(emojis[randomIndex]);
        }
      }
      
      // Crear el embed de inicio
      const startEmbed = new EmbedBuilder()
        .setTitle('🧠 Juego de Memoria')
        .setDescription('Memoriza la secuencia de emojis. Tendrás 5 segundos para verla, y luego deberás seleccionarlos en el orden correcto.')
        .setColor('#3498db')
        .setFooter({ text: 'El juego comenzará en unos segundos...' });
      
      await interaction.editReply({ embeds: [startEmbed] });
      
      // Mostrar los emojis a memorizar
      setTimeout(async () => {
        const sequenceEmbed = new EmbedBuilder()
          .setTitle('🧠 Memoriza esta secuencia')
          .setDescription(`${gameEmojis.join(' ')}`)
          .setColor('#3498db')
          .setFooter({ text: 'Tienes 5 segundos para memorizar' });
        
        await interaction.editReply({ embeds: [sequenceEmbed] });
        
        // Ocultar los emojis después de 5 segundos y mostrar los botones
        setTimeout(async () => {
          const playEmbed = new EmbedBuilder()
            .setTitle('🧠 Juego de Memoria')
            .setDescription('Selecciona los emojis en el orden correcto')
            .setColor('#3498db')
            .setFooter({ text: 'Haz clic en los emojis en el orden que aparecieron' });
          
          // Crear botones con todos los emojis en orden aleatorio
          const shuffledEmojis = [...emojis].sort(() => 0.5 - Math.random()).slice(0, 10);
          
          const row1 = new ActionRowBuilder()
            .addComponents(
              shuffledEmojis.slice(0, 5).map(emoji =>
                new ButtonBuilder()
                  .setCustomId(`memory:${interaction.user.id}:${emoji}:0`)
                  .setLabel(emoji)
                  .setStyle(ButtonStyle.Secondary)
              )
            );
          
          const row2 = new ActionRowBuilder()
            .addComponents(
              shuffledEmojis.slice(5, 10).map(emoji =>
                new ButtonBuilder()
                  .setCustomId(`memory:${interaction.user.id}:${emoji}:0`)
                  .setLabel(emoji)
                  .setStyle(ButtonStyle.Secondary)
              )
            );
          
          const gameMessage = await interaction.editReply({ embeds: [playEmbed], components: [row1, row2] });
          
          // Variables para el seguimiento del juego
          let userSequence = [];
          let currentStep = 0;
          
          // Crear collector para los botones
          const collector = gameMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000, // 30 segundos
            filter: i => i.customId.startsWith(`memory:${interaction.user.id}`)
          });
          
          collector.on('collect', async i => {
            // Verificar que sea el usuario que inició el juego
            if (i.user.id !== interaction.user.id) {
              return i.reply({
                content: '¡Este juego no es tuyo! Inicia tu propio juego con el comando minigame.',
                ephemeral: true
              });
            }
            
            const [_, userId, selectedEmoji] = i.customId.split(':');
            userSequence.push(selectedEmoji);
            currentStep++;
            
            // Actualizar el embed con la selección actual
            const updatedEmbed = new EmbedBuilder()
              .setTitle('🧠 Juego de Memoria')
              .setDescription(`Selección actual: ${userSequence.join(' ')}`)
              .setColor('#3498db')
              .setFooter({ text: `Paso ${currentStep}/5` });
            
            await i.update({ embeds: [updatedEmbed], components: [row1, row2] });
            
            // Verificar si ya se seleccionaron todos los emojis
            if (currentStep === 5) {
              // Comprobar si la secuencia es correcta
              const isCorrect = gameEmojis.every((emoji, index) => emoji === userSequence[index]);
              
              if (isCorrect) {
                // Calcular recompensa basada en la dificultad
                const reward = Math.floor(Math.random() * 16) + 15; // 15-30 monedas
                
                // Actualizar perfil
                profile.character.currency += reward;
                await profile.save();
                
                const winEmbed = new EmbedBuilder()
                  .setTitle('🎉 ¡Secuencia Correcta!')
                  .setDescription(`Has recordado correctamente la secuencia:\n${gameEmojis.join(' ')}\n\nHas ganado ${reward} monedas.`)
                  .setColor('#2ecc71')
                  .setFooter({ text: `Balance actual: ${profile.character.currency} monedas` });
                
                await i.editReply({ embeds: [winEmbed], components: [] });
              } else {
                const loseEmbed = new EmbedBuilder()
                  .setTitle('❌ Secuencia Incorrecta')
                  .setDescription(`La secuencia correcta era:\n${gameEmojis.join(' ')}\n\nTu secuencia:\n${userSequence.join(' ')}`)
                  .setColor('#e74c3c')
                  .setFooter({ text: 'Usa "/minigame memory" para jugar de nuevo.' });
                
                await i.editReply({ embeds: [loseEmbed], components: [] });
              }
              
              collector.stop();
            }
          });
          
          collector.on('end', (collected, reason) => {
            if (reason === 'time' && currentStep < 5) {
              const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Tiempo agotado')
                .setDescription(`Se acabó el tiempo. La secuencia correcta era:\n${gameEmojis.join(' ')}`)
                .setColor('#7f8c8d');
              
              interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(console.error);
            }
          });
        }, 5000); // 5 segundos para memorizar
      }, 3000); // 3 segundos de preparación
      
    } catch (error) {
      console.error('Error en el minijuego de memoria:', error);
      interaction.editReply('Ha ocurrido un error al iniciar el minijuego.');
    }
  }
};