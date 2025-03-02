const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Profile = require('../../../models/Profile');

module.exports = {
  name: 'ruleta',
  aliases: ['roulette', 'color'],
  description: 'Juega a la ruleta de colores y multiplica tus monedas',
  category: 'casino',
  cooldown: 5,
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('ruleta')
    .setDescription('Juega a la ruleta de colores y multiplica tus monedas')
    .addIntegerOption(option => 
      option.setName('cantidad')
        .setDescription('Cantidad de monedas para apostar')
        .setRequired(false)
        .setMinValue(10))
    .addStringOption(option =>
      option.setName('color')
        .setDescription('Color al que quieres apostar')
        .setRequired(false)
        .addChoices(
          { name: '🔴 Rojo', value: 'rojo' },
          { name: '⚫ Negro', value: 'negro' },
          { name: '🟢 Verde', value: 'verde' },
          { name: '🔵 Azul', value: 'azul' },
          { name: '🟡 Oro', value: 'oro' }
        ))
    .addStringOption(option =>
      option.setName('dificultad')
        .setDescription('Nivel de dificultad')
        .setRequired(false)
        .addChoices(
          { name: 'Básico (rojo/negro)', value: 'basico' },
          { name: 'Intermedio (rojo/negro/verde)', value: 'intermedio' },
          { name: 'Avanzado (rojo/negro/verde/azul)', value: 'avanzado' },
          { name: 'Premium (rojo/negro/verde/azul/oro)', value: 'premium' }
        )),
  
  // Obtener colores válidos para una dificultad
  getValidColorsForDifficulty(difficulty) {
    const validColors = {
      'basico': ['rojo', 'negro'],
      'intermedio': ['rojo', 'negro', 'verde'],
      'avanzado': ['rojo', 'negro', 'verde', 'azul'],
      'premium': ['rojo', 'negro', 'verde', 'azul', 'oro']
    };
    
    return validColors[difficulty] || validColors['intermedio'];
  },
  
  // Obtener multiplicadores para una dificultad
  getMultipliersForDifficulty(difficulty) {
    const multipliers = {
      'basico': { rojo: 1.9, negro: 1.9 },
      'intermedio': { rojo: 1.9, negro: 1.9, verde: 9.0 },
      'avanzado': { rojo: 1.9, negro: 1.9, verde: 9.0, azul: 9.0 },
      'premium': { rojo: 1.9, negro: 1.9, verde: 9.0, azul: 9.0, oro: 25.0 }
    };
    
    return multipliers[difficulty] || multipliers['intermedio'];
  },
  
  // Obtener probabilidades para una dificultad
  getProbabilitiesForDifficulty(difficulty) {
    const probabilities = {
      'basico': [0.5, 0.5],
      'intermedio': [0.45, 0.45, 0.1],
      'avanzado': [0.4, 0.4, 0.1, 0.1],
      'premium': [0.38, 0.38, 0.1, 0.1, 0.04]
    };
    
    return probabilities[difficulty] || probabilities['intermedio'];
  },
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    // Si no hay argumentos, mostrar interfaz interactiva para seleccionar
    if (!args[0]) {
      return this.showRuletaMenu(message, serverConfig);
    }
    
    // Si hay argumentos, procesar como antes
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 10) {
      return message.reply('❌ La cantidad apostada debe ser un número mayor o igual a 10.');
    }
    
    // Verificar si el usuario tiene perfil
    const profile = await Profile.findOne({
      userId: message.author.id,
      serverId: message.guild.id
    });
    
    if (!profile) {
      return message.reply(`❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`);
    }
    
    // Resto del procesamiento
    const colorChoices = ['rojo', 'negro', 'verde', 'azul', 'oro'];
    let chosenColor = args[1]?.toLowerCase();
    
    if (!chosenColor || !colorChoices.includes(chosenColor)) {
      return message.reply('❌ Debes elegir un color válido: rojo, negro, verde, azul, oro');
    }
    
    // Determinar dificultad
    const availableDifficulties = ['basico', 'intermedio', 'avanzado', 'premium'];
    let difficulty = args[2]?.toLowerCase() || 'intermedio';
    
    if (!availableDifficulties.includes(difficulty)) {
      difficulty = 'intermedio';
    }
    
    // Verificar si el color es válido para la dificultad elegida
    const validColorsForDifficulty = this.getValidColorsForDifficulty(difficulty);
    
    if (!validColorsForDifficulty.includes(chosenColor)) {
      return message.reply(`❌ El color ${chosenColor} no está disponible en la dificultad ${difficulty}. Colores disponibles: ${validColorsForDifficulty.join(', ')}`);
    }
    
    // Verificar si tiene suficientes monedas
    if (profile.character.currency < amount) {
      return message.reply(`❌ No tienes suficientes monedas. Tienes ${profile.character.currency} monedas.`);
    }
    
    // Restar las monedas de la apuesta
    profile.character.currency -= amount;
    await profile.save();
    
    // Iniciar el juego
    this.playColorRoulette(message, amount, difficulty, chosenColor, profile);
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    const amount = interaction.options.getInteger('cantidad');
    const chosenColor = interaction.options.getString('color');
    const difficulty = interaction.options.getString('dificultad');
    
    // Si no se proporcionaron todos los parámetros, mostrar menú interactivo
    if (!amount || !chosenColor || !difficulty) {
      await interaction.reply({ content: '🎡 Configurando tu juego de Ruleta...', ephemeral: true });
      return this.showRuletaMenu(interaction, serverConfig);
    }
    
    // Verificar si el usuario tiene perfil
    const profile = await Profile.findOne({
      userId: interaction.user.id,
      serverId: interaction.guild.id
    });
    
    if (!profile) {
      return interaction.reply({ content: `❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`, ephemeral: true });
    }
    
    // Verificar si el color es válido para la dificultad elegida
    const validColorsForDifficulty = this.getValidColorsForDifficulty(difficulty);
    
    if (!validColorsForDifficulty.includes(chosenColor)) {
      return interaction.reply({ content: `❌ El color ${chosenColor} no está disponible en la dificultad ${difficulty}. Colores disponibles: ${validColorsForDifficulty.join(', ')}`, ephemeral: true });
    }
    
    // Verificar si tiene suficientes monedas
    if (profile.character.currency < amount) {
      return interaction.reply({ content: `❌ No tienes suficientes monedas. Tienes ${profile.character.currency} monedas.`, ephemeral: true });
    }
    
    // Restar las monedas de la apuesta
    profile.character.currency -= amount;
    await profile.save();
    
    // Iniciar el juego
    await interaction.reply(`🎡 **RULETA DE COLORES** - Apostando ${amount} monedas al color ${chosenColor} en modo ${difficulty}`);
    this.playColorRoulette(interaction, amount, difficulty, chosenColor, profile);
  },
  
  // Mostrar menú interactivo para seleccionar opciones
  async showRuletaMenu(context, serverConfig) {
    // Verificar si el usuario tiene perfil
    const userId = context.author ? context.author.id : context.user.id;
    const guildId = context.guild.id;
    
    const profile = await Profile.findOne({
      userId: userId,
      serverId: guildId
    });
    
    if (!profile) {
      const errorMsg = `❌ No tienes un perfil. Crea uno usando \`${serverConfig.config.prefix}perfil\`.`;
      if (context.replied) {
        return context.followUp({ content: errorMsg, ephemeral: true });
      }
      return context.reply(errorMsg);
    }
    
    // Crear menú para seleccionar dificultad
    const difficultySelect = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ruleta:difficulty:${userId}`)
          .setPlaceholder('Selecciona la dificultad')
          .addOptions([
            {
              label: 'Básico',
              description: 'Solo rojo y negro (50/50, pago 1.9x)',
              value: 'basico',
              emoji: '🎲'
            },
            {
              label: 'Intermedio',
              description: 'Rojo, negro y verde (45/45/10, pagos 1.9x y 9x)',
              value: 'intermedio',
              emoji: '🎯'
            },
            {
              label: 'Avanzado',
              description: 'Rojo, negro, verde, azul (40/40/10/10, pagos 1.9x y 9x)',
              value: 'avanzado',
              emoji: '🎮'
            },
            {
              label: 'Premium',
              description: 'Rojo, negro, verde, azul, oro (38/38/10/10/4, pagos hasta 25x)',
              value: 'premium',
              emoji: '👑'
            }
          ])
      );
    
    // Crear embed informativo
    const embed = new EmbedBuilder()
      .setTitle('🎡 RULETA DE COLORES 🎡')
      .setDescription('Apuesta en un color y gira la ruleta para multiplicar tus monedas. Cuanto más raro sea el color, mayor será el premio.')
      .addFields(
        { name: '👤 Jugador', value: `${context.author ? context.author.tag : context.user.tag}`, inline: true },
        { name: '💰 Monedas disponibles', value: `${profile.character.currency}`, inline: true },
        { name: '\u200B', value: '\u200B', inline: true }, // Espaciador
        { name: '📊 Modalidades', value: 
          '**Básico:** Solo rojo y negro (pago 1.9x)\n' +
          '**Intermedio:** Añade verde (pago 9x)\n' +
          '**Avanzado:** Añade azul (pago 9x)\n' +
          '**Premium:** Añade oro (pago 25x)'
        }
      )
      .setColor('#9900ff')
      .setFooter({ text: 'Primero selecciona la dificultad, luego el color y finalmente la cantidad a apostar' });
    
    // Enviar mensaje con el menú
    const menuMessage = context.replied ? await context.followUp({ embeds: [embed], components: [difficultySelect] }) : await context.reply({ embeds: [embed], components: [difficultySelect] });
    
    // Crear collector para interacciones
    const filter = i => {
      const [command] = i.customId.split(':');
      return command === 'ruleta' && i.user.id === userId;
    };
    
    const collector = menuMessage.createMessageComponentCollector({ filter, idle: 60000 });
    
    // Variables para almacenar las selecciones
    let selectedDifficulty = null;
    let selectedColor = null;
    let betAmount = null;
    
    // Procesar interacciones
    collector.on('collect', async i => {
      const [, action, value] = i.customId.split(':');
      
      if (action === 'difficulty') {
        selectedDifficulty = i.values[0];
        
        // Crear menú para seleccionar color basado en la dificultad
        const colors = this.getValidColorsForDifficulty(selectedDifficulty);
        const multipliers = this.getMultipliersForDifficulty(selectedDifficulty);
        
        const colorOptions = colors.map(color => {
          const colorEmoji = {
            'rojo': '🔴',
            'negro': '⚫',
            'verde': '🟢',
            'azul': '🔵',
            'oro': '🟡'
          }[color];
          
          return {
            label: color.charAt(0).toUpperCase() + color.slice(1),
            description: `Multiplicador: ${multipliers[color]}x`,
            value: color,
            emoji: colorEmoji
          };
        });
        
        const colorSelect = new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`ruleta:color:${userId}`)
              .setPlaceholder('Selecciona el color para apostar')
              .addOptions(colorOptions)
          );
        
        const updatedEmbed = new EmbedBuilder(embed.data)
          .setDescription(`Dificultad seleccionada: **${selectedDifficulty}**\n\nAhora selecciona el color en el que quieres apostar:`);
        
        await i.update({ embeds: [updatedEmbed], components: [colorSelect] });
      }
      else if (action === 'color') {
        selectedColor = i.values[0];
        
        // Crear opciones para la cantidad a apostar
        const betOptions = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ruleta:bet:10:${userId}`)
              .setLabel('10')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`ruleta:bet:50:${userId}`)
              .setLabel('50')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`ruleta:bet:100:${userId}`)
              .setLabel('100')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`ruleta:bet:500:${userId}`)
              .setLabel('500')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`ruleta:bet:1000:${userId}`)
              .setLabel('1000')
              .setStyle(ButtonStyle.Danger)
          );
          
        const customBetRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ruleta:custom:${userId}`)
              .setLabel('Cantidad personalizada')
              .setStyle(ButtonStyle.Success)
          );
        
        const colorEmoji = {
          'rojo': '🔴',
          'negro': '⚫',
          'verde': '🟢',
          'azul': '🔵',
          'oro': '🟡'
        }[selectedColor];
        
        const updatedEmbed = new EmbedBuilder(embed.data)
          .setDescription(`Dificultad: **${selectedDifficulty}**\nColor seleccionado: ${colorEmoji} **${selectedColor}**\n\nAhora selecciona la cantidad de monedas que quieres apostar:`);
        
        await i.update({ embeds: [updatedEmbed], components: [betOptions, customBetRow] });
      }
      else if (action === 'bet') {
        betAmount = parseInt(value);
        
        // Verificar si tiene suficientes monedas
        if (profile.character.currency < betAmount) {
          await i.reply({ content: `❌ No tienes suficientes monedas para apostar ${betAmount}. Tienes ${profile.character.currency} monedas.`, ephemeral: true });
          return;
        }
        
        // Confirmación final
        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ruleta:confirm:yes:${userId}`)
              .setLabel('¡GIRAR RULETA!')
              .setStyle(ButtonStyle.Success)
              .setEmoji('🎡'),
            new ButtonBuilder()
              .setCustomId(`ruleta:confirm:no:${userId}`)
              .setLabel('Cancelar')
              .setStyle(ButtonStyle.Secondary)
          );
        
        const colorEmoji = {
          'rojo': '🔴',
          'negro': '⚫',
          'verde': '🟢',
          'azul': '🔵',
          'oro': '🟡'
        }[selectedColor];
        
        const multipliers = this.getMultipliersForDifficulty(selectedDifficulty);
        
        const confirmEmbed = new EmbedBuilder()
          .setTitle('🎡 Confirmar Apuesta 🎡')
          .setDescription(
            `**Dificultad:** ${selectedDifficulty}\n` +
            `**Color:** ${colorEmoji} ${selectedColor}\n` +
            `**Cantidad:** ${betAmount} monedas\n` +
            `**Multiplicador:** ${multipliers[selectedColor]}x\n` +
            `**Posible ganancia:** ${Math.floor(betAmount * multipliers[selectedColor])} monedas\n\n` +
            `¿Confirmas tu apuesta?`
          )
          .setColor(
            selectedColor === 'rojo' ? '#ff0000' : 
            selectedColor === 'negro' ? '#000000' :
            selectedColor === 'verde' ? '#00ff00' :
            selectedColor === 'azul' ? '#0000ff' : '#ffff00'
          );
        
        await i.update({ embeds: [confirmEmbed], components: [confirmRow] });
      }
      else if (action === 'custom') {
        // Pedir al usuario que ingrese una cantidad personalizada
        const promptEmbed = new EmbedBuilder()
          .setTitle('💰 Ingresa tu apuesta 💰')
          .setDescription(
            `Por favor, responde a este mensaje con la cantidad de monedas que deseas apostar.\n` +
            `Debes responder solo con un número mayor a 10 y menor o igual a tu saldo actual (${profile.character.currency} monedas).`
          )
          .setColor('#00aaff');
        
        await i.update({ embeds: [promptEmbed], components: [] });
        
        // Crear un collector para la respuesta del usuario
        const msgFilter = m => {
          if (m.author.id !== userId) return false;
          const amount = parseInt(m.content);
          return !isNaN(amount) && amount >= 10 && amount <= profile.character.currency;
        };
        
        try {
          const collected = await context.channel.awaitMessages({ filter: msgFilter, max: 1, time: 30000, errors: ['time'] });
          
          const msg = collected.first();
          betAmount = parseInt(msg.content);
          
          // Eliminar el mensaje del usuario para mantener limpio el chat
          if (msg.deletable) await msg.delete().catch(() => {});
          
          // Mostrar confirmación
          const confirmRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`ruleta:confirm:yes:${userId}`)
                .setLabel('¡GIRAR RULETA!')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎡'),
              new ButtonBuilder()
                .setCustomId(`ruleta:confirm:no:${userId}`)
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary)
            );
          
          const colorEmoji = {
            'rojo': '🔴',
            'negro': '⚫',
            'verde': '🟢',
            'azul': '🔵',
            'oro': '🟡'
          }[selectedColor];
          
          const multipliers = this.getMultipliersForDifficulty(selectedDifficulty);
          
          const confirmEmbed = new EmbedBuilder()
            .setTitle('🎡 Confirmar Apuesta 🎡')
            .setDescription(
              `**Dificultad:** ${selectedDifficulty}\n` +
              `**Color:** ${colorEmoji} ${selectedColor}\n` +
              `**Cantidad:** ${betAmount} monedas\n` +
              `**Multiplicador:** ${multipliers[selectedColor]}x\n` +
              `**Posible ganancia:** ${Math.floor(betAmount * multipliers[selectedColor])} monedas\n\n` +
              `¿Confirmas tu apuesta?`
            )
            .setColor(
              selectedColor === 'rojo' ? '#ff0000' : 
              selectedColor === 'negro' ? '#000000' :
              selectedColor === 'verde' ? '#00ff00' :
              selectedColor === 'azul' ? '#0000ff' : '#ffff00'
            );
          
          await menuMessage.edit({ embeds: [confirmEmbed], components: [confirmRow] });
        } catch (e) {
          // Tiempo agotado o error
          await menuMessage.edit({ content: '❌ No se recibió una cantidad válida a tiempo. Vuelve a comenzar si deseas jugar.', embeds: [], components: [] });
          collector.stop('timeout');
        }
      }
      else if (action === 'confirm') {
        if (value === 'yes') {
          // Iniciar el juego
          collector.stop('game_start');
          
          // Verificar una última vez el saldo (por si acaso)
          const updatedProfile = await Profile.findById(profile._id);
          if (updatedProfile.character.currency < betAmount) {
            await i.update({ content: `❌ No tienes suficientes monedas para apostar ${betAmount}. Tienes ${updatedProfile.character.currency} monedas.`, embeds: [], components: [] });
            return;
          }
          
          // Restar las monedas de la apuesta
          updatedProfile.character.currency -= betAmount;
          await updatedProfile.save();
          
          await i.update({ content: `🎡 **RULETA DE COLORES** - Apostando ${betAmount} monedas al color ${selectedColor} en modo ${selectedDifficulty}`, embeds: [], components: [] });
          
          this.playColorRoulette(context, betAmount, selectedDifficulty, selectedColor, updatedProfile);
        } else {
          // Cancelar el juego
          await i.update({ content: '❌ Juego cancelado. No se ha realizado ninguna apuesta.', embeds: [], components: [] });
          collector.stop('cancelled');
        }
      }
    });
    
    // Si se acaba el tiempo del collector
    collector.on('end', async (collected, reason) => {
      if (reason !== 'game_start' && reason !== 'cancelled') {
        try {
          await menuMessage.edit({ content: '⏰ Se agotó el tiempo para seleccionar opciones. Vuelve a comenzar si deseas jugar.', embeds: [], components: [] });
        } catch (e) {
          // Ignorar errores si el mensaje ya fue eliminado o editado
        }
      }
    });
  },

  // Método para jugar a la ruleta de colores
  async playColorRoulette(context, amount, difficulty, chosenColor, profile) {
    // Configuración según dificultad
    const colors = this.getValidColorsForDifficulty(difficulty);
    const probabilities = this.getProbabilitiesForDifficulty(difficulty);
    const multipliers = this.getMultipliersForDifficulty(difficulty);
    
    // Crear emoji para cada color
    const colorEmojis = {
      rojo: '🔴',
      negro: '⚫',
      verde: '🟢',
      azul: '🔵',
      oro: '🟡'
    };
    
    // Crear mensaje inicial
    const embed = new EmbedBuilder()
      .setTitle('🎡 RULETA DE COLORES 🎡')
      .setDescription(`Apostando: ${amount} monedas\nColor elegido: ${colorEmojis[chosenColor]} ${chosenColor}\nDificultad: ${difficulty}`)
      .addFields(
        { name: 'Multiplicadores', value: colors.map(c => `${colorEmojis[c]} ${c}: ${multipliers[c]}x`).join('\n') }
      )
      .setColor(chosenColor === 'rojo' ? '#ff0000' : 
                chosenColor === 'negro' ? '#000000' :
                chosenColor === 'verde' ? '#00ff00' :
                chosenColor === 'azul' ? '#0000ff' : '#ffff00')
      .setFooter({ text: 'La ruleta girará en 3 segundos...' });
    
    // Enviar mensaje
    const gameMessage = context.replied ? await context.followUp({ embeds: [embed] }) : await context.reply({ embeds: [embed] });
    
    // Esperar 3 segundos
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Crear visual de la ruleta
    const createRouletteVisual = (highlightPosition = -1) => {
      // Crear una representación visual de la ruleta
      let rouletteSlots = [];
      
      // Distribuir colores según dificultad
      if (difficulty === 'basico') {
        rouletteSlots = [
          'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro',
          'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro'
        ];
      } else if (difficulty === 'intermedio') {
        rouletteSlots = [
          'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro', 'verde', 'rojo',
          'negro', 'rojo', 'negro', 'verde', 'rojo', 'negro', 'rojo', 'negro'
        ];
      } else if (difficulty === 'avanzado') {
        rouletteSlots = [
          'rojo', 'negro', 'azul', 'rojo', 'negro', 'rojo', 'verde', 'negro',
          'rojo', 'azul', 'negro', 'rojo', 'verde', 'negro', 'rojo', 'negro'
        ];
      } else { // premium
        rouletteSlots = [
          'rojo', 'negro', 'azul', 'rojo', 'negro', 'oro', 'verde', 'negro',
          'rojo', 'azul', 'negro', 'rojo', 'verde', 'negro', 'oro', 'rojo'
        ];
      }
      
      // Crear representación visual
      let visual = '';
      const slotCount = rouletteSlots.length;
      const visibleSlots = Math.min(9, slotCount); // Mostrar 9 casillas a la vez
      
      const startPos = highlightPosition >= 0 ? Math.max(0, Math.min(slotCount - visibleSlots, highlightPosition - Math.floor(visibleSlots/2))) : 0;
                       
      for (let i = 0; i < visibleSlots; i++) {
        const slotIndex = (startPos + i) % slotCount;
        const slot = rouletteSlots[slotIndex];
        
        // Añadir markers alrededor de la posición destacada
        if (slotIndex === highlightPosition) {
          visual += `➡️ ${colorEmojis[slot]} ⬅️ `;
        } else {
          visual += `${colorEmojis[slot]} `;
        }
      }
      
      return visual;
    };
    
    // Simular animación de la ruleta (varios frames)
    const totalSpins = 20; // Número total de spins antes de mostrar el resultado
    const result = this.getRandomWeighted(colors, probabilities); // Predeterminar el resultado
    
    // Animar la ruleta
    for (let i = 0; i < totalSpins; i++) {
      // Posición actual en la ruleta (velocidad variable)
      const currentPosition = i % 16;
      
      // Crear animación de velocidad variable (más lento al final)
      const spinDelay = Math.max(100, 500 - (i * 20) + (i > totalSpins * 0.7 ? (i - totalSpins * 0.7) * 100 : 0));
      
      // El último frame muestra el resultado
      const isLastFrame = i === totalSpins - 1;
      
      // Para el último frame, elegimos una posición que tenga el color que salió como resultado
      let spinPosition;
      if (isLastFrame) {
        // Encontrar una posición que tenga el color resultado
        const rouletteSlots = [];
        if (difficulty === 'basico') {
          rouletteSlots.push(...[
            'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro',
            'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro'
          ]);
        } else if (difficulty === 'intermedio') {
          rouletteSlots.push(...[
            'rojo', 'negro', 'rojo', 'negro', 'rojo', 'negro', 'verde', 'rojo',
            'negro', 'rojo', 'negro', 'verde', 'rojo', 'negro', 'rojo', 'negro'
          ]);
        } else if (difficulty === 'avanzado') {
          rouletteSlots.push(...[
            'rojo', 'negro', 'azul', 'rojo', 'negro', 'rojo', 'verde', 'negro',
            'rojo', 'azul', 'negro', 'rojo', 'verde', 'negro', 'rojo', 'negro'
          ]);
        } else { // premium
          rouletteSlots.push(...[
            'rojo', 'negro', 'azul', 'rojo', 'negro', 'oro', 'verde', 'negro',
            'rojo', 'azul', 'negro', 'rojo', 'verde', 'negro', 'oro', 'rojo'
          ]);
        }
        
        // Encontrar todas las posiciones con el color resultado
        const matchingPositions = [];
        for (let j = 0; j < rouletteSlots.length; j++) {
          if (rouletteSlots[j] === result) {
            matchingPositions.push(j);
          }
        }
        
        // Seleccionar una posición aleatoria entre las que tienen el color resultado
        spinPosition = matchingPositions[Math.floor(Math.random() * matchingPositions.length)];
      } else {
        spinPosition = currentPosition;
      }
      
      const rouletteVisual = createRouletteVisual(spinPosition);
      
      const spinEmbed = new EmbedBuilder()
        .setTitle('🎡 RULETA DE COLORES 🎡')
        .setDescription(`
Apostando: ${amount} monedas
Color elegido: ${colorEmojis[chosenColor]} ${chosenColor}
Dificultad: ${difficulty}

${rouletteVisual}
        `)
        .setColor('#9900ff');
      
      await gameMessage.edit({ embeds: [spinEmbed] });
      
      // Pausa entre frames de animación
      await new Promise(resolve => setTimeout(resolve, spinDelay));
    }
    
    // Determinar si ganó o perdió
    const isWin = result === chosenColor;
    let winnings = 0;
    
    if (isWin) {
      winnings = Math.floor(amount * multipliers[result]);
      
      // Actualizar monedas del usuario
      profile.character.currency += winnings;
      profile.stats.wins += 1;
      
      // Actualizar estadísticas de apuestas si existe en el inventario
      if (profile.character.inventory) {
        // Verificar si tiene un objeto de estadísticas de ruleta
        let ruletaStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Ruleta");
        if (!ruletaStatsItem) {
          // Si no existe, crearlo
          profile.character.inventory.push({
            item: "Estadísticas de Ruleta",
            quantity: 1,
            description: "Registro de tus apuestas en la ruleta de colores"
          });
          ruletaStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        // Actualizar estadísticas
        if (!ruletaStatsItem.metadata) {
          ruletaStatsItem.metadata = { 
            totalBets: 0, 
            wins: 0, 
            biggestWin: 0, 
            favoriteColor: null,
            colorStats: {}
          };
        }
        
        ruletaStatsItem.metadata.totalBets = (ruletaStatsItem.metadata.totalBets || 0) + 1;
        ruletaStatsItem.metadata.wins = (ruletaStatsItem.metadata.wins || 0) + 1;
        
        // Actualizar mayor victoria
        if (winnings - amount > (ruletaStatsItem.metadata.biggestWin || 0)) {
          ruletaStatsItem.metadata.biggestWin = winnings - amount;
        }
        
        // Actualizar estadísticas por color
        if (!ruletaStatsItem.metadata.colorStats) ruletaStatsItem.metadata.colorStats = {};
        if (!ruletaStatsItem.metadata.colorStats[chosenColor]) {
          ruletaStatsItem.metadata.colorStats[chosenColor] = { 
            bets: 0, 
            wins: 0 
          };
        }
        
        ruletaStatsItem.metadata.colorStats[chosenColor].bets = 
          (ruletaStatsItem.metadata.colorStats[chosenColor].bets || 0) + 1;
        ruletaStatsItem.metadata.colorStats[chosenColor].wins = 
          (ruletaStatsItem.metadata.colorStats[chosenColor].wins || 0) + 1;
        
        // Actualizar color favorito
        let favoriteColor = ruletaStatsItem.metadata.favoriteColor;
        let maxBets = favoriteColor ? 
          ruletaStatsItem.metadata.colorStats[favoriteColor].bets : 0;
        
        for (const [color, stats] of Object.entries(ruletaStatsItem.metadata.colorStats)) {
          if (stats.bets > maxBets) {
            favoriteColor = color;
            maxBets = stats.bets;
          }
        }
        
        ruletaStatsItem.metadata.favoriteColor = favoriteColor;
        
        // Actualizar descripción
        ruletaStatsItem.description = 
          `Estadísticas de Ruleta: ${ruletaStatsItem.metadata.wins}/${ruletaStatsItem.metadata.totalBets} victorias, ` +
          `Mayor ganancia: ${ruletaStatsItem.metadata.biggestWin} monedas`;
      }
      
      await profile.save();
    } else {
      // Actualizar estadísticas en caso de pérdida
      profile.stats.losses += 1;
      
      // Actualizar estadísticas de apuestas si existe en el inventario
      if (profile.character.inventory) {
        let ruletaStatsItem = profile.character.inventory.find(item => item.item === "Estadísticas de Ruleta");
        if (!ruletaStatsItem) {
          profile.character.inventory.push({
            item: "Estadísticas de Ruleta",
            quantity: 1,
            description: "Registro de tus apuestas en la ruleta de colores"
          });
          ruletaStatsItem = profile.character.inventory[profile.character.inventory.length - 1];
        }
        
        if (!ruletaStatsItem.metadata) {
          ruletaStatsItem.metadata = { 
            totalBets: 0, 
            wins: 0, 
            biggestWin: 0, 
            favoriteColor: null,
            colorStats: {}
          };
        }
        
        ruletaStatsItem.metadata.totalBets = (ruletaStatsItem.metadata.totalBets || 0) + 1;
        
        if (!ruletaStatsItem.metadata.colorStats) ruletaStatsItem.metadata.colorStats = {};
        if (!ruletaStatsItem.metadata.colorStats[chosenColor]) {
          ruletaStatsItem.metadata.colorStats[chosenColor] = { 
            bets: 0, 
            wins: 0 
          };
        }
        
        ruletaStatsItem.metadata.colorStats[chosenColor].bets = 
          (ruletaStatsItem.metadata.colorStats[chosenColor].bets || 0) + 1;
        
        // Actualizar color favorito igual que antes
        let favoriteColor = ruletaStatsItem.metadata.favoriteColor;
        let maxBets = favoriteColor ? 
          ruletaStatsItem.metadata.colorStats[favoriteColor].bets : 0;
        
        for (const [color, stats] of Object.entries(ruletaStatsItem.metadata.colorStats)) {
          if (stats.bets > maxBets) {
            favoriteColor = color;
            maxBets = stats.bets;
          }
        }
        
        ruletaStatsItem.metadata.favoriteColor = favoriteColor;
        
        // Actualizar descripción
        ruletaStatsItem.description = 
          `Estadísticas de Ruleta: ${ruletaStatsItem.metadata.wins}/${ruletaStatsItem.metadata.totalBets} victorias, ` +
          `Mayor ganancia: ${ruletaStatsItem.metadata.biggestWin} monedas`;
      }
      
      await profile.save();
    }
    
    // Efectos visuales según el resultado
    let effectEmojis;
    if (isWin) {
      const celebrations = ['🎉', '🎊', '✨', '💰', '🏆'];
      effectEmojis = Array(3).fill().map(() => celebrations[Math.floor(Math.random() * celebrations.length)]).join(' ');
    } else {
      const fails = ['💔', '😭', '💸', '📉', '🤯'];
      effectEmojis = Array(3).fill().map(() => fails[Math.floor(Math.random() * fails.length)]).join(' ');
    }
    
    // Mostrar resultado final con efectos visuales
    const resultEmbed = new EmbedBuilder()
      .setTitle(isWin ? 
        `${effectEmojis} ¡GANASTE! ${effectEmojis}` : 
        `${effectEmojis} ¡PERDISTE! ${effectEmojis}`)
      .setDescription(`
Apostaste: ${amount} monedas en ${colorEmojis[chosenColor]} ${chosenColor}
Resultado: ${colorEmojis[result]} ${result}
${isWin ? `Multiplicador: ${multipliers[result]}x` : ''}

${isWin ? 
  `**¡GANANCIA!** +${winnings - amount} monedas\n**Total recibido:** ${winnings} monedas` : 
  `**¡PERDISTE!** -${amount} monedas`}
      `)
      .setColor(result === 'rojo' ? '#ff0000' : 
               result === 'negro' ? '#000000' :
               result === 'verde' ? '#00ff00' :
               result === 'azul' ? '#0000ff' : '#ffff00');
    
    // Añadir botones para jugar de nuevo
    const playAgainRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ruleta:again:${profile._id}:${amount}:${chosenColor}:${difficulty}`)
          .setLabel('🔄 REPETIR APUESTA')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`ruleta:double:${profile._id}:${amount}:${chosenColor}:${difficulty}`)
          .setLabel('⏫ DOBLAR APUESTA')
          .setStyle(isWin ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ruleta:menu:${profile._id}`)
          .setLabel('🎮 MENÚ RULETA')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await gameMessage.edit({ embeds: [resultEmbed], components: [playAgainRow] });
    
    // Configurar collector para botones de "jugar de nuevo"
    const filter = i => {
      const [command] = i.customId.split(':');
      return command === 'ruleta' && i.user.id === (context.author ? context.author.id : context.user.id);
    };
    
    const collector = gameMessage.createMessageComponentCollector({ filter, time: 60000 });
    
    collector.on('collect', async i => {
      const [, action, profileId, oldAmount, oldColor, oldDifficulty] = i.customId.split(':');
      
      if (action === 'again') {
        // Repetir la misma apuesta
        const newAmount = parseInt(oldAmount);
        
        // Verificar si tiene suficientes monedas
        const updatedProfile = await Profile.findById(profileId);
        
        if (updatedProfile.character.currency < newAmount) {
          await i.reply({ content: `❌ No tienes suficientes monedas para apostar ${newAmount}. Tienes ${updatedProfile.character.currency} monedas.`, ephemeral: true });
          return;
        }
        
        // Restar las monedas y jugar de nuevo
        updatedProfile.character.currency -= newAmount;
        await updatedProfile.save();
        
        await i.update({ content: `🎡 **RULETA DE COLORES** - Nueva apuesta: ${newAmount} monedas al color ${oldColor} en modo ${oldDifficulty}`,embeds: [], components: [] });
        
        this.playColorRoulette(context, newAmount, oldDifficulty, oldColor, updatedProfile);
      }
      else if (action === 'double') {
        // Doblar la apuesta anterior
        const newAmount = parseInt(oldAmount) * 2;
        
        // Verificar si tiene suficientes monedas
        const updatedProfile = await Profile.findById(profileId);
        
        if (updatedProfile.character.currency < newAmount) {
          await i.reply({ content: `❌ No tienes suficientes monedas para apostar ${newAmount}. Tienes ${updatedProfile.character.currency} monedas.`, ephemeral: true });
          return;
        }
        
        // Restar las monedas y jugar de nuevo
        updatedProfile.character.currency -= newAmount;
        await updatedProfile.save();
        
        await i.update({ content: `🎡 **RULETA DE COLORES** - ¡Apuesta doble!: ${newAmount} monedas al color ${oldColor} en modo ${oldDifficulty}`,embeds: [], components: [] });
        
        this.playColorRoulette(context, newAmount, oldDifficulty, oldColor, updatedProfile);
      }
      else if (action === 'menu') {
        // Mostrar menú de ruleta para seleccionar nuevas opciones
        await i.update({ content: '🎡 Abriendo menú de Ruleta...', embeds: [], components: [] });
        
        this.showRuletaMenu(context, null);
      }
    });
  },
  
  // Función para obtener un valor aleatorio con pesos
  getRandomWeighted(items, weights) {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < items.length; i++) {
      if (random < weights[i]) {
        return items[i];
      }
      random -= weights[i];
    }
    
    return items[0]; // Por si acaso
  }
};