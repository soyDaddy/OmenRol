const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'coinflip',
  aliases: ['cf', 'moneda'],
  description: 'Lanza una moneda y apuesta contra la CPU o contra otro jugador',
  category: 'casino',
  cooldown: 3,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Lanza una moneda y apuesta contra la CPU o contra otro jugador')
    .addIntegerOption(option => 
      option.setName('apuesta')
        .setDescription('Cantidad de monedas para apostar')
        .setRequired(true)
        .setMinValue(5))
    .addStringOption(option =>
      option.setName('modo')
        .setDescription('Modo de juego')
        .setRequired(true)
        .addChoices(
          { name: '🤖 VS CPU', value: 'cpu' },
          { name: '👥 VS Jugador', value: 'jugador' }
        ))
    .addStringOption(option =>
      option.setName('lado')
        .setDescription('Elige cara o cruz')
        .setRequired(false)
        .addChoices(
          { name: '🪙 Cara', value: 'cara' },
          { name: '❌ Cruz', value: 'cruz' }
        )),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    if (!args[0]) {
      return message.reply('❌ Debes especificar una cantidad de monedas para apostar.');
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 5) {
      return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 5 monedas.');
    }
    
    // Determinar modo
    const mode = args[1]?.toLowerCase() || 'cpu';
    if (!['cpu', 'jugador'].includes(mode)) {
      return message.reply('❌ El modo debe ser "cpu" o "jugador".');
    }
    
    // Determinar lado elegido (cara o cruz) si es contra CPU
    let choice = args[2]?.toLowerCase() || null;
    if (mode === 'cpu' && choice && !['cara', 'cruz'].includes(choice)) {
      return message.reply('❌ El lado debe ser "cara" o "cruz".');
    }
    
    // Verificar si el usuario tiene perfil
    const profile = await Profile.findOne({
      userId: message.author.id,
      serverId: message.guild.id
    });
    
    if (!profile) {
      return message.reply(`❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`);
    }
    
    // Verificar si tiene suficientes monedas
    if (profile.character.currency < amount) {
      return message.reply(`❌ No tienes suficientes monedas. Tienes ${profile.character.currency} monedas.`);
    }
    
    if (mode === 'cpu') {
      // Si no eligió cara o cruz, mostrar botones para elegir
      if (!choice) {
        const choiceButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`coinflip:cara:${message.author.id}:${amount}:cpu`)
              .setLabel('CARA')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🪙'),
            new ButtonBuilder()
              .setCustomId(`coinflip:cruz:${message.author.id}:${amount}:cpu`)
              .setLabel('CRUZ')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❌')
          );
        
        const choiceEmbed = new EmbedBuilder()
          .setTitle('🪙 LANZAMIENTO DE MONEDA VS CPU 🪙')
          .setDescription(`
**Apuesta:** ${amount} monedas

Elige cara o cruz para comenzar.
          `)
          .setColor('#ffaa00')
          .setFooter({ text: 'Gana el doble si eliges correctamente' });
        
        return message.reply({ embeds: [choiceEmbed], components: [choiceButtons] });
      }
      
      // Restar las monedas de la apuesta
      profile.character.currency -= amount;
      await profile.save();
      
      // Iniciar el juego contra la CPU
      this.startCpuGame(message, amount, choice, profile);
    } else {
      // Modo contra jugador: mostrar menú para seleccionar oponente
      const selectUserMenu = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`coinflip:select:${message.author.id}:${amount}`)
            .setPlaceholder('Selecciona a tu oponente')
            .setMaxValues(1)
        );
      
      const selectEmbed = new EmbedBuilder()
        .setTitle('🪙 LANZAMIENTO DE MONEDA - SELECCIÓN DE OPONENTE')
        .setDescription(`
${message.author} quiere desafiar a alguien a una partida de Lanzamiento de Moneda.

**Apuesta:** ${amount} monedas
        `)
        .setColor('#ffaa00')
        .setFooter({ text: 'El oponente debe aceptar el desafío y tener suficientes monedas' });
      
      const selectMsg = await message.reply({ embeds: [selectEmbed], components: [selectUserMenu] });
      
      // Crear collector para la selección de usuario
      const filter = i => {
        const [command, action, userId] = i.customId.split(':');
        return command === 'coinflip' && action === 'select' && i.user.id === message.author.id;
      };
      
      const collector = selectMsg.createMessageComponentCollector({ 
        filter,
        time: 60000
      });
      
      collector.on('collect', async i => {
        const targetUserId = i.values[0];
        const targetUser = await client.users.fetch(targetUserId);
        
        // Verificar que no está desafiando a sí mismo o a un bot
        if (targetUserId === message.author.id) {
          await i.reply({ 
            content: '❌ No puedes desafiarte a ti mismo.',
            ephemeral: true
          });
          return;
        }
        
        if (targetUser.bot) {
          await i.reply({ 
            content: '❌ No puedes desafiar a un bot. Usa el modo CPU para eso.',
            ephemeral: true
          });
          return;
        }
        
        // Verificar que el oponente tiene perfil
        const targetProfile = await Profile.findOne({
          userId: targetUserId,
          serverId: message.guild.id
        });
        
        if (!targetProfile) {
          await i.reply({ 
            content: `❌ ${targetUser.tag} no tiene un perfil en este servidor.`,
            ephemeral: true
          });
          return;
        }
        
        // Verificar que el oponente tiene suficientes monedas
        if (targetProfile.character.currency < amount) {
          await i.reply({ 
            content: `❌ ${targetUser.tag} no tiene suficientes monedas para la apuesta. Tiene ${targetProfile.character.currency} monedas.`,
            ephemeral: true
          });
          return;
        }
        
        // Enviar solicitud de desafío
        const challengeButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`coinflip:accept:${message.author.id}:${targetUserId}:${amount}`)
              .setLabel('ACEPTAR DESAFÍO')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`coinflip:decline:${message.author.id}:${targetUserId}:${amount}`)
              .setLabel('RECHAZAR')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
        
        const challengeEmbed = new EmbedBuilder()
          .setTitle('🪙 DESAFÍO DE LANZAMIENTO DE MONEDA')
          .setDescription(`
${message.author} te desafía a una partida de Lanzamiento de Moneda, ${targetUser}!

**Apuesta:** ${amount} monedas

¿Aceptas el desafío?
          `)
          .setColor('#ffaa00')
          .setFooter({ text: 'El desafío expira en 60 segundos' });
        
        await i.update({ embeds: [challengeEmbed], components: [challengeButtons] });
        
        // Crear collector para la respuesta al desafío
        const challengeFilter = j => {
          const [command, action, challengerId, targetId] = j.customId.split(':');
          return command === 'coinflip' && ['accept', 'decline'].includes(action) && 
                targetId === targetUserId && j.user.id === targetUserId;
        };
        
        const challengeCollector = selectMsg.createMessageComponentCollector({ 
          filter: challengeFilter, 
          time: 60000
        });
        
        challengeCollector.on('collect', async j => {
          const [, action] = j.customId.split(':');
          
          if (action === 'decline') {
            // Desafío rechazado
            const declineEmbed = new EmbedBuilder()
              .setTitle('❌ DESAFÍO RECHAZADO')
              .setDescription(`
${targetUser} ha rechazado el desafío de ${message.author}.

No se ha realizado ninguna apuesta.
              `)
              .setColor('#ff0000');
            
            await j.update({ embeds: [declineEmbed], components: [] });
            return;
          }
          
          if (action === 'accept') {
            // Verificar de nuevo si ambos tienen suficientes monedas
            const updatedProfile = await Profile.findOne({
              userId: message.author.id,
              serverId: message.guild.id
            });
            
            const updatedTargetProfile = await Profile.findOne({
              userId: targetUserId,
              serverId: message.guild.id
            });
            
            if (updatedProfile.character.currency < amount) {
              await j.reply({ 
                content: `❌ ${message.author.tag} ya no tiene suficientes monedas para la apuesta.`,
                ephemeral: true
              });
              return;
            }
            
            if (updatedTargetProfile.character.currency < amount) {
              await j.reply({ 
                content: `❌ Ya no tienes suficientes monedas para la apuesta.`,
                ephemeral: true
              });
              return;
            }
            
            // Restar las monedas de la apuesta a ambos jugadores
            updatedProfile.character.currency -= amount;
            updatedTargetProfile.character.currency -= amount;
            
            await updatedProfile.save();
            await updatedTargetProfile.save();
            
            // Enviar mensaje para elegir cara o cruz
            const sideButtons = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`coinflip:side:cara:${message.author.id}:${targetUserId}:${amount}`)
                  .setLabel('CARA')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('🪙'),
                new ButtonBuilder()
                  .setCustomId(`coinflip:side:cruz:${message.author.id}:${targetUserId}:${amount}`)
                  .setLabel('CRUZ')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('❌')
              );
            
            const sideEmbed = new EmbedBuilder()
              .setTitle('🪙 LANZAMIENTO DE MONEDA - ELIGE UN LADO')
              .setDescription(`
${message.author}, eres el desafiante. Elige cara o cruz.

${targetUser} tendrá automáticamente el lado contrario.

**Apuesta:** ${amount} monedas de cada jugador (Total: ${amount * 2} monedas)
              `)
              .setColor('#ffaa00')
              .setFooter({ text: 'El ganador se lleva todo' });
            
            await j.update({ 
              content: '🪙 ¡El desafío ha sido aceptado!',
              embeds: [sideEmbed], 
              components: [sideButtons] 
            });
            
            // Crear collector para la elección de lado
            const sideFilter = k => {
              const [command, action, , challengerId] = k.customId.split(':');
              return command === 'coinflip' && action === 'side' && 
                    challengerId === message.author.id && k.user.id === message.author.id;
            };
            
            const sideCollector = selectMsg.createMessageComponentCollector({ 
              filter: sideFilter, 
              time: 60000
            });
            
            sideCollector.on('collect', async k => {
              const [, , side] = k.customId.split(':');
              
              // Iniciar el juego entre jugadores
              await k.update({ 
                content: `🪙 **LANZAMIENTO DE MONEDA** - ${message.author} eligió ${side.toUpperCase()}`,
                embeds: [], 
                components: [] 
              });
              
              this.startPlayerVsPlayerGame(message, targetUser, amount, side, updatedProfile, updatedTargetProfile);
            });
            
            sideCollector.on('end', async (collected, reason) => {
              if (reason === 'time' && collected.size === 0) {
                // Tiempo expirado sin elección de lado
                const expiredEmbed = new EmbedBuilder()
                  .setTitle('⏰ TIEMPO AGOTADO')
                  .setDescription(`
${message.author} no eligió un lado a tiempo.
Por seguridad, la partida ha sido cancelada y se devuelven las apuestas.
                  `)
                  .setColor('#999999');
                
                // Devolver las monedas apostadas
                updatedProfile.character.currency += amount;
                updatedTargetProfile.character.currency += amount;
                
                await updatedProfile.save();
                await updatedTargetProfile.save();
                
                await selectMsg.edit({ embeds: [expiredEmbed], components: [] });
              }
            });
          }
        });
        
        challengeCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            // Tiempo expirado sin respuesta
            const expiredEmbed = new EmbedBuilder()
              .setTitle('⏰ DESAFÍO EXPIRADO')
              .setDescription(`
${targetUser} no respondió al desafío de ${message.author} a tiempo.

No se ha realizado ninguna apuesta.
              `)
              .setColor('#999999');
            
            await selectMsg.edit({ embeds: [expiredEmbed], components: [] });
          }
        });
      });
      
      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          // Tiempo expirado sin selección
          const expiredEmbed = new EmbedBuilder()
            .setTitle('⏰ SELECCIÓN EXPIRADA')
            .setDescription('No se seleccionó ningún oponente a tiempo.')
            .setColor('#999999');
          
          await selectMsg.edit({ embeds: [expiredEmbed], components: [] });
        }
      });
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const amount = interaction.options.getInteger('apuesta');
    const mode = interaction.options.getString('modo');
    const choice = interaction.options.getString('lado');
    
    // Verificar si el usuario tiene perfil
    const profile = await Profile.findOne({
      userId: interaction.user.id,
      serverId: interaction.guild.id
    });
    
    if (!profile) {
      return interaction.reply({ content: `❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`, ephemeral: true });
    }
    
    // Verificar si tiene suficientes monedas
    if (profile.character.currency < amount) {
      return interaction.reply({ content: `❌ No tienes suficientes monedas. Tienes ${profile.character.currency} monedas.`, ephemeral: true });
    }
    
    if (mode === 'cpu') {
      // Si no eligió cara o cruz, mostrar botones para elegir
      if (!choice) {
        const choiceButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`coinflip:cara:${interaction.user.id}:${amount}:cpu`)
              .setLabel('CARA')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🪙'),
            new ButtonBuilder()
              .setCustomId(`coinflip:cruz:${interaction.user.id}:${amount}:cpu`)
              .setLabel('CRUZ')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❌')
          );
        
        const choiceEmbed = new EmbedBuilder()
          .setTitle('🪙 LANZAMIENTO DE MONEDA VS CPU 🪙')
          .setDescription(`
**Apuesta:** ${amount} monedas

Elige cara o cruz para comenzar.
          `)
          .setColor('#ffaa00')
          .setFooter({ text: 'Gana el doble si eliges correctamente' });
        
        return interaction.reply({ embeds: [choiceEmbed], components: [choiceButtons] });
      }
      
      // Restar las monedas de la apuesta
      profile.character.currency -= amount;
      await profile.save();
      
      // Iniciar el juego contra la CPU
      await interaction.reply(`🪙 **LANZAMIENTO DE MONEDA VS CPU** - Apostando ${amount} monedas a ${choice.toUpperCase()}`);
      this.startCpuGame(interaction, amount, choice, profile);
    } else {
      // Modo contra jugador: mostrar menú para seleccionar oponente
      const selectUserMenu = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`coinflip:select:${interaction.user.id}:${amount}`)
            .setPlaceholder('Selecciona a tu oponente')
            .setMaxValues(1)
        );
      
      const selectEmbed = new EmbedBuilder()
        .setTitle('🪙 LANZAMIENTO DE MONEDA - SELECCIÓN DE OPONENTE')
        .setDescription(`
${interaction.user} quiere desafiar a alguien a una partida de Lanzamiento de Moneda.

**Apuesta:** ${amount} monedas
        `)
        .setColor('#ffaa00')
        .setFooter({ text: 'El oponente debe aceptar el desafío y tener suficientes monedas' });
      
      await interaction.reply({ embeds: [selectEmbed], components: [selectUserMenu] });
      
      // Crear collector para la selección de usuario
      const filter = i => {
        const [command, action, userId] = i.customId.split(':');
        return command === 'coinflip' && action === 'select' && i.user.id === interaction.user.id;
      };
      
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });
      
      collector.on('collect', async i => {
        const targetUserId = i.values[0];
        const targetUser = await client.users.fetch(targetUserId);
        
        // Verificar que no está desafiando a sí mismo o a un bot
        if (targetUserId === interaction.user.id) {
          await i.reply({ 
            content: '❌ No puedes desafiarte a ti mismo.',
            ephemeral: true
          });
          return;
        }
        
        if (targetUser.bot) {
          await i.reply({ 
            content: '❌ No puedes desafiar a un bot. Usa el modo CPU para eso.',
            ephemeral: true
          });
          return;
        }
        
        // Verificar que el oponente tiene perfil
        const targetProfile = await Profile.findOne({
          userId: targetUserId,
          serverId: interaction.guild.id
        });
        
        if (!targetProfile) {
          await i.reply({ 
            content: `❌ ${targetUser.tag} no tiene un perfil en este servidor.`,
            ephemeral: true
          });
          return;
        }
        
        // Verificar que el oponente tiene suficientes monedas
        if (targetProfile.character.currency < amount) {
          await i.reply({ 
            content: `❌ ${targetUser.tag} no tiene suficientes monedas para la apuesta. Tiene ${targetProfile.character.currency} monedas.`,
            ephemeral: true
          });
          return;
        }
        
        // Enviar solicitud de desafío
        const challengeButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`coinflip:accept:${interaction.user.id}:${targetUserId}:${amount}`)
              .setLabel('ACEPTAR DESAFÍO')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`coinflip:decline:${interaction.user.id}:${targetUserId}:${amount}`)
              .setLabel('RECHAZAR')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
        
        const challengeEmbed = new EmbedBuilder()
          .setTitle('🪙 DESAFÍO DE LANZAMIENTO DE MONEDA')
          .setDescription(`
${interaction.user} te desafía a una partida de Lanzamiento de Moneda, ${targetUser}!

**Apuesta:** ${amount} monedas

¿Aceptas el desafío?
          `)
          .setColor('#ffaa00')
          .setFooter({ text: 'El desafío expira en 60 segundos' });
        
        await i.update({ embeds: [challengeEmbed], components: [challengeButtons] });
        
        // Crear collector para la respuesta al desafío
        const challengeFilter = j => {
          const [command, action, challengerId, targetId] = j.customId.split(':');
          return command === 'coinflip' && ['accept', 'decline'].includes(action) && 
                targetId === targetUserId && j.user.id === targetUserId;
        };
        
        const challengeCollector = interaction.channel.createMessageComponentCollector({ 
          filter: challengeFilter, 
          time: 60000
        });
        
        challengeCollector.on('collect', async j => {
          const [, action] = j.customId.split(':');
          
          if (action === 'decline') {
            // Desafío rechazado
            const declineEmbed = new EmbedBuilder()
              .setTitle('❌ DESAFÍO RECHAZADO')
              .setDescription(`
${targetUser} ha rechazado el desafío de ${interaction.user}.

No se ha realizado ninguna apuesta.
              `)
              .setColor('#ff0000');
            
            await j.update({ embeds: [declineEmbed], components: [] });
            return;
          }
          
          if (action === 'accept') {
            // Verificar de nuevo si ambos tienen suficientes monedas
            const updatedProfile = await Profile.findOne({
              userId: interaction.user.id,
              serverId: interaction.guild.id
            });
            
            const updatedTargetProfile = await Profile.findOne({
              userId: targetUserId,
              serverId: interaction.guild.id
            });
            
            if (updatedProfile.character.currency < amount) {
              await j.reply({ 
                content: `❌ ${interaction.user.tag} ya no tiene suficientes monedas para la apuesta.`,
                ephemeral: true
              });
              return;
            }
            
            if (updatedTargetProfile.character.currency < amount) {
              await j.reply({ 
                content: `❌ Ya no tienes suficientes monedas para la apuesta.`,
                ephemeral: true
              });
              return;
            }
            
            // Restar las monedas de la apuesta a ambos jugadores
            updatedProfile.character.currency -= amount;
            updatedTargetProfile.character.currency -= amount;
            
            await updatedProfile.save();
            await updatedTargetProfile.save();
            
            // Enviar mensaje para elegir cara o cruz
            const sideButtons = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`coinflip:side:cara:${interaction.user.id}:${targetUserId}:${amount}`)
                  .setLabel('CARA')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('🪙'),
                new ButtonBuilder()
                  .setCustomId(`coinflip:side:cruz:${interaction.user.id}:${targetUserId}:${amount}`)
                  .setLabel('CRUZ')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('❌')
              );
            
            const sideEmbed = new EmbedBuilder()
              .setTitle('🪙 LANZAMIENTO DE MONEDA - ELIGE UN LADO')
              .setDescription(`
${interaction.user}, eres el desafiante. Elige cara o cruz.

${targetUser} tendrá automáticamente el lado contrario.

**Apuesta:** ${amount} monedas de cada jugador (Total: ${amount * 2} monedas)
              `)
              .setColor('#ffaa00')
              .setFooter({ text: 'El ganador se lleva todo' });
            
            await j.update({ 
              content: '🪙 ¡El desafío ha sido aceptado!',
              embeds: [sideEmbed], 
              components: [sideButtons] 
            });
            
            // Crear collector para la elección de lado
            const sideFilter = k => {
              const [command, action, , challengerId] = k.customId.split(':');
              return command === 'coinflip' && action === 'side' && 
                    challengerId === interaction.user.id && k.user.id === interaction.user.id;
            };
            
            const sideCollector = interaction.channel.createMessageComponentCollector({ 
              filter: sideFilter, 
              time: 60000
            });
            
            sideCollector.on('collect', async k => {
              const [, , side] = k.customId.split(':');
              
              // Iniciar el juego entre jugadores
              await k.update({ 
                content: `🪙 **LANZAMIENTO DE MONEDA** - ${interaction.user} eligió ${side.toUpperCase()}`,
                embeds: [], 
                components: [] 
              });
              
              this.startPlayerVsPlayerGame(interaction, targetUser, amount, side, updatedProfile, updatedTargetProfile);
            });
            
            sideCollector.on('end', async (collected, reason) => {
              if (reason === 'time' && collected.size === 0) {
                // Tiempo expirado sin elección de lado
                const expiredEmbed = new EmbedBuilder()
                  .setTitle('⏰ TIEMPO AGOTADO')
                  .setDescription(`
${interaction.user} no eligió un lado a tiempo.
Por seguridad, la partida ha sido cancelada y se devuelven las apuestas.
                  `)
                  .setColor('#999999');
                
                // Devolver las monedas apostadas
                updatedProfile.character.currency += amount;
                updatedTargetProfile.character.currency += amount;
                
                await updatedProfile.save();
                await updatedTargetProfile.save();
                
                await interaction.editReply({ embeds: [expiredEmbed], components: [] });
              }
            });
          }
        });
        
        challengeCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            // Tiempo expirado sin respuesta
            const expiredEmbed = new EmbedBuilder()
              .setTitle('⏰ DESAFÍO EXPIRADO')
              .setDescription(`
${targetUser} no respondió al desafío de ${interaction.user} a tiempo.

No se ha realizado ninguna apuesta.
              `)
              .setColor('#999999');
            
            await interaction.editReply({ embeds: [expiredEmbed], components: [] });
          }
        });
      });
      
      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          // Tiempo expirado sin selección
          const expiredEmbed = new EmbedBuilder()
            .setTitle('⏰ SELECCIÓN EXPIRADA')
            .setDescription('No se seleccionó ningún oponente a tiempo.')
            .setColor('#999999');
          
          await interaction.editReply({ embeds: [expiredEmbed], components: [] });
        }
      });
    }
  },
  
  // Método para jugar contra la CPU
  async startCpuGame(context, amount, choice, profile) {
    // Posibles resultados
    const results = ['cara', 'cruz'];
    const resultEmojis = {
      'cara': '🪙',
      'cruz': '❌'
    };
    
    // Función para simular un lanzamiento de moneda
    function flipCoin() {
      return results[Math.floor(Math.random() * results.length)];
    }
    
    // Establecer una small ventaja para el casino (48% de ganar vs 52% de perder)
    function rigedFlipCoin(playerChoice) {
      // Probabilidad de victoria del jugador (48%)
      const winChance = 0.48;
      
      if (Math.random() < winChance) {
        return playerChoice; // El jugador gana
      } else {
        return playerChoice === 'cara' ? 'cruz' : 'cara'; // El jugador pierde
      }
    }
    
    // Crear embed inicial (animación de lanzamiento)
    const initialEmbed = new EmbedBuilder()
      .setTitle('🪙 LANZANDO MONEDA VS CPU 🪙')
      .setDescription(`
**Apuesta:** ${amount} monedas
**Tu elección:** ${resultEmojis[choice]} ${choice.toUpperCase()}

Lanzando...
      `)
      .setColor('#ffaa00');
    
    // Enviar mensaje inicial
    const gameMessage = context.replied 
      ? await context.followUp({ embeds: [initialEmbed] }) 
      : await context.reply({ embeds: [initialEmbed] });
    
    // Esperar un momento para crear suspense
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Lanzar la moneda
    const result = rigedFlipCoin(choice);
    const isWin = result === choice;
    
    // Calcular ganancias
    let winnings = 0;
    if (isWin) {
      winnings = amount * 2;
      
      // Actualizar monedas del usuario
      profile.character.currency += winnings;
      profile.stats.wins += 1;
      
      // Actualizar estadísticas si existe en inventario
      if (profile.character.inventory) {
        let cfStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Lanzamiento de Moneda");
        if (!cfStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Lanzamiento de Moneda",
            quantity: 1,
            description: "Registro de tus lanzamientos de moneda"
          });
          cfStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!cfStatsItem.metadata) {
          cfStatsItem.metadata = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            caraWins: 0,
            cruzWins: 0,
            biggestWin: 0,
            bestStreak: 0,
            currentStreak: 0,
            cpuGames: 0,
            pvpGames: 0
          };
        }
        
        // Actualizar estadísticas
        cfStatsItem.metadata.gamesPlayed = (cfStatsItem.metadata.gamesPlayed || 0) + 1;
        cfStatsItem.metadata.wins = (cfStatsItem.metadata.wins || 0) + 1;
        cfStatsItem.metadata.cpuGames = (cfStatsItem.metadata.cpuGames || 0) + 1;
        
        // Actualizar victorias por lado
        if (choice === 'cara') {
          cfStatsItem.metadata.caraWins = (cfStatsItem.metadata.caraWins || 0) + 1;
        } else {
          cfStatsItem.metadata.cruzWins = (cfStatsItem.metadata.cruzWins || 0) + 1;
        }
        
        // Actualizar racha actual
        cfStatsItem.metadata.currentStreak = (cfStatsItem.metadata.currentStreak || 0) + 1;
        
        // Actualizar mejor racha
        if (cfStatsItem.metadata.currentStreak > (cfStatsItem.metadata.bestStreak || 0)) {
          cfStatsItem.metadata.bestStreak = cfStatsItem.metadata.currentStreak;
        }
        
        // Actualizar mayor victoria
        const profit = amount;
        if (profit > (cfStatsItem.metadata.biggestWin || 0)) {
          cfStatsItem.metadata.biggestWin = profit;
        }
        
        // Actualizar descripción
        cfStatsItem.description = `Estadísticas de Coinflip: ${cfStatsItem.metadata.wins}/${cfStatsItem.metadata.gamesPlayed} victorias, Mejor racha: ${cfStatsItem.metadata.bestStreak}`;
      }
      
      await profile.save();
    } else {
      profile.stats.losses += 1;
      
      // Actualizar estadísticas si existe en inventario
      if (profile.character.inventory) {
        let cfStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Lanzamiento de Moneda");
        if (!cfStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Lanzamiento de Moneda",
            quantity: 1,
            description: "Registro de tus lanzamientos de moneda"
          });
          cfStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Inicializar metadatos si no existen
        if (!cfStatsItem.metadata) {
          cfStatsItem.metadata = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            caraWins: 0,
            cruzWins: 0,
            biggestWin: 0,
            bestStreak: 0,
            currentStreak: 0,
            cpuGames: 0,
            pvpGames: 0
          };
        }
        
        // Actualizar estadísticas
        cfStatsItem.metadata.gamesPlayed = (cfStatsItem.metadata.gamesPlayed || 0) + 1;
        cfStatsItem.metadata.losses = (cfStatsItem.metadata.losses || 0) + 1;
        cfStatsItem.metadata.cpuGames = (cfStatsItem.metadata.cpuGames || 0) + 1;
        
        // Resetear racha actual
        cfStatsItem.metadata.currentStreak = 0;
        
        // Actualizar descripción
        cfStatsItem.description = `Estadísticas de Coinflip: ${cfStatsItem.metadata.wins}/${cfStatsItem.metadata.gamesPlayed} victorias, Mejor racha: ${cfStatsItem.metadata.bestStreak}`;
      }
      
      await profile.save();
    }
    
    // Obtener el resultado final
    let resultTitle, resultDescription, resultColor;
    
    if (isWin) {
      // Victoria
      resultTitle = '🎉 ¡HAS GANADO! 🎉';
      resultDescription = `
**Apuesta:** ${amount} monedas
**Tu elección:** ${resultEmojis[choice]} ${choice.toUpperCase()}
**Resultado:** ${resultEmojis[result]} ${result.toUpperCase()}

**¡GANANCIA!** +${amount} monedas
**Total recibido:** ${winnings} monedas
      `;
      resultColor = '#00cc44';
    } else {
      // Derrota
      resultTitle = '❌ ¡HAS PERDIDO! ❌';
      resultDescription = `
**Apuesta:** ${amount} monedas
**Tu elección:** ${resultEmojis[choice]} ${choice.toUpperCase()}
**Resultado:** ${resultEmojis[result]} ${result.toUpperCase()}

**Has perdido:** ${amount} monedas
      `;
      resultColor = '#ff0000';
    }
    
    // Crear embed final
    const finalEmbed = new EmbedBuilder()
      .setTitle(resultTitle)
      .setDescription(resultDescription)
      .setColor(resultColor);
    
    // Botones para jugar de nuevo
    const playAgainButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`coinflip:again:${profile._id}:${amount}:cpu:${choice}`)
          .setLabel('🔄 JUGAR DE NUEVO')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`coinflip:double:${profile._id}:${amount}:cpu:${choice}`)
          .setLabel('💰 DOBLAR APUESTA')
          .setStyle(isWin ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`coinflip:flip:${profile._id}:${amount}:cpu:${choice === 'cara' ? 'cruz' : 'cara'}`)
          .setLabel(`CAMBIAR A ${choice === 'cara' ? 'CRUZ' : 'CARA'}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(choice === 'cara' ? '❌' : '🪙')
      );
    
    await gameMessage.edit({ embeds: [finalEmbed], components: [playAgainButtons] });
    
    // Crear collector para botones "jugar de nuevo"
    const filter = i => {
      const [command, action, profileId] = i.customId.split(':');
      return command === 'coinflip' && ['again', 'double', 'flip'].includes(action) && 
            profileId === profile._id.toString() && 
            (i.user.id === (context.author ? context.author.id : context.user.id));
    };
    
    const collector = gameMessage.createMessageComponentCollector({ filter, time: 60000 });
    
    collector.on('collect', async i => {
      const [, action, , betAmount, mode, betChoice] = i.customId.split(':');
      
      // Determinar nueva configuración
      let newAmount = parseInt(betAmount);
      let newChoice = betChoice;
      
      if (action === 'double') {
        newAmount *= 2;
      }
      
      // Verificar si tiene suficientes monedas
      const updatedProfile = await Profile.findById(profile._id);
      
      if (updatedProfile.character.currency < newAmount) {
        await i.reply({ 
          content: `❌ No tienes suficientes monedas para apostar ${newAmount}. Tienes ${updatedProfile.character.currency} monedas.`,
          ephemeral: true
        });
        return;
      }
      
      // Restar las monedas de la apuesta
      updatedProfile.character.currency -= newAmount;
      await updatedProfile.save();
      
      // Iniciar nuevo juego
      await i.update({ 
        content: `🪙 **LANZAMIENTO DE MONEDA VS CPU** - Nueva apuesta: ${newAmount} monedas a ${newChoice.toUpperCase()}`,
        embeds: [], 
        components: [] 
      });
      
      this.startCpuGame(context, newAmount, newChoice, updatedProfile);
    });
  },
}