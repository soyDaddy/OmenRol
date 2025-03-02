const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Profile = require('../../../../models/Profile');

module.exports = {
  // Juego de adivinar el número (con prefijo)
  async playGuessGame(message, serverConfig) {
    try {
      // Verificar si el usuario tiene un perfil
      const profile = await Profile.findOne({
        userId: message.author.id,
        serverId: message.guild.id
      });
      
      if (!profile) {
        return message.reply(`No tienes un perfil en este servidor. Crea uno con \`${serverConfig.config.prefix}profile create\` para ganar monedas.`);
      }
      
      // Generar número aleatorio entre 1 y 10
      const secretNumber = Math.floor(Math.random() * 10) + 1;
      
      const embed = new EmbedBuilder()
        .setTitle('🔢 Adivina el número')
        .setDescription('He pensado en un número entre 1 y 10. ¡Intenta adivinarlo!')
        .setColor('#e74c3c')
        .setFooter({ text: 'Tienes 3 intentos. Haz clic en un botón para adivinar.' });
      
      // Crear botones para los números
      const row1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:1:${secretNumber}:3`)
            .setLabel('1')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:2:${secretNumber}:3`)
            .setLabel('2')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:3:${secretNumber}:3`)
            .setLabel('3')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:4:${secretNumber}:3`)
            .setLabel('4')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:5:${secretNumber}:3`)
            .setLabel('5')
            .setStyle(ButtonStyle.Primary),
        );
      
      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:6:${secretNumber}:3`)
            .setLabel('6')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:7:${secretNumber}:3`)
            .setLabel('7')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:8:${secretNumber}:3`)
            .setLabel('8')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:9:${secretNumber}:3`)
            .setLabel('9')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${message.author.id}:10:${secretNumber}:3`)
            .setLabel('10')
            .setStyle(ButtonStyle.Primary),
        );
      
      const response = await message.reply({ embeds: [embed], components: [row1, row2] });
      
      // Crear collector para los botones
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000, // 30 segundos
        filter: i => i.customId.startsWith(`guess:${message.author.id}`)
      });
      
      let attempts = 3;
      
      collector.on('collect', async interaction => {
        // Verificar que sea el usuario que inició el juego
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({
            content: '¡Este juego no es tuyo! Inicia tu propio juego con el comando minigame.',
            ephemeral: true
          });
        }
        
        const [_, userId, chosenNumber, correctNumber, attemptsLeft] = interaction.customId.split(':');
        const guess = parseInt(chosenNumber);
        const secret = parseInt(correctNumber);
        attempts = parseInt(attemptsLeft) - 1;
        
        // Procesar la respuesta
        if (guess === secret) {
          // Premio entre 10-20 monedas
          const reward = Math.floor(Math.random() * 11) + 10;
          
          // Actualizar perfil
          profile.character.currency += reward;
          await profile.save();
          
          const winEmbed = new EmbedBuilder()
            .setTitle('🎉 ¡Correcto!')
            .setDescription(`¡Has adivinado el número ${secret}!\nHas ganado ${reward} monedas.`)
            .setColor('#2ecc71')
            .setFooter({ text: `Balance actual: ${profile.character.currency} monedas` });
          
          await interaction.update({ embeds: [winEmbed], components: [] });
          collector.stop('win');
        } else {
          // Respuesta incorrecta
          if (attempts > 0) {
            const hint = guess < secret ? 'mayor' : 'menor';
            
            const row1Updated = new ActionRowBuilder()
              .addComponents(
                ...row1.components.map(button => {
                  const btn = ButtonBuilder.from(button);
                  const btnNumber = parseInt(btn.data.custom_id.split(':')[2]);
                  btn.setCustomId(`guess:${message.author.id}:${btnNumber}:${secretNumber}:${attempts}`);
                  return btn;
                })
              );
            
            const row2Updated = new ActionRowBuilder()
              .addComponents(
                ...row2.components.map(button => {
                  const btn = ButtonBuilder.from(button);
                  const btnNumber = parseInt(btn.data.custom_id.split(':')[2]);
                  btn.setCustomId(`guess:${message.author.id}:${btnNumber}:${secretNumber}:${attempts}`);
                  return btn;
                })
              );
            
            const incorrectEmbed = new EmbedBuilder()
              .setTitle('❌ Incorrecto')
              .setDescription(`${guess} no es el número correcto.\nPista: El número es ${hint} que ${guess}.\nTe quedan ${attempts} intentos.`)
              .setColor('#e74c3c');
            
            await interaction.update({ embeds: [incorrectEmbed], components: [row1Updated, row2Updated] });
          } else {
            // Sin más intentos
            const loseEmbed = new EmbedBuilder()
              .setTitle('🔢 Juego terminado')
              .setDescription(`¡Te has quedado sin intentos!\nEl número correcto era ${secret}.`)
              .setColor('#7f8c8d')
              .setFooter({ text: `Usa "${serverConfig.config.prefix}minigame guess" para jugar de nuevo.` });
            
            await interaction.update({ embeds: [loseEmbed], components: [] });
            collector.stop('lose');
          }
        }
      });
      
      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ Tiempo agotado')
            .setDescription(`Se acabó el tiempo. El número era ${secretNumber}.`)
            .setColor('#7f8c8d');
          
          response.edit({ embeds: [timeoutEmbed], components: [] }).catch(console.error);
        }
      });
    } catch (error) {
      console.error('Error en el minijuego de adivinar:', error);
      message.reply('Ha ocurrido un error al iniciar el minijuego.');
    }
  },
  
  // Juego de adivinar el número (slash)
  async playGuessGameSlash(interaction, serverConfig) {
    try {
      // Verificar si el usuario tiene un perfil
      const profile = await Profile.findOne({
        userId: interaction.user.id,
        serverId: interaction.guild.id
      });
      
      if (!profile) {
        return interaction.editReply(`No tienes un perfil en este servidor. Crea uno con \`/profile create\` para ganar monedas.`);
      }
      
      // Generar número aleatorio entre 1 y 10
      const secretNumber = Math.floor(Math.random() * 10) + 1;
      
      const embed = new EmbedBuilder()
        .setTitle('🔢 Adivina el número')
        .setDescription('He pensado en un número entre 1 y 10. ¡Intenta adivinarlo!')
        .setColor('#e74c3c')
        .setFooter({ text: 'Tienes 3 intentos. Haz clic en un botón para adivinar.' });
      
      // Crear botones para los números
      const row1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:1:${secretNumber}:3`)
            .setLabel('1')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:2:${secretNumber}:3`)
            .setLabel('2')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:3:${secretNumber}:3`)
            .setLabel('3')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:4:${secretNumber}:3`)
            .setLabel('4')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:5:${secretNumber}:3`)
            .setLabel('5')
            .setStyle(ButtonStyle.Primary),
        );
      
      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:6:${secretNumber}:3`)
            .setLabel('6')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:7:${secretNumber}:3`)
            .setLabel('7')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:8:${secretNumber}:3`)
            .setLabel('8')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:9:${secretNumber}:3`)
            .setLabel('9')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`guess:${interaction.user.id}:10:${secretNumber}:3`)
            .setLabel('10')
            .setStyle(ButtonStyle.Primary),
        );
      
      const response = await interaction.editReply({ embeds: [embed], components: [row1, row2] });
      
      // Crear collector para los botones
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000, // 30 segundos
        filter: i => i.customId.startsWith(`guess:${interaction.user.id}`)
      });
      
      let attempts = 3;
      
      collector.on('collect', async i => {
        // Verificar que sea el usuario que inició el juego
        if (i.user.id !== interaction.user.id) {
          return i.reply({
            content: '¡Este juego no es tuyo! Inicia tu propio juego con el comando minigame.',
            ephemeral: true
          });
        }
        
        const [_, userId, chosenNumber, correctNumber, attemptsLeft] = i.customId.split(':');
        const guess = parseInt(chosenNumber);
        const secret = parseInt(correctNumber);
        attempts = parseInt(attemptsLeft) - 1;
        
        // Procesar la respuesta
        if (guess === secret) {
          // Premio entre 10-20 monedas
          const reward = Math.floor(Math.random() * 11) + 10;
          
          // Actualizar perfil
          profile.character.currency += reward;
          await profile.save();
          
          const winEmbed = new EmbedBuilder()
            .setTitle('🎉 ¡Correcto!')
            .setDescription(`¡Has adivinado el número ${secret}!\nHas ganado ${reward} monedas.`)
            .setColor('#2ecc71')
            .setFooter({ text: `Balance actual: ${profile.character.currency} monedas` });
          
          await i.update({ embeds: [winEmbed], components: [] });
          collector.stop('win');
        } else {
          // Respuesta incorrecta
          if (attempts > 0) {
            const hint = guess < secret ? 'mayor' : 'menor';
            
            const row1Updated = new ActionRowBuilder()
              .addComponents(
                ...row1.components.map(button => {
                  const btn = ButtonBuilder.from(button);
                  const btnNumber = parseInt(btn.data.custom_id.split(':')[2]);
                  btn.setCustomId(`guess:${interaction.user.id}:${btnNumber}:${secretNumber}:${attempts}`);
                  return btn;
                })
              );
            
            const row2Updated = new ActionRowBuilder()
              .addComponents(
                ...row2.components.map(button => {
                  const btn = ButtonBuilder.from(button);
                  const btnNumber = parseInt(btn.data.custom_id.split(':')[2]);
                  btn.setCustomId(`guess:${interaction.user.id}:${btnNumber}:${secretNumber}:${attempts}`);
                  return btn;
                })
              );
            
            const incorrectEmbed = new EmbedBuilder()
              .setTitle('❌ Incorrecto')
              .setDescription(`${guess} no es el número correcto.\nPista: El número es ${hint} que ${guess}.\nTe quedan ${attempts} intentos.`)
              .setColor('#e74c3c');
            
            await i.update({ embeds: [incorrectEmbed], components: [row1Updated, row2Updated] });
          } else {
            // Sin más intentos
            const loseEmbed = new EmbedBuilder()
              .setTitle('🔢 Juego terminado')
              .setDescription(`¡Te has quedado sin intentos!\nEl número correcto era ${secret}.`)
              .setColor('#7f8c8d')
              .setFooter({ text: 'Usa "/minigame guess" para jugar de nuevo.' });
            
            await i.update({ embeds: [loseEmbed], components: [] });
            collector.stop('lose');
          }
        }
      });
      
      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('⏰ Tiempo agotado')
            .setDescription(`Se acabó el tiempo. El número era ${secretNumber}.`)
            .setColor('#7f8c8d');
          
          interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(console.error);
        }
      });
    } catch (error) {
      console.error('Error en el minijuego de adivinar:', error);
      interaction.editReply('Ha ocurrido un error al iniciar el minijuego.');
    }
  }
};