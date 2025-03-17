const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'help',
  aliases: ['ayuda', 'h', 'comandos'],
  description: 'Muestra la lista de comandos disponibles',
  category: 'info',
  
  // Comando Slash
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos disponibles')
    .addStringOption(option => 
      option.setName('categoría')
      .setDescription('Filtra comandos por categoría')
      .setRequired(false)),
  
  // Ejecutar comando con prefijo
  async execute(message, args, client, serverConfig) {
    try {
      // Determinar categoría (si se proporcionó)
      const category = args[0]?.toLowerCase();
      
      // Generar menú de ayuda
      await this.generateHelpMenu(message, category, serverConfig, false);
      
    } catch (error) {
      console.error('Error en comando help:', error);
      message.reply('Ha ocurrido un error al mostrar la ayuda.');
    }
  },
  
  // Ejecutar comando slash
  async executeSlash(interaction, client, serverConfig) {
    try {
      await interaction.deferReply();
      
      // Obtener categoría seleccionada (si existe)
      const category = interaction.options.getString('categoría')?.toLowerCase();
      
      // Generar menú de ayuda
      await this.generateHelpMenu(interaction, category, serverConfig, true);
      
    } catch (error) {
      console.error('Error en comando help slash:', error);
      if (interaction.deferred) {
        await interaction.editReply('Ha ocurrido un error al mostrar la ayuda.');
      } else {
        await interaction.reply({
          content: 'Ha ocurrido un error al mostrar la ayuda.',
          ephemeral: true
        });
      }
    }
  },
  
  // Generar menú de ayuda con paginación
  async generateHelpMenu(interaction, category, serverConfig, isSlash) {
    // Cargar todos los comandos
    const commands = this.loadCommands();
    
    // Obtener todas las categorías disponibles
    const categories = [...new Set(commands.map(cmd => cmd.category))].sort();
    
    // Filtrar por categoría si se especificó
    let filteredCommands = commands;
    let currentCategory = null;
    
    if (category) {
      // Buscar coincidencia aproximada
      const matchingCategory = categories.find(cat => 
        cat.toLowerCase() === category ||
        cat.toLowerCase().includes(category)
      );
      
      if (matchingCategory) {
        filteredCommands = commands.filter(cmd => cmd.category === matchingCategory);
        currentCategory = matchingCategory;
      }
    }
    
    // Ordenar comandos alfabéticamente
    filteredCommands.sort((a, b) => a.name.localeCompare(b.name));
    
    // Configurar paginación
    const commandsPerPage = 5;
    const totalPages = Math.ceil(filteredCommands.length / commandsPerPage);
    let currentPage = 0;
    
    // Función para crear el embed de la página actual
    const createPageEmbed = (page) => {
      const startIndex = page * commandsPerPage;
      const endIndex = startIndex + commandsPerPage;
      const pageCommands = filteredCommands.slice(startIndex, endIndex);
      
      const embed = new EmbedBuilder()
        .setTitle(`📚 Ayuda de comandos${currentCategory ? ` - ${currentCategory}` : ''}`)
        .setColor('#3498db')
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${filteredCommands.length} comandos` });
      
      if (pageCommands.length === 0) {
        embed.setDescription('No se encontraron comandos en esta categoría.');
      } else {
        pageCommands.forEach((cmd) => {
          const aliases = cmd.aliases?.length > 0 
            ? `\n**Alias:** ${cmd.aliases.join(', ')}` 
            : '';
          
          embed.addFields({
            name: `${serverConfig.prefix}${cmd.name}`,
            value: `${cmd.description}${aliases}\n**Categoría:** ${cmd.category || 'Sin categoría'}`
          });
        });
      }
      
      return embed;
    };
    
    // Crear menú desplegable para seleccionar categoría
    const categoryMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Filtrar por categoría')
      .addOptions([
        {
          label: 'Todas las categorías',
          description: 'Mostrar todos los comandos',
          value: 'all',
          default: !currentCategory
        },
        ...categories.map(cat => ({
          label: this.capitalizeFirstLetter(cat),
          description: `Mostrar comandos de ${cat}`,
          value: cat,
          default: currentCategory === cat
        }))
      ]);
    
    const menuRow = new ActionRowBuilder().addComponents(categoryMenu);
    
    // Crear botones de navegación
    const updateButtons = (page, totalPages) => {
      const row = new ActionRowBuilder();
      
      // Botón de página anterior
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('help_prev')
          .setLabel('⬅️ Anterior')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page <= 0)
      );
      
      // Botón de página siguiente
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('help_next')
          .setLabel('Siguiente ➡️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= totalPages - 1 || totalPages === 0)
      );
      
      return row;
    };
    
    // Enviar mensaje inicial y configurar interacción
    const embed = createPageEmbed(currentPage);
    const buttonsRow = updateButtons(currentPage, totalPages);
    
    let message;
    
    if (isSlash) {
      message = await interaction.editReply({
        embeds: [embed],
        components: totalPages > 1 ? [menuRow, buttonsRow] : [menuRow]
      });
    } else {
      message = await interaction.reply({
        embeds: [embed],
        components: totalPages > 1 ? [menuRow, buttonsRow] : [menuRow]
      });
    }
    
    // Crear colector para interacciones (botones y menú)
    const filter = i => {
      const validInteraction = 
        i.customId === 'help_prev' || 
        i.customId === 'help_next' || 
        i.customId === 'help_category_select';
      
      const validUser = isSlash 
        ? i.user.id === interaction.user.id 
        : i.user.id === interaction.author.id;
      
      return validInteraction && validUser;
    };
    
    const collector = message.createMessageComponentCollector({
      filter,
      time: 300000, // 5 minutos
    });
    
    collector.on('collect', async i => {
      // Manejar interacciones
      switch (i.customId) {
        case 'help_prev':
          currentPage = Math.max(0, currentPage - 1);
          break;
        case 'help_next':
          currentPage = Math.min(totalPages - 1, currentPage + 1);
          break;
        case 'help_category_select':
          const selectedCategory = i.values[0];
          
          if (selectedCategory === 'all') {
            filteredCommands = commands;
            currentCategory = null;
          } else {
            filteredCommands = commands.filter(cmd => cmd.category === selectedCategory);
            currentCategory = selectedCategory;
          }
          
          // Recalcular número total de páginas y resetear a la primera página
          filteredCommands.sort((a, b) => a.name.localeCompare(b.name));
          currentPage = 0;
          break;
      }
      
      // Actualizar número total de páginas
      const updatedTotalPages = Math.ceil(filteredCommands.length / commandsPerPage);
      
      // Actualizar mensaje
      const updatedEmbed = createPageEmbed(currentPage);
      const updatedButtonsRow = updateButtons(currentPage, updatedTotalPages);
      
      // Solo mostrar los botones de navegación si hay más de una página
      const componentsToShow = updatedTotalPages > 1 
        ? [menuRow, updatedButtonsRow] 
        : [menuRow];
      
      await i.update({
        embeds: [updatedEmbed],
        components: componentsToShow
      });
    });
    
    collector.on('end', () => {
      // Eliminar botones al finalizar la interacción
      if (isSlash) {
        interaction.editReply({
          components: []
        }).catch(console.error);
      } else if (message && message.editable) {
        message.edit({
          components: []
        }).catch(console.error);
      }
    });
  },
  
  // Cargar todos los comandos disponibles
  loadCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, '..', '..', 'commands');
    
    // Función para cargar comandos recursivamente de subdirectorios
    const loadCommandsFromDirectory = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            // Recursivamente cargar comandos de subdirectorios
            loadCommandsFromDirectory(filePath);
          } else if (file.endsWith('.js')) {
            try {
              const command = require(filePath);
              
              // Solo incluir comandos con nombre y descripción
              if (command.name && command.description) {
                commands.push({
                  name: command.name,
                  description: command.description,
                  aliases: command.aliases || [],
                  category: command.category || 'Miscelánea'
                });
              }
            } catch (error) {
              console.error(`Error al cargar comando ${filePath}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error al leer el directorio ${dir}:`, error);
      }
    };
    
    try {
      loadCommandsFromDirectory(commandsPath);
    } catch (error) {
      console.error('Error al cargar comandos:', error);
    }
    
    return commands;
  },
  
  // Capitalizar primera letra
  capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
};