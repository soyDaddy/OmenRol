const Log = require('../models/Logs');
const { Client } = require('discord.js');

/**
 * Logger - Servicio para registrar actividades en la base de datos
 */
class Logger {
  /**
   * Constructor
   * @param {Client} client - Cliente de Discord.js para obtener información adicional
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * Registra un comando ejecutado
   * @param {string} serverId - ID del servidor
   * @param {string} userId - ID del usuario
   * @param {string} command - Nombre del comando
   * @param {string} channelId - ID del canal donde se ejecutó
   * @param {Object} options - Opciones adicionales
   * @param {Array|Object} options.args - Argumentos del comando
   * @param {*} options.result - Resultado de la ejecución
   * @param {string} options.error - Error, si lo hubo
   */
  async logCommand(serverId, userId, command, channelId, options = {}) {
    try {
      // Obtener información del usuario
      const userData = await this._getUserData(userId, serverId);
      
      const log = new Log({
        serverId,
        userId,
        user: userData,
        type: 'command',
        action: command,
        channelId,
        details: {
          args: options.args || [],
          result: options.result,
          error: options.error
        }
      });
      
      await log.save();
    } catch (error) {
      console.error('Error al registrar log de comando:', error);
    }
  }

  /**
   * Registra una acción de moderación
   * @param {string} serverId - ID del servidor
   * @param {string} userId - ID del moderador
   * @param {string} action - Acción realizada (ban, kick, mute, etc.)
   * @param {string} targetId - ID del usuario afectado
   * @param {string} reason - Razón de la acción
   * @param {string} channelId - Canal donde se ejecutó
   */
  async logModeration(serverId, userId, action, targetId, reason, channelId) {
    try {
      // Obtener información del moderador
      const userData = await this._getUserData(userId, serverId);
      
      // Obtener información del usuario afectado si es posible
      let targetData = null;
      try {
        targetData = await this._getUserData(targetId, serverId);
      } catch (e) {
        // Si no se puede obtener, usar solo el ID
        targetData = { id: targetId };
      }
      
      const log = new Log({
        serverId,
        userId,
        user: userData,
        type: 'moderation',
        action,
        channelId,
        details: {
          target: targetData,
          reason
        }
      });
      
      await log.save();
    } catch (error) {
      console.error('Error al registrar log de moderación:', error);
    }
  }

  /**
   * Registra actividad de roleplay
   * @param {string} serverId - ID del servidor
   * @param {string} userId - ID del usuario
   * @param {string} action - Acción realizada
   * @param {Object} details - Detalles específicos de la acción
   * @param {string} channelId - Canal donde se ejecutó
   */
  async logRoleplay(serverId, userId, action, details, channelId) {
    try {
      const userData = await this._getUserData(userId, serverId);
      
      const log = new Log({
        serverId,
        userId,
        user: userData,
        type: 'roleplay',
        action,
        channelId,
        details
      });
      
      await log.save();
    } catch (error) {
      console.error('Error al registrar log de roleplay:', error);
    }
  }

  /**
   * Registra cambios en la configuración del servidor
   * @param {string} serverId - ID del servidor
   * @param {string} userId - ID del usuario que realizó el cambio
   * @param {string} section - Sección modificada
   * @param {Object} changes - Cambios realizados (antes/después)
   */
  async logConfigChange(serverId, userId, section, changes) {
    try {
      const userData = await this._getUserData(userId, serverId);
      
      const log = new Log({
        serverId,
        userId,
        user: userData,
        type: 'config',
        action: `update_${section}`,
        details: {
          previous: changes.previous,
          current: changes.current,
          fields: changes.fields || []
        }
      });
      
      await log.save();
    } catch (error) {
      console.error('Error al registrar cambio de configuración:', error);
    }
  }

  /**
   * Registra actividad del sistema
   * @param {string} serverId - ID del servidor
   * @param {string} action - Acción del sistema
   * @param {Object} details - Detalles de la acción
   */
  async logSystem(serverId, action, details) {
    try {
      const log = new Log({
        serverId,
        userId: 'system',
        user: {
          tag: 'Sistema',
          avatar: null
        },
        type: 'system',
        action,
        details
      });
      
      await log.save();
    } catch (error) {
      console.error('Error al registrar log del sistema:', error);
    }
  }

  /**
   * Registra actividad del perfil de usuario
   * @param {string} serverId - ID del servidor
   * @param {string} userId - ID del usuario
   * @param {string} action - Acción realizada (create, update, etc.)
   * @param {string} profileId - ID del perfil
   * @param {Object} details - Detalles de los cambios
   */
  async logProfile(serverId, userId, action, profileId, details = {}) {
    try {
      const userData = await this._getUserData(userId, serverId);
      
      const log = new Log({
        serverId,
        userId,
        user: userData,
        type: 'profile',
        action,
        details: {
          profileId,
          ...details
        }
      });
      
      await log.save();
    } catch (error) {
      console.error('Error al registrar log de perfil:', error);
    }
  }

  /**
   * Obtiene la información de un usuario para el log
   * @private
   * @param {string} userId - ID del usuario
   * @param {string} serverId - ID del servidor
   * @returns {Object} Datos del usuario
   */
  async _getUserData(userId, serverId) {
    try {
      if (!this.client) {
        return { id: userId };
      }
      
      const guild = this.client.guilds.cache.get(serverId);
      if (!guild) {
        return { id: userId };
      }
      
      const member = await guild.members.fetch(userId);
      if (!member) {
        return { id: userId };
      }
      
      return {
        id: userId,
        tag: member.user.tag,
        username: member.user.username,
        avatar: member.user.displayAvatarURL()
      };
    } catch (error) {
      console.error('Error al obtener datos de usuario:', error);
      return { id: userId };
    }
  }
}

module.exports = Logger;