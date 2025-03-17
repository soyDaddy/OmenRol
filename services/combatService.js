const Combat = require('../models/Combat');
const Enemy = require('../models/Enemy');
const Profile = require('../models/Profile');
const Item = require('../models/Items');
const Skill = require('../models/Skill');
const Activity = require('../models/Activity');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class CombatService {
  /**
   * Iniciar un nuevo combate PvE
   * @param {Object} options Opciones para el combate
   * @param {String} options.serverId ID del servidor
   * @param {String} options.channelId ID del canal
   * @param {Array} options.playerIds Array de IDs de jugadores
   * @param {Object} options.enemy Objeto enemigo o array de enemigos (opcional)
   * @param {Number} options.enemyLevel Nivel del enemigo si no se proporciona uno (opcional)
   * @param {String} options.enemyType Tipo de enemigo a generar (opcional)
   * @param {Number} options.enemyCount Cantidad de enemigos (opcional)
   * @param {String} options.difficulty Dificultad del combate (opcional)
   * @param {String} options.missionId ID de misión asociada (opcional)
   * @returns {Promise<Object>} Objeto de combate creado
   */
  static async startPvECombat(options) {
    try {
      // Validar que al menos un jugador esté participando
      if (!options.playerIds || options.playerIds.length === 0) {
        throw new Error('Se requiere al menos un jugador para iniciar el combate');
      }
      
      // Establecer valores por defecto
      const enemyLevel = options.enemyLevel || 1;
      const enemyType = options.enemyType || 'normal';
      const enemyCount = options.enemyCount || 1;
      const difficulty = options.difficulty || 'medium';
      
      // 1. Obtener perfiles de jugadores
      const playerProfiles = await Promise.all(
        options.playerIds.map(id => Profile.findOne({ userId: id, serverId: options.serverId }))
      );
      
      const validProfiles = playerProfiles.filter(profile => profile !== null);
      if (validProfiles.length === 0) {
        throw new Error('No se encontraron perfiles válidos para los jugadores');
      }
      
      // 2. Obtener o generar enemigos
      let enemies = [];
      if (options.enemy) {
        // Si se proporciona un enemigo específico
        enemies = Array.isArray(options.enemy) ? options.enemy : [options.enemy];
      } else {
        // Obtener enemigos aleatorios según nivel
        enemies = await Enemy.getRandomByLevel(
          options.serverId,
          enemyLevel,
          enemyCount,
          enemyType
        );
      }
      
      if (enemies.length === 0) {
        throw new Error('No se pudieron generar enemigos para el combate');
      }
      
      // 3. Crear objeto de combate
      const combat = new Combat({
        serverId: options.serverId,
        channelId: options.channelId,
        type: 'pve',
        difficulty: difficulty,
        missionId: options.missionId || null,
        isGroup: validProfiles.length > 1,
        currentTurn: 1,
        timeLimit: new Date(Date.now() + 30 * 60 * 1000) // 30 minutos para finalizar
      });
      
      // 4. Añadir participantes (jugadores)
      for (const profile of validProfiles) {
        const playerSkills = await this._getPlayerCombatSkills(profile);
        
        combat.participants.push({
          type: 'player',
          userId: profile.userId,
          name: profile.character.name || `Usuario-${profile.userId}`,
          avatar: profile.character.avatar,
          stats: {
            health: profile.character.health.current,
            maxHealth: profile.character.health.max,
            mana: profile.character.mana.current,
            maxMana: profile.character.mana.max,
            strength: profile.character.stats.strength,
            intelligence: profile.character.stats.intelligence,
            dexterity: profile.character.stats.dexterity,
            defense: profile.character.stats.defense
          },
          skills: playerSkills,
          equipment: profile.character.equipment
        });
      }
      
      // 5. Añadir participantes (enemigos)
      const enemyCounts = {}; // Para llevar un registro de duplicados
      
      for (const enemy of enemies) {
        // Contar duplicados para nombrarlos
        if (!enemyCounts[enemy.name]) {
          enemyCounts[enemy.name] = 1;
        } else {
          enemyCounts[enemy.name]++;
        }
        
        const duplicateNumber = enemyCounts[enemy.name] > 1 ? enemyCounts[enemy.name] : 0;
        
        combat.participants.push({
          type: 'enemy',
          enemyId: enemy._id.toString(),
          name: enemy.name,
          duplicateNumber: duplicateNumber,
          avatar: enemy.image,
          stats: { ...enemy.stats },
          attacks: enemy.attacks.map(attack => ({
            ...attack.toObject(),
            currentCooldown: 0
          }))
        });
      }
      
      // 6. Determinar orden de turnos basado en destreza
      const sortedParticipants = [...combat.participants].sort((a, b) => 
        b.stats.dexterity - a.stats.dexterity
      );
      
      combat.turnOrder = sortedParticipants.map(p => p._id.toString());
      combat.currentParticipantId = combat.turnOrder[0];
      
      // 7. Guardar y devolver el combate
      await combat.save();
      return combat;
    } catch (error) {
      console.error('Error al iniciar combate PvE:', error);
      throw error;
    }
  }
  
  /**
   * Obtener habilidades de combate de un perfil de jugador
   * @param {Object} profile Perfil del jugador
   * @returns {Promise<Array>} Array de habilidades para combate
   * @private
   */
  static async _getPlayerCombatSkills(profile) {
    try {
      if (!profile.character.skills || profile.character.skills.length === 0) {
        return [];
      }
      
      const skillIds = profile.character.skills.map(skill => skill.skillId);
      const skills = await Skill.find({ _id: { $in: skillIds } });
      
      // Mapear habilidades con sus datos completos
      return profile.character.skills.map(playerSkill => {
        const skillData = skills.find(s => s._id.toString() === playerSkill.skillId);
        if (!skillData) return null;
        
        return {
          skillId: playerSkill.skillId,
          name: skillData.name,
          description: skillData.description,
          damageType: skillData.category === 'attack' ? 'physical' : 'magical',
          baseDamage: skillData.effects.damage || 0,
          healing: skillData.effects.healing || 0,
          manaCost: skillData.manaCost || 0,
          cooldown: skillData.cooldown || 0,
          currentCooldown: 0,
          effects: skillData.effects
        };
      }).filter(skill => skill !== null);
    } catch (error) {
      console.error('Error al obtener habilidades de combate:', error);
      return [];
    }
  }
  
  /**
   * Procesar la acción de un jugador en el combate
   * @param {String} combatId ID del combate
   * @param {String} userId ID del usuario que realiza la acción
   * @param {Object} action Datos de la acción
   * @param {String} action.type Tipo de acción (attack, skill, item, flee, defend)
   * @param {String} action.targetId ID del objetivo (opcional)
   * @param {String} action.skillId ID de la habilidad a usar (opcional)
   * @param {String} action.itemId ID del item a usar (opcional)
   * @returns {Promise<Object>} Resultado de la acción
   */
  static async processPlayerAction(combatId, userId, action) {
    try {
      // 1. Obtener el combate
      const combat = await Combat.findById(combatId);
      if (!combat || combat.status !== 'active') {
        throw new Error('Combate no encontrado o no activo');
      }
      
      // 2. Verificar que sea el turno del jugador
      const playerParticipant = combat.participants.find(p => 
        p.type === 'player' && p.userId === userId
      );
      
      if (!playerParticipant) {
        throw new Error('Jugador no encontrado en el combate');
      }
      
      if (combat.currentParticipantId !== playerParticipant._id.toString()) {
        throw new Error('No es el turno de este jugador');
      }
      
      // 3. Verificar que el jugador pueda actuar
      if (playerParticipant.isDefeated || playerParticipant.turnState.stunned) {
        throw new Error('El jugador no puede actuar en este momento');
      }
      
      // 4. Procesar según tipo de acción
      let actionResult = null;
      
      switch (action.type) {
        case 'attack':
          actionResult = await this._processAttack(combat, playerParticipant, action);
          break;
        case 'skill':
          actionResult = await this._processSkill(combat, playerParticipant, action);
          break;
        case 'item':
          actionResult = await this._processItem(combat, playerParticipant, action);
          break;
        case 'flee':
          actionResult = await this._processFlee(combat, playerParticipant);
          break;
        case 'defend':
          actionResult = await this._processDefend(combat, playerParticipant);
          break;
        default:
          throw new Error('Tipo de acción no válido');
      }
      
      // 5. Verificar si el combate ha terminado
      const combatEnded = this._checkCombatEnd(combat);
      if (combatEnded) {
        if (combatEnded === 'victory') {
          await this._processCombatVictory(combat);
        } else {
          await this._processCombatDefeat(combat);
        }
        
        // No avanzar al siguiente turno si el combate ha terminado
        return { 
          action: actionResult, 
          combatEnded: true, 
          result: combatEnded 
        };
      }
      
      // 6. Avanzar al siguiente turno
      await this._advanceToNextTurn(combat);
      
      // 7. Si el siguiente turno es de un enemigo, procesar automáticamente
      const nextParticipant = combat.participants.find(
        p => p._id.toString() === combat.currentParticipantId
      );
      
      if (nextParticipant && nextParticipant.type === 'enemy' && !nextParticipant.isDefeated) {
        const enemyAction = await this._processEnemyAction(combat, nextParticipant);
        
        // Verificar si el combate ha terminado tras la acción del enemigo
        const combatEndedAfterEnemy = this._checkCombatEnd(combat);
        if (combatEndedAfterEnemy) {
          if (combatEndedAfterEnemy === 'victory') {
            await this._processCombatVictory(combat);
          } else {
            await this._processCombatDefeat(combat);
          }
          
          return { 
            action: actionResult, 
            enemyAction, 
            combatEnded: true, 
            result: combatEndedAfterEnemy 
          };
        }
        
        // Avanzar al siguiente turno después de la acción del enemigo
        await this._advanceToNextTurn(combat);
        
        return { action: actionResult, enemyAction };
      }
      
      return { action: actionResult };
    } catch (error) {
      console.error('Error al procesar acción del jugador:', error);
      throw error;
    }
  }
  
  /**
   * Procesar ataque básico
   * @param {Object} combat Objeto de combate
   * @param {Object} actor Participante que realiza la acción
   * @param {Object} action Datos de la acción
   * @returns {Promise<Object>} Resultado de la acción
   * @private
   */
  static async _processAttack(combat, actor, action) {
    try {
      // Validar que se haya seleccionado un objetivo
      if (!action.targetId) {
        throw new Error('Debes seleccionar un objetivo para atacar');
      }
      
      // Encontrar el objetivo
      const target = combat.participants.find(p => p._id.toString() === action.targetId);
      if (!target || target.isDefeated) {
        throw new Error('Objetivo no válido o ya derrotado');
      }
      
      // Calcular daño base (fuerza + modificadores de arma)
      let baseDamage = actor.stats.strength;
      
      // Añadir bonificación por arma equipada (si es jugador)
      if (actor.type === 'player' && actor.equipment && actor.equipment.weapon) {
        // Implementar lógica para obtener bonificación de arma
        // Por ahora, simplemente añadimos 5 puntos de daño por tener un arma
        baseDamage += 5;
      }
      
      // Calcular si evade
      const evasionChance = Math.min(30, Math.max(5, target.stats.dexterity - actor.stats.dexterity + 10));
      const evaded = Math.random() * 100 < evasionChance;
      
      if (evaded) {
        // El objetivo evadió el ataque
        const actionLog = {
          actorId: actor._id.toString(),
          actorType: actor.type,
          actorName: actor.name,
          actionType: 'attack',
          details: {
            attackName: 'Ataque básico'
          },
          targets: [{
            targetId: target._id.toString(),
            targetName: target.name,
            damage: 0,
            wasEvaded: true
          }],
          message: `${target.name} evadió el ataque de ${actor.name}.`
        };
        
        combat.actionLog.push(actionLog);
        await combat.save();
        
        return { success: true, evaded: true, damage: 0, message: actionLog.message };
      }
      
      // Calcular si es crítico
      const critChance = Math.min(20, Math.max(5, actor.stats.dexterity / 5 + 5));
      const isCritical = Math.random() * 100 < critChance;
      
      // Calcular daño
      let damage = baseDamage;
      if (isCritical) {
        damage = Math.floor(damage * 1.5);
      }
      
      // Aplicar reducción por defensa
      const damageReduction = Math.min(75, Math.max(0, target.stats.defense / 2));
      damage = Math.max(1, Math.floor(damage * (1 - damageReduction / 100)));
      
      // Aplicar daño
      target.stats.health = Math.max(0, target.stats.health - damage);
      
      // Verificar si el objetivo fue derrotado
      if (target.stats.health === 0) {
        target.isDefeated = true;
      }
      
      // Crear registro de acción
      const actionLog = {
        actorId: actor._id.toString(),
        actorType: actor.type,
        actorName: actor.name,
        actionType: 'attack',
        details: {
          attackName: 'Ataque básico'
        },
        targets: [{
          targetId: target._id.toString(),
          targetName: target.name,
          damage: damage,
          wasCritical: isCritical,
          wasEvaded: false
        }],
        message: isCritical
          ? `¡${actor.name} asesta un golpe crítico a ${target.name} causando ${damage} de daño!`
          : `${actor.name} ataca a ${target.name} causando ${damage} de daño.`
      };
      
      if (target.isDefeated) {
        actionLog.message += ` ¡${target.name} ha sido derrotado!`;
      }
      
      combat.actionLog.push(actionLog);
      await combat.save();
      
      return {
        success: true,
        damage,
        critical: isCritical,
        defeated: target.isDefeated,
        message: actionLog.message
      };
    } catch (error) {
      console.error('Error al procesar ataque:', error);
      throw error;
    }
  }
  
  /**
   * Procesar uso de habilidad
   * @param {Object} combat Objeto de combate
   * @param {Object} actor Participante que realiza la acción
   * @param {Object} action Datos de la acción
   * @returns {Promise<Object>} Resultado de la acción
   * @private
   */
  static async _processSkill(combat, actor, action) {
    try {
      // Validar que se haya seleccionado una habilidad
      if (!action.skillId) {
        throw new Error('Debes seleccionar una habilidad para usar');
      }
      
      // Encontrar la habilidad
      const skill = actor.skills.find(s => s.skillId === action.skillId);
      if (!skill) {
        throw new Error('Habilidad no encontrada');
      }
      
      // Verificar cooldown
      if (skill.currentCooldown > 0) {
        throw new Error(`Habilidad en cooldown. Faltan ${skill.currentCooldown} turnos.`);
      }
      
      // Verificar maná
      if (actor.stats.mana < skill.manaCost) {
        throw new Error(`No tienes suficiente maná (${actor.stats.mana}/${skill.manaCost}).`);
      }
      
      // Validar objetivo para habilidades que lo requieren
      let target = null;
      if (skill.baseDamage > 0 && !action.targetId) {
        throw new Error('Debes seleccionar un objetivo para esta habilidad');
      }
      
      if (action.targetId) {
        target = combat.participants.find(p => p._id.toString() === action.targetId);
        if (!target || target.isDefeated) {
          throw new Error('Objetivo no válido o ya derrotado');
        }
      }
      
      // Crear registro de acción base
      const actionLog = {
        actorId: actor._id.toString(),
        actorType: actor.type,
        actorName: actor.name,
        actionType: 'skill',
        details: {
          skillId: skill.skillId,
          skillName: skill.name
        },
        targets: [],
        message: `${actor.name} usa ${skill.name}.`
      };
      
      // Reducir maná
      actor.stats.mana -= skill.manaCost;
      
      // Aplicar cooldown
      skill.currentCooldown = skill.cooldown;
      
      // Procesar efectos según tipo de habilidad
      if (skill.healing > 0) {
        // Habilidad de curación
        const healTarget = target || actor; // Si no hay objetivo, curar al usuario
        const healAmount = skill.healing + Math.floor(actor.stats.intelligence * 0.5);
        
        healTarget.stats.health = Math.min(
          healTarget.stats.maxHealth,
          healTarget.stats.health + healAmount
        );
        
        actionLog.targets.push({
          targetId: healTarget._id.toString(),
          targetName: healTarget.name,
          healing: healAmount
        });
        
        actionLog.message = `${actor.name} usa ${skill.name} y cura ${healAmount} puntos de salud a ${healTarget.name}.`;
      }
      
      if (skill.baseDamage > 0 && target) {
        // Habilidad de daño
        let damage = skill.baseDamage;
        
        // Ajustar daño según estadística relevante
        if (skill.damageType === 'physical') {
          damage += Math.floor(actor.stats.strength * 0.8);
        } else {
          damage += Math.floor(actor.stats.intelligence * 0.8);
        }
        
        // Aplicar reducción por defensa
        const damageReduction = Math.min(75, Math.max(0, target.stats.defense / 2));
        damage = Math.max(1, Math.floor(damage * (1 - damageReduction / 100)));
        
        // Aplicar daño
        target.stats.health = Math.max(0, target.stats.health - damage);
        
        // Verificar si el objetivo fue derrotado
        if (target.stats.health === 0) {
          target.isDefeated = true;
        }
        
        actionLog.targets.push({
          targetId: target._id.toString(),
          targetName: target.name,
          damage: damage,
          wasCritical: false,
          wasEvaded: false
        });
        
        actionLog.message = `${actor.name} usa ${skill.name} contra ${target.name} causando ${damage} de daño.`;
        
        if (target.isDefeated) {
          actionLog.message += ` ¡${target.name} ha sido derrotado!`;
        }
      }
      
      // Implementar lógica para otros tipos de efectos (buffs, debuffs, etc.)
      // ...
      
      combat.actionLog.push(actionLog);
      await combat.save();
      
      return {
        success: true,
        skillName: skill.name,
        message: actionLog.message,
        targets: actionLog.targets
      };
    } catch (error) {
      console.error('Error al procesar habilidad:', error);
      throw error;
    }
  }
  
  /**
   * Procesar uso de item
   * @param {Object} combat Objeto de combate
   * @param {Object} actor Participante que realiza la acción
   * @param {Object} action Datos de la acción
   * @returns {Promise<Object>} Resultado de la acción
   * @private
   */
  static async _processItem(combat, actor, action) {
    try {
      // Validar que se haya seleccionado un item
      if (!action.itemId) {
        throw new Error('Debes seleccionar un item para usar');
      }
      
      // Solo jugadores pueden usar items
      if (actor.type !== 'player') {
        throw new Error('Solo los jugadores pueden usar items');
      }
      
      // Buscar el perfil del jugador para verificar inventario
      const profile = await Profile.findOne({ 
        userId: actor.userId, 
        serverId: combat.serverId 
      });
      
      if (!profile) {
        throw new Error('Perfil del jugador no encontrado');
      }
      
      // Verificar si tiene el item en el inventario
      const inventoryItem = profile.character.inventory.find(
        item => item.itemId === action.itemId
      );
      
      if (!inventoryItem || inventoryItem.quantity <= 0) {
        throw new Error('No tienes este item en tu inventario');
      }
      
      // Obtener detalles completos del item
      const itemDetails = await Item.findById(action.itemId);
      if (!itemDetails) {
        throw new Error('Detalles del item no encontrados');
      }
      
      // Verificar que el item sea usable
      if (itemDetails.type !== 'usable' && !itemDetails.consumable) {
        throw new Error('Este item no se puede usar en combate');
      }
      
      // Verificar objetivo para items que lo requieren
      let target = null;
      if (action.targetId) {
        target = combat.participants.find(p => p._id.toString() === action.targetId);
        if (!target || target.isDefeated) {
          throw new Error('Objetivo no válido o ya derrotado');
        }
      }
      
      // Crear registro de acción base
      const actionLog = {
        actorId: actor._id.toString(),
        actorType: actor.type,
        actorName: actor.name,
        actionType: 'item',
        details: {
          itemId: itemDetails._id.toString(),
          itemName: itemDetails.name
        },
        targets: [],
        message: `${actor.name} usa ${itemDetails.name}.`
      };
      
      // Procesar efectos según tipo de item
      if (itemDetails.effects) {
        const effects = itemDetails.effects;
        const effectTarget = target || actor; // Si no hay objetivo, aplicar al usuario
        
        // Efectos de salud
        if (effects.health !== 0) {
          const healthChange = effects.health;
          
          if (healthChange > 0) {
            // Curación
            effectTarget.stats.health = Math.min(
              effectTarget.stats.maxHealth,
              effectTarget.stats.health + healthChange
            );
            
            actionLog.targets.push({
              targetId: effectTarget._id.toString(),
              targetName: effectTarget.name,
              healing: healthChange
            });
            
            actionLog.message = `${actor.name} usa ${itemDetails.name} y recupera ${healthChange} puntos de salud a ${effectTarget.name}.`;
          } else {
            // Daño (pociones de daño, venenos, etc.)
            const damage = Math.abs(healthChange);
            effectTarget.stats.health = Math.max(0, effectTarget.stats.health - damage);
            
            // Verificar si el objetivo fue derrotado
            if (effectTarget.stats.health === 0) {
              effectTarget.isDefeated = true;
            }
            
            actionLog.targets.push({
              targetId: effectTarget._id.toString(),
              targetName: effectTarget.name,
              damage: damage
            });
            
            actionLog.message = `${actor.name} usa ${itemDetails.name} contra ${effectTarget.name} causando ${damage} de daño.`;
            
            if (effectTarget.isDefeated) {
              actionLog.message += ` ¡${effectTarget.name} ha sido derrotado!`;
            }
          }
        }
        
        // Efectos de maná
        if (effects.mana !== 0) {
          const manaChange = effects.mana;
          
          if (manaChange > 0) {
            // Restauración de maná
            effectTarget.stats.mana = Math.min(
              effectTarget.stats.maxMana,
              effectTarget.stats.mana + manaChange
            );
            
            if (!actionLog.message.includes('recupera')) {
              actionLog.message = `${actor.name} usa ${itemDetails.name} y recupera ${manaChange} puntos de maná a ${effectTarget.name}.`;
            } else {
              actionLog.message += ` También recupera ${manaChange} puntos de maná.`;
            }
          }
        }
        
        // Efectos de estadísticas (buffs temporales)
        const statEffects = [];
        
        if (effects.strength !== 0) {
          effectTarget.stats.strength += effects.strength;
          statEffects.push(`Fuerza ${effects.strength > 0 ? '+' : ''}${effects.strength}`);
          
          // Añadir efecto de estado para revertir después
          effectTarget.statusEffects.push({
            name: `Efecto de ${itemDetails.name} (Fuerza)`,
            type: 'buff',
            remainingTurns: 3, // Duración estándar de 3 turnos
            value: effects.strength,
            targetStat: 'strength',
            appliedBy: actor._id.toString()
          });
        }
        
        if (effects.intelligence !== 0) {
          effectTarget.stats.intelligence += effects.intelligence;
          statEffects.push(`Inteligencia ${effects.intelligence > 0 ? '+' : ''}${effects.intelligence}`);
          
          effectTarget.statusEffects.push({
            name: `Efecto de ${itemDetails.name} (Inteligencia)`,
            type: 'buff',
            remainingTurns: 3,
            value: effects.intelligence,
            targetStat: 'intelligence',
            appliedBy: actor._id.toString()
          });
        }
        
        if (effects.dexterity !== 0) {
          effectTarget.stats.dexterity += effects.dexterity;
          statEffects.push(`Destreza ${effects.dexterity > 0 ? '+' : ''}${effects.dexterity}`);
          
          effectTarget.statusEffects.push({
            name: `Efecto de ${itemDetails.name} (Destreza)`,
            type: 'buff',
            remainingTurns: 3,
            value: effects.dexterity,
            targetStat: 'dexterity',
            appliedBy: actor._id.toString()
          });
        }
        
        if (effects.defense !== 0) {
          effectTarget.stats.defense += effects.defense;
          statEffects.push(`Defensa ${effects.defense > 0 ? '+' : ''}${effects.defense}`);
          
          effectTarget.statusEffects.push({
            name: `Efecto de ${itemDetails.name} (Defensa)`,
            type: 'buff',
            remainingTurns: 3,
            value: effects.defense,
            targetStat: 'defense',
            appliedBy: actor._id.toString()
          });
        }
        
        if (statEffects.length > 0) {
          if (!actionLog.message.includes('recupera')) {
            actionLog.message = `${actor.name} usa ${itemDetails.name} en ${effectTarget.name} aplicando: ${statEffects.join(', ')}.`;
          } else {
            actionLog.message += ` También aplica: ${statEffects.join(', ')}.`;
          }
        }
      }
      
      // Reducir la cantidad del item en el inventario
      inventoryItem.quantity--;
      if (inventoryItem.quantity <= 0) {
        profile.character.inventory = profile.character.inventory.filter(
          item => item.itemId !== action.itemId
        );
      }
      
      // Guardar cambios en el perfil
      await profile.save();
      
      combat.actionLog.push(actionLog);
      await combat.save();
      
      return {
        success: true,
        itemName: itemDetails.name,
        message: actionLog.message,
        targets: actionLog.targets
      };
    } catch (error) {
      console.error('Error al procesar item:', error);
      throw error;
    }
  }
  
  /**
   * Procesar intento de huida
   * @param {Object} combat Objeto de combate
   * @param {Object} actor Participante que realiza la acción
   * @returns {Promise<Object>} Resultado de la acción
   * @private
   */
  static async _processFlee(combat, actor) {
    try {
      // Solo jugadores pueden intentar huir
      if (actor.type !== 'player') {
        throw new Error('Solo los jugadores pueden intentar huir');
      }
      
      // Calcular probabilidad de huida basada en destreza y nivel de enemigos
      let fleeChance = 40 + (actor.stats.dexterity / 2);
      
      // Si hay jefes vivos, reducir la probabilidad
      const bossesAlive = combat.participants.some(p => 
        p.type === 'enemy' && !p.isDefeated && p.enemyType === 'boss'
      );
      
      if (bossesAlive) {
        fleeChance *= 0.5; // Reducir a la mitad contra jefes
      }
      
      // Intentar huir
      const success = Math.random() * 100 < fleeChance;
      
      // Crear registro de acción
      const actionLog = {
        actorId: actor._id.toString(),
        actorType: actor.type,
        actorName: actor.name,
        actionType: 'flee',
        targets: [],
        message: success
          ? `¡${actor.name} ha huido del combate!`
          : `${actor.name} intentó huir, pero no logró escapar.`
      };
      
      combat.actionLog.push(actionLog);
      
      if (success) {
        // Si es éxito, marcar al jugador como derrotado (para excluirlo del combate)
        actor.isDefeated = true;
        
        // Si todos los jugadores han huido, finalizar el combate
        const allPlayersFled = combat.participants.every(p => 
          p.type !== 'player' || p.isDefeated
        );
        
        if (allPlayersFled) {
          combat.status = 'completed';
          combat.result = 'defeat';
          combat.completedAt = Date.now();
        }
      }
      
      await combat.save();
      
      return {
        success,
        message: actionLog.message
      };
    } catch (error) {
      console.error('Error al procesar huida:', error);
      throw error;
    }
  }
  
  /**
   * Procesar acción de defensa
   * @param {Object} combat Objeto de combate
   * @param {Object} actor Participante que realiza la acción
   * @returns {Promise<Object>} Resultado de la acción
   * @private
   */
  static async _processDefend(combat, actor) {
    try {
      // Incrementar temporalmente la defensa en un 50%
      const defenseBonus = Math.floor(actor.stats.defense * 0.5);
      actor.stats.defense += defenseBonus;
      
      // Añadir efecto de estado para revertir en el siguiente turno
      actor.statusEffects.push({
        name: 'Postura Defensiva',
        type: 'buff',
        remainingTurns: 1, // Solo dura hasta el próximo turno
        value: defenseBonus,
        targetStat: 'defense',
        appliedBy: actor._id.toString()
      });
      
      // Crear registro de acción
      const actionLog = {
        actorId: actor._id.toString(),
        actorType: actor.type,
        actorName: actor.name,
        actionType: 'defend',
        targets: [{
          targetId: actor._id.toString(),
          targetName: actor.name
        }],
        message: `${actor.name} adopta una postura defensiva, aumentando su defensa en ${defenseBonus} puntos.`
      };
      
      combat.actionLog.push(actionLog);
      await combat.save();
      
      return {
        success: true,
        defenseBonus,
        message: actionLog.message
      };
    } catch (error) {
      console.error('Error al procesar defensa:', error);
      throw error;
    }
  }
  
  /**
   * Procesar acción automática de enemigo
   * @param {Object} combat Objeto de combate
   * @param {Object} enemy Enemigo que realiza la acción
   * @returns {Promise<Object>} Resultado de la acción
   * @private
   */
  static async _processEnemyAction(combat, enemy) {
    try {
      // Verificar que el enemigo pueda actuar
      if (enemy.isDefeated || enemy.turnState.stunned) {
        // Avanzar turno sin acción
        return { 
          success: false, 
          message: `${enemy.name} no puede actuar en este turno.` 
        };
      }
      
      // 1. Seleccionar acción según el comportamiento del enemigo
      
      // Verificar si hay jugadores vivos como objetivos válidos
      const alivePlayers = combat.participants.filter(p => 
        p.type === 'player' && !p.isDefeated
      );
      
      if (alivePlayers.length === 0) {
        return { 
          success: false, 
          message: 'No hay objetivos válidos para el enemigo.' 
        };
      }
      
      // Si el enemigo tiene poca vida, considerar huir
      if (enemy.stats.health < enemy.stats.maxHealth * 0.2 && enemy.behavior && enemy.behavior.fleeThreshold > 0) {
        const fleeChance = enemy.behavior.fleeThreshold;
        if (Math.random() * 100 < fleeChance) {
          // El enemigo huye
          enemy.isDefeated = true;
          
          const actionLog = {
            actorId: enemy._id.toString(),
            actorType: 'enemy',
            actorName: enemy.name,
            actionType: 'flee',
            targets: [],
            message: `¡${enemy.name} ha huido del combate!`
          };
          
          combat.actionLog.push(actionLog);
          await combat.save();
          
          return {
            success: true,
            action: 'flee',
            message: actionLog.message
          };
        }
      }
      
      // 2. Seleccionar un objetivo (priorizar jugadores con poca vida si es inteligente)
      let target;
      
      if (enemy.behavior && enemy.behavior.prioritizeWeakTargets) {
        // Priorizar objetivos débiles
        alivePlayers.sort((a, b) => 
          (a.stats.health / a.stats.maxHealth) - (b.stats.health / b.stats.maxHealth)
        );
        target = alivePlayers[0];
      } else {
        // Selección aleatoria
        const randomIndex = Math.floor(Math.random() * alivePlayers.length);
        target = alivePlayers[randomIndex];
      }
      
      // 3. Determinar si usar un ataque especial o ataque básico
      
      // Filtrar ataques disponibles (no en cooldown)
      const availableAttacks = enemy.attacks.filter(a => a.currentCooldown === 0);
      
      if (availableAttacks.length === 0) {
        // Si no hay ataques disponibles, usar ataque básico genérico
        return await this._processEnemyBasicAttack(combat, enemy, target);
      }
      
      // Calcular qué ataque usar según probabilidad
      const attackRolls = availableAttacks.map(attack => ({
        attack,
        roll: Math.random() * attack.useChance
      }));
      
      attackRolls.sort((a, b) => b.roll - a.roll);
      const selectedAttack = attackRolls[0].attack;
      
      // 4. Ejecutar el ataque
      return await this._processEnemySpecialAttack(combat, enemy, target, selectedAttack);
      
    } catch (error) {
      console.error('Error al procesar acción de enemigo:', error);
      return { 
        success: false, 
        message: 'Error al procesar acción del enemigo.' 
      };
    }
  }
  
  /**
   * Procesar ataque básico de enemigo
   * @param {Object} combat Objeto de combate
   * @param {Object} enemy Enemigo que realiza la acción
   * @param {Object} target Objetivo del ataque
   * @returns {Promise<Object>} Resultado de la acción
   * @private
   */
  static async _processEnemyBasicAttack(combat, enemy, target) {
    try {
      // Calcular daño base
      let baseDamage = enemy.stats.strength;
      
      // Calcular si evade
      const evasionChance = Math.min(30, Math.max(5, target.stats.dexterity - enemy.stats.dexterity + 10));
      const evaded = Math.random() * 100 < evasionChance;
      
      if (evaded) {
        // El objetivo evadió el ataque
        const actionLog = {
          actorId: enemy._id.toString(),
          actorType: 'enemy',
          actorName: enemy.name,
          actionType: 'attack',
          details: {
            attackName: 'Ataque'
          },
          targets: [{
            targetId: target._id.toString(),
            targetName: target.name,
            damage: 0,
            wasEvaded: true
          }],
          message: `${target.name} evadió el ataque de ${enemy.name}.`
        };
        
        combat.actionLog.push(actionLog);
        await combat.save();
        
        return { 
          success: true, 
          action: 'attack',
          evaded: true, 
          message: actionLog.message 
        };
      }
      
      // Calcular si es crítico
      const critChance = Math.min(15, Math.max(5, enemy.stats.dexterity / 5 + 5));
      const isCritical = Math.random() * 100 < critChance;
      
      // Calcular daño
      let damage = baseDamage;
      if (isCritical) {
        damage = Math.floor(damage * 1.5);
      }
      
      // Aplicar reducción por defensa
      const damageReduction = Math.min(75, Math.max(0, target.stats.defense / 2));
      damage = Math.max(1, Math.floor(damage * (1 - damageReduction / 100)));
      
      // Aplicar daño
      target.stats.health = Math.max(0, target.stats.health - damage);
      
      // Verificar si el objetivo fue derrotado
      if (target.stats.health === 0) {
        target.isDefeated = true;
      }
      
      // Crear registro de acción
      const actionLog = {
        actorId: enemy._id.toString(),
        actorType: 'enemy',
        actorName: enemy.name,
        actionType: 'attack',
        details: {
          attackName: 'Ataque'
        },
        targets: [{
          targetId: target._id.toString(),
          targetName: target.name,
          damage: damage,
          wasCritical: isCritical,
          wasEvaded: false
        }],
        message: isCritical
          ? `¡${enemy.name} asesta un golpe crítico a ${target.name} causando ${damage} de daño!`
          : `${enemy.name} ataca a ${target.name} causando ${damage} de daño.`
      };
      
      if (target.isDefeated) {
        actionLog.message += ` ¡${target.name} ha sido derrotado!`;
      }
      
      combat.actionLog.push(actionLog);
      await combat.save();
      
      return {
        success: true,
        action: 'attack',
        damage,
        critical: isCritical,
        defeated: target.isDefeated,
        message: actionLog.message
      };
    } catch (error) {
      console.error('Error al procesar ataque básico de enemigo:', error);
      throw error;
    }
  }
  
  /**
   * Procesar ataque especial de enemigo
   * @param {Object} combat Objeto de combate
   * @param {Object} enemy Enemigo que realiza la acción
   * @param {Object} target Objetivo del ataque
   * @param {Object} attack Datos del ataque a realizar
   * @returns {Promise<Object>} Resultado de la acción
   * @private
   */
  static async _processEnemySpecialAttack(combat, enemy, target, attack) {
    try {
      // Verificar si hay suficiente maná
      if (enemy.stats.mana < attack.manaCost) {
        // No hay suficiente maná, usar ataque básico
        return await this._processEnemyBasicAttack(combat, enemy, target);
      }
      
      // Reducir maná
      if (attack.manaCost > 0) {
        enemy.stats.mana -= attack.manaCost;
      }
      
      // Aplicar cooldown
      attack.currentCooldown = attack.cooldown;
      
      // Calcular daño base
      let baseDamage = attack.baseDamage;
      
      // Ajustar según estadística de escalado
      if (attack.scaling && attack.scaling.stat) {
        const scalingStat = enemy.stats[attack.scaling.stat] || 0;
        baseDamage += Math.floor(scalingStat * attack.scaling.multiplier);
      }
      
      // Calcular si evade
      const evasionChance = Math.min(20, Math.max(5, target.stats.dexterity - enemy.stats.dexterity + 10));
      const evaded = Math.random() * 100 < evasionChance;
      
      if (evaded) {
        // El objetivo evadió el ataque
        const actionLog = {
          actorId: enemy._id.toString(),
          actorType: 'enemy',
          actorName: enemy.name,
          actionType: 'attack',
          details: {
            attackName: attack.name
          },
          targets: [{
            targetId: target._id.toString(),
            targetName: target.name,
            damage: 0,
            wasEvaded: true
          }],
          message: `${enemy.name} usa ${attack.name}, pero ${target.name} lo evade.`
        };
        
        combat.actionLog.push(actionLog);
        await combat.save();
        
        return { 
          success: true, 
          action: 'special',
          evaded: true,
          attackName: attack.name,
          message: actionLog.message 
        };
      }
      
      // Calcular daño
      let damage = baseDamage;
      
      // Aplicar reducción por defensa (solo para daño físico)
      if (attack.damageType === 'physical') {
        const damageReduction = Math.min(75, Math.max(0, target.stats.defense / 2));
        damage = Math.max(1, Math.floor(damage * (1 - damageReduction / 100)));
      }
      
      // Aplicar daño
      target.stats.health = Math.max(0, target.stats.health - damage);
      
      // Crear registro de acción
      const actionLog = {
        actorId: enemy._id.toString(),
        actorType: 'enemy',
        actorName: enemy.name,
        actionType: 'attack',
        details: {
          attackName: attack.name
        },
        targets: [{
          targetId: target._id.toString(),
          targetName: target.name,
          damage: damage,
          wasEvaded: false
        }],
        message: `${enemy.name} usa ${attack.name} contra ${target.name} causando ${damage} de daño.`
      };
      
      // Verificar si el ataque aplica efectos adicionales
      if (attack.effects && attack.effects.length > 0) {
        for (const effect of attack.effects) {
          // Verificar probabilidad de aplicar el efecto
          if (Math.random() * 100 > effect.chance) continue;
          
          switch (effect.type) {
            case 'stun':
              // Aplicar aturdimiento
              target.turnState.stunned = true;
              target.statusEffects.push({
                name: 'Aturdido',
                type: 'debuff',
                remainingTurns: effect.duration || 1,
                appliedBy: enemy._id.toString()
              });
              actionLog.message += ` ${target.name} ha sido aturdido por ${effect.duration || 1} turno(s).`;
              break;
              
            case 'poison':
            case 'burn':
            case 'bleed':
              // Aplicar efecto de daño por turno
              target.statusEffects.push({
                name: effect.type === 'poison' ? 'Envenenado' : 
                     (effect.type === 'burn' ? 'Quemado' : 'Sangrando'),
                type: 'damage_over_time',
                remainingTurns: effect.duration || 3,
                value: effect.value || Math.ceil(damage * 0.2), // 20% del daño por defecto
                appliedBy: enemy._id.toString()
              });
              actionLog.message += ` ${target.name} sufre ${
                effect.type === 'poison' ? 'envenenamiento' : 
                (effect.type === 'burn' ? 'quemaduras' : 'sangrado')
              } durante ${effect.duration || 3} turno(s).`;
              break;
              
            case 'debuff':
              // Aplicar debuff a estadística
              if (effect.targetStat) {
                const statValue = target.stats[effect.targetStat] || 0;
                const reduction = effect.value || Math.ceil(statValue * 0.2); // 20% de reducción por defecto
                
                target.stats[effect.targetStat] = Math.max(1, statValue - reduction);
                
                target.statusEffects.push({
                  name: `Debilitación (${effect.targetStat})`,
                  type: 'debuff',
                  remainingTurns: effect.duration || 2,
                  value: reduction,
                  targetStat: effect.targetStat,
                  appliedBy: enemy._id.toString()
                });
                
                actionLog.message += ` ${target.name} sufre una reducción de ${reduction} en ${effect.targetStat} durante ${effect.duration || 2} turno(s).`;
              }
              break;
          }
        }
      }
      
      // Verificar si el objetivo fue derrotado
      if (target.stats.health === 0) {
        target.isDefeated = true;
        actionLog.message += ` ¡${target.name} ha sido derrotado!`;
      }
      
      combat.actionLog.push(actionLog);
      await combat.save();
      
      return {
        success: true,
        action: 'special',
        attackName: attack.name,
        damage,
        defeated: target.isDefeated,
        message: actionLog.message
      };
    } catch (error) {
      console.error('Error al procesar ataque especial de enemigo:', error);
      throw error;
    }
  }
  
  /**
   * Verificar si el combate ha terminado
   * @param {Object} combat Objeto de combate
   * @returns {String|null} Resultado del combate ('victory', 'defeat') o null si continúa
   * @private
   */
  static _checkCombatEnd(combat) {
    // Verificar si todos los jugadores están derrotados
    const allPlayersDefeated = combat.participants.every(p => 
      p.type !== 'player' || p.isDefeated
    );
    
    if (allPlayersDefeated) {
      return 'defeat';
    }
    
    // Verificar si todos los enemigos están derrotados
    const allEnemiesDefeated = combat.participants.every(p => 
      p.type !== 'enemy' || p.isDefeated
    );
    
    if (allEnemiesDefeated) {
      return 'victory';
    }
    
    // El combate continúa
    return null;
  }
  
  /**
   * Avanzar al siguiente turno
   * @param {Object} combat Objeto de combate
   * @private
   */
  static async _advanceToNextTurn(combat) {
    // Incrementar contador de turnos si hemos completado una ronda
    const currentIndex = combat.turnOrder.indexOf(combat.currentParticipantId);
    if (currentIndex === combat.turnOrder.length - 1) {
      combat.currentTurn++;
      
      // Procesar efectos por turno para todos los participantes
      await this._processEndOfRoundEffects(combat);
    }
    
    // Encontrar el siguiente participante vivo en el orden de turnos
    let nextIndex = (currentIndex + 1) % combat.turnOrder.length;
    let iterations = 0;
    const maxIterations = combat.turnOrder.length * 2; // Prevenir bucles infinitos
    
    while (iterations < maxIterations) {
      const nextParticipantId = combat.turnOrder[nextIndex];
      const nextParticipant = combat.participants.find(p => 
        p._id.toString() === nextParticipantId
      );
      
      if (nextParticipant && !nextParticipant.isDefeated) {
        // Encontrado el siguiente participante vivo
        combat.currentParticipantId = nextParticipantId;
        
        // Restablecer estado de turno
        nextParticipant.turnState = {
          hasActed: false,
          hasMoved: false,
          stunned: nextParticipant.statusEffects.some(e => e.name === 'Aturdido'),
          canAct: !nextParticipant.statusEffects.some(e => e.name === 'Aturdido')
        };
        
        // Reducir cooldowns de habilidades y ataques
        if (nextParticipant.skills) {
          nextParticipant.skills.forEach(skill => {
            if (skill.currentCooldown > 0) {
              skill.currentCooldown--;
            }
          });
        }
        
        if (nextParticipant.attacks) {
          nextParticipant.attacks.forEach(attack => {
            if (attack.currentCooldown > 0) {
              attack.currentCooldown--;
            }
          });
        }
        
        break;
      }
      
      // Avanzar al siguiente en el orden
      nextIndex = (nextIndex + 1) % combat.turnOrder.length;
      iterations++;
    }
    
    // Guardar cambios
    await combat.save();
  }
  
  /**
   * Procesar efectos al final de la ronda
   * @param {Object} combat Objeto de combate
   * @private
   */
  static async _processEndOfRoundEffects(combat) {
    const actionLogs = [];
    
    // Procesar cada participante
    for (const participant of combat.participants) {
      if (participant.isDefeated) continue;
      
      // Procesar efectos de estado
      const expiredEffects = [];
      let effectsMessage = '';
      
      for (let i = 0; i < participant.statusEffects.length; i++) {
        const effect = participant.statusEffects[i];
        
        // Reducir duración del efecto
        effect.remainingTurns--;
        
        if (effect.remainingTurns <= 0) {
          // El efecto expira
          expiredEffects.push(i);
          
          // Revertir efectos de estadísticas si es necesario
          if (effect.targetStat && (effect.type === 'buff' || effect.type === 'debuff')) {
            participant.stats[effect.targetStat] += effect.type === 'debuff' ? effect.value : -effect.value;
            effectsMessage += `${effect.name} ha expirado. `;
          }
        } else {
          // Aplicar efecto por turno
          if (effect.type === 'damage_over_time') {
            const damageValue = effect.value || 1;
            participant.stats.health = Math.max(0, participant.stats.health - damageValue);
            
            effectsMessage += `${participant.name} sufre ${damageValue} de daño por ${effect.name}. `;
            
            // Verificar si fue derrotado por el efecto
            if (participant.stats.health === 0) {
              participant.isDefeated = true;
              effectsMessage += `¡${participant.name} ha sido derrotado! `;
              break;
            }
          }
        }
      }
      
      // Eliminar efectos expirados (de atrás hacia adelante para no afectar índices)
      for (let i = expiredEffects.length - 1; i >= 0; i--) {
        participant.statusEffects.splice(expiredEffects[i], 1);
      }
      
      // Registrar efectos en el log si hubo alguno
      if (effectsMessage) {
        actionLogs.push({
          actorId: participant._id.toString(),
          actorType: participant.type,
          actorName: participant.name,
          actionType: 'status_effect',
          details: {
            statusEffect: 'multiple'
          },
          targets: [{
            targetId: participant._id.toString(),
            targetName: participant.name
          }],
          message: effectsMessage
        });
      }
    }
    
    // Añadir logs de efectos
    if (actionLogs.length > 0) {
      combat.actionLog.push(...actionLogs);
    }
  }
  
  /**
   * Procesar victoria en combate
   * @param {Object} combat Objeto de combate
   * @private
   */
  static async _processCombatVictory(combat) {
    try {
      // Calcular recompensas
      const rewards = {
        experience: 0,
        currency: 0,
        items: []
      };
      
      // Obtener enemigos derrotados
      const defeatedEnemies = combat.participants.filter(p => 
        p.type === 'enemy' && p.isDefeated
      );
      
      // Buscar información completa de los enemigos
      const enemyIds = defeatedEnemies.map(e => e.enemyId).filter(id => id);
      const enemies = await Enemy.find({ _id: { $in: enemyIds } });
      
      // Calcular recompensas base
      for (const defeatedEnemy of defeatedEnemies) {
        const enemyData = enemies.find(e => e._id.toString() === defeatedEnemy.enemyId);
        
        if (enemyData && enemyData.drops) {
          // Experiencia y monedas
          rewards.experience += enemyData.drops.experience || 0;
          rewards.currency += enemyData.drops.currency || 0;
          
          // Items (según probabilidad)
          if (enemyData.drops.items && enemyData.drops.items.length > 0) {
            for (const drop of enemyData.drops.items) {
              // Calcular si el item cae
              if (Math.random() * 100 < drop.dropChance) {
                // Verificar si ya tenemos este item en las recompensas
                const existingItem = rewards.items.find(i => i.itemId === drop.itemId);
                
                if (existingItem) {
                  existingItem.quantity += drop.quantity;
                } else {
                  // Obtener nombre del item
                  const item = await Item.findById(drop.itemId);
                  
                  rewards.items.push({
                    itemId: drop.itemId,
                    name: item ? item.name : 'Item desconocido',
                    quantity: drop.quantity
                  });
                }
              }
            }
          }
        }
      }
      
      // Aplicar multiplicadores de dificultad
      const difficultyMultipliers = {
        easy: 0.8,
        medium: 1.0,
        hard: 1.5,
        extreme: 2.0
      };
      
      const multiplier = difficultyMultipliers[combat.difficulty] || 1.0;
      rewards.experience = Math.floor(rewards.experience * multiplier);
      rewards.currency = Math.floor(rewards.currency * multiplier);
      
      // Guardar recompensas en el combate
      combat.rewards = rewards;
      combat.status = 'completed';
      combat.result = 'victory';
      combat.completedAt = Date.now();
      
      // Mensaje final de victoria
      const victoryMessage = {
        actionType: 'system',
        message: `¡Victoria! Has ganado ${rewards.experience} puntos de experiencia y ${rewards.currency} monedas.`
      };
      
      if (rewards.items.length > 0) {
        victoryMessage.message += ` También has obtenido: ${rewards.items.map(i => `${i.name} x${i.quantity}`).join(', ')}.`;
      }
      
      combat.actionLog.push(victoryMessage);
      
      // Aplicar recompensas a los jugadores participantes
      const alivePlayers = combat.participants.filter(p =>
        p.type === 'player' && !p.isDefeated
      );
      
      // Dividir experiencia y monedas entre los jugadores
      const playerCount = alivePlayers.length;
      const expPerPlayer = Math.ceil(rewards.experience / playerCount);
      const currencyPerPlayer = Math.ceil(rewards.currency / playerCount);
      
      // Actualizar perfiles de jugadores
      for (const player of alivePlayers) {
        const profile = await Profile.findOne({
          userId: player.userId,
          serverId: combat.serverId
        });
        
        if (!profile) continue;
        
        // Añadir experiencia
        profile.character.experience += expPerPlayer;
        
        // Verificar si sube de nivel
        const levelUpThreshold = profile.character.level * 100; // Fórmula simple para nivelación
        if (profile.character.experience >= levelUpThreshold) {
          profile.character.level += 1;
          profile.character.experience -= levelUpThreshold;
          
          // Actualizar estadísticas por nivel
          profile.character.stats.strength += 2;
          profile.character.stats.intelligence += 2;
          profile.character.stats.dexterity += 2;
          profile.character.stats.defense += 2;
          
          // Aumentar máximos de salud y maná
          profile.character.health.max += 10;
          profile.character.health.current = profile.character.health.max;
          profile.character.mana.max += 5;
          profile.character.mana.current = profile.character.mana.max;
          
          // Registrar actividad de subida de nivel
          await Activity.logActivity({
            userId: profile.userId,
            serverId: combat.serverId,
            serverName: 'Servidor', // Obtener nombre real del servidor
            type: 'levelup',
            action: 'level_up',
            details: {
              oldLevel: profile.character.level - 1,
              newLevel: profile.character.level,
              combatId: combat._id.toString()
            },
            character: {
              name: profile.character.name,
              level: profile.character.level
            }
          });
        }
        
        // Añadir monedas
        profile.character.currency += currencyPerPlayer;
        
        // Añadir items (cada jugador recibe todos los items)
        for (const item of rewards.items) {
          // Verificar si ya tiene el item
          const existingItem = profile.character.inventory.find(i => i.itemId === item.itemId);
          
          if (existingItem) {
            existingItem.quantity += item.quantity;
          } else {
            profile.character.inventory.push({
              itemId: item.itemId,
              quantity: item.quantity,
              equipped: false,
              acquiredAt: new Date()
            });
          }
          
          // Actualizar estadísticas
          profile.stats.itemsAcquired += item.quantity;
        }
        
        // Actualizar estadísticas del perfil
        profile.stats.wins += 1;
        profile.stats.totalCurrencyEarned += currencyPerPlayer;
        profile.stats.totalExperienceEarned += expPerPlayer;
        
        // Si el combate está relacionado con una misión, actualizar progreso
        if (combat.missionId) {
          const missionIndex = profile.progress.activeMissions.findIndex(
            m => m.missionId === combat.missionId
          );
          
          if (missionIndex !== -1) {
            // Actualizar progreso de la misión
            const mission = profile.progress.activeMissions[missionIndex];
            mission.progress += 25; // Incrementar progreso en un 25%
            
            if (mission.progress >= 100) {
              mission.completed = true;
            }
          }
        }
        
        // Guardar cambios en el perfil
        await profile.save();
        
        // Registrar actividad de combate
        await Activity.logActivity({
          userId: profile.userId,
          serverId: combat.serverId,
          serverName: 'Servidor', // Obtener nombre real del servidor
          type: 'combat',
          action: 'win_combat',
          details: {
            combatId: combat._id.toString(),
            combatType: combat.type,
            enemyCount: defeatedEnemies.length
          },
          character: {
            name: profile.character.name,
            level: profile.character.level
          },
          rewards: [
            { type: 'exp', name: 'Experiencia', value: expPerPlayer },
            { type: 'currency', name: 'Monedas', value: currencyPerPlayer },
            ...rewards.items.map(item => ({
              type: 'item',
              name: item.name,
              value: item.itemId,
              quantity: item.quantity
            }))
          ]
        });
      }
      
      await combat.save();
      return rewards;
    } catch (error) {
      console.error('Error al procesar victoria en combate:', error);
      throw error;
    }
  }
  
  /**
   * Procesar derrota en combate
   * @param {Object} combat Objeto de combate
   * @private
   */
  static async _processCombatDefeat(combat) {
    try {
      // Actualizar estado del combate
      combat.status = 'completed';
      combat.result = 'defeat';
      combat.completedAt = Date.now();
      
      // Mensaje final de derrota
      const defeatMessage = {
        actionType: 'system',
        message: '¡Derrota! Todos los jugadores han sido derrotados.'
      };
      
      combat.actionLog.push(defeatMessage);
      
      // Obtener jugadores participantes
      const players = combat.participants.filter(p => p.type === 'player');
      
      // Actualizar perfiles de jugadores
      for (const player of players) {
        const profile = await Profile.findOne({
          userId: player.userId,
          serverId: combat.serverId
        });
        
        if (!profile) continue;
        
        // Actualizar estadísticas del perfil
        profile.stats.losses += 1;
        
        // Recuperar algo de salud y maná (50%)
        profile.character.health.current = Math.max(
          Math.floor(profile.character.health.max * 0.5),
          profile.character.health.current
        );
        
        profile.character.mana.current = Math.max(
          Math.floor(profile.character.mana.max * 0.5),
          profile.character.mana.current
        );
        
        // Si el combate está relacionado con una misión, actualizar intentos
        if (combat.missionId) {
          const missionIndex = profile.progress.activeMissions.findIndex(
            m => m.missionId === combat.missionId
          );
          
          if (missionIndex !== -1) {
            profile.progress.activeMissions[missionIndex].currentStage = 0;
          }
        }
        
        // Guardar cambios en el perfil
        await profile.save();
        
        // Registrar actividad de combate
        await Activity.logActivity({
          userId: profile.userId,
          serverId: combat.serverId,
          serverName: 'Servidor', // Obtener nombre real del servidor
          type: 'combat',
          action: 'lose_combat',
          details: {
            combatId: combat._id.toString(),
            combatType: combat.type
          },
          character: {
            name: profile.character.name,
            level: profile.character.level
          },
          success: false
        });
      }
      
      await combat.save();
    } catch (error) {
      console.error('Error al procesar derrota en combate:', error);
      throw error;
    }
  }
  
  /**
   * Obtener información del combate formateada para su visualización
   * @param {String} combatId ID del combate
   * @returns {Promise<Object>} Datos del combate formateados
   */
  static async getCombatDisplay(combatId) {
    try {
      const combat = await Combat.findById(combatId);
      if (!combat) {
        throw new Error('Combate no encontrado');
      }
      
      // Organizar participantes por equipo
      const players = combat.participants
        .filter(p => p.type === 'player')
        .map(p => ({
          id: p._id.toString(),
          name: p.name,
          type: 'player',
          health: `${p.stats.health}/${p.stats.maxHealth}`,
          healthPercent: Math.round((p.stats.health / p.stats.maxHealth) * 100),
          mana: `${p.stats.mana}/${p.stats.maxMana}`,
          manaPercent: Math.round((p.stats.mana / p.stats.maxMana) * 100),
          status: p.isDefeated ? 'Derrotado' : 
                 (p.turnState && p.turnState.stunned ? 'Aturdido' : 'Activo'),
          isCurrentTurn: p._id.toString() === combat.currentParticipantId,
          avatar: p.avatar || null,
          statusEffects: p.statusEffects.map(e => e.name)
        }));
      
      const enemies = combat.participants
        .filter(p => p.type === 'enemy')
        .map(p => ({
          id: p._id.toString(),
          name: p.duplicateNumber > 0 ? `${p.name} ${p.duplicateNumber}` : p.name,
          type: 'enemy',
          health: `${p.stats.health}/${p.stats.maxHealth}`,
          healthPercent: Math.round((p.stats.health / p.stats.maxHealth) * 100),
          status: p.isDefeated ? 'Derrotado' : 
                 (p.turnState && p.turnState.stunned ? 'Aturdido' : 'Activo'),
          isCurrentTurn: p._id.toString() === combat.currentParticipantId,
          avatar: p.avatar || null,
          statusEffects: p.statusEffects.map(e => e.name)
        }));
      
      // Obtener últimas acciones del log (máximo 5)
      const recentActions = combat.actionLog.slice(-5).map(log => ({
        message: log.message,
        turn: log.turn || 0,
        timestamp: log.timestamp
      }));
      
      // Verificar estado del combate
      const isActive = combat.status === 'active';
      const currentTurn = combat.currentTurn;
      
      // Obtener participante con turno actual
      const currentParticipant = combat.participants.find(
        p => p._id.toString() === combat.currentParticipantId
      );
      
      const currentTurnInfo = currentParticipant ? {
        name: currentParticipant.name,
        type: currentParticipant.type,
        id: currentParticipant._id.toString()
      } : null;
      
      // Resultado y recompensas si el combate ha terminado
      let result = null;
      if (combat.status === 'completed') {
        result = {
          outcome: combat.result,
          rewards: combat.rewards,
          message: combat.result === 'victory' ? 
            '¡Victoria! Has ganado el combate.' : 
            'Derrota. Todos los jugadores han sido derrotados.'
        };
      }
      
      return {
        id: combat._id.toString(),
        status: combat.status,
        type: combat.type,
        difficulty: combat.difficulty,
        currentTurn,
        currentTurnInfo,
        players,
        enemies,
        recentActions,
        isActive,
        result,
        missionId: combat.missionId
      };
    } catch (error) {
      console.error('Error al obtener visualización del combate:', error);
      throw error;
    }
  }
  
  /**
   * Crear embed para mostrar el estado del combate
   * @param {Object} combatDisplay Datos del combate formateados
   * @returns {EmbedBuilder} Embed para Discord
   */
  static createCombatEmbed(combatDisplay) {
    // Determinar color según estado
    let color;
    switch (combatDisplay.status) {
      case 'active':
        color = 0x3498db; // Azul
        break;
      case 'completed':
        color = combatDisplay.result.outcome === 'victory' ? 0x2ecc71 : 0xe74c3c; // Verde o rojo
        break;
      default:
        color = 0x95a5a6; // Gris
    }
    
    // Crear embed base
    const embed = new EmbedBuilder()
      .setTitle(`Combate ${combatDisplay.type.toUpperCase()} - Turno ${combatDisplay.currentTurn}`)
      .setColor(color)
      .setDescription(`Dificultad: ${combatDisplay.difficulty}`);
    
    // Jugadores
    let playersField = '';
    combatDisplay.players.forEach(player => {
      const healthBar = this._createProgressBar(player.healthPercent, 10, '❤️');
      const statusText = player.statusEffects.length > 0 ? 
        ` [${player.statusEffects.join(', ')}]` : '';
      
      playersField += `${player.isCurrentTurn ? '➡️ ' : ''}**${player.name}** (${player.status}${statusText})\n`;
      playersField += `Salud: ${player.health} ${healthBar}\n`;
      
      if (player.mana) {
        const manaBar = this._createProgressBar(player.manaPercent, 10, '🔮');
        playersField += `Maná: ${player.mana} ${manaBar}\n`;
      }
      
      playersField += '\n';
    });
    
    // Enemigos
    let enemiesField = '';
    combatDisplay.enemies.forEach(enemy => {
      const healthBar = this._createProgressBar(enemy.healthPercent, 10, '❤️');
      const statusText = enemy.statusEffects.length > 0 ? 
        ` [${enemy.statusEffects.join(', ')}]` : '';
      
      enemiesField += `${enemy.isCurrentTurn ? '➡️ ' : ''}**${enemy.name}** (${enemy.status}${statusText})\n`;
      enemiesField += `Salud: ${enemy.health} ${healthBar}\n\n`;
    });
    
    // Historial reciente de acciones
    let actionsField = '';
    if (combatDisplay.recentActions.length > 0) {
      combatDisplay.recentActions.forEach(action => {
        actionsField += `• ${action.message}\n`;
      });
    } else {
      actionsField = 'No hay acciones registradas.';
    }
    
    // Añadir campos
    embed.addFields(
      { name: '👥 Jugadores', value: playersField || 'Ninguno', inline: false },
      { name: '👹 Enemigos', value: enemiesField || 'Ninguno', inline: false },
      { name: '📜 Acciones Recientes', value: actionsField, inline: false }
    );
    
    // Si el combate ha terminado, añadir resultado
    if (combatDisplay.status === 'completed' && combatDisplay.result) {
      let rewardsText = '';
      
      if (combatDisplay.result.rewards) {
        const rewards = combatDisplay.result.rewards;
        rewardsText = `Experiencia: ${rewards.experience}\nMonedas: ${rewards.currency}`;
        
        if (rewards.items && rewards.items.length > 0) {
          rewardsText += `\nItems: ${rewards.items.map(i => `${i.name} x${i.quantity}`).join(', ')}`;
        }
      }
      
      embed.addFields(
        { name: '🏆 Resultado', value: combatDisplay.result.message, inline: false }
      );
      
      if (rewardsText) {
        embed.addFields(
          { name: '💰 Recompensas', value: rewardsText, inline: false }
        );
      }
    }
    
    return embed;
  }
  
  /**
   * Crear botones para acciones de combate
   * @param {Object} combatDisplay Datos del combate formateados
   * @param {String} userId ID del usuario actual
   * @returns {ActionRowBuilder[]} Filas de botones para Discord
   */
  static createCombatButtons(combatDisplay, userId) {
    const rows = [];
    
    // Solo mostrar botones si el combate está activo
    if (!combatDisplay.isActive) {
      return rows;
    }
    
    // Verificar si es el turno de un jugador
    const currentPlayer = combatDisplay.players.find(p => 
      p.isCurrentTurn && !p.isDefeated
    );
    
    // Solo mostrar botones si es el turno de un jugador y el usuario actual
    if (!currentPlayer || currentPlayer.userId !== userId) {
      return rows;
    }
    
    // Botones de acción principal
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`combat:attack:${combatDisplay.id}`)
          .setLabel('Atacar')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`combat:skill:${combatDisplay.id}`)
          .setLabel('Habilidades')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`combat:item:${combatDisplay.id}`)
          .setLabel('Usar Item')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`combat:defend:${combatDisplay.id}`)
          .setLabel('Defender')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`combat:flee:${combatDisplay.id}`)
          .setLabel('Huir')
          .setStyle(ButtonStyle.Secondary)
      );
    
    rows.push(actionRow);
    
    // Si hay enemigos vivos, crear botones para seleccionar objetivos
    const aliveEnemies = combatDisplay.enemies.filter(e => e.status !== 'Derrotado');
    
    if (aliveEnemies.length > 0 && aliveEnemies.length <= 5) {
      const targetRow = new ActionRowBuilder();
      
      aliveEnemies.forEach(enemy => {
        targetRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`combat:target:${combatDisplay.id}:${enemy.id}`)
            .setLabel(`Objetivo: ${enemy.name}`)
            .setStyle(ButtonStyle.Secondary)
        );
      });
      
      rows.push(targetRow);
    }
    
    return rows;
  }
  
  /**
   * Crear una barra de progreso con emojis
   * @param {Number} percent Porcentaje (0-100)
   * @param {Number} length Longitud de la barra
   * @param {String} emoji Emoji a usar (opcional)
   * @returns {String} Barra de progreso
   * @private
   */
  static _createProgressBar(percent, length = 10, emoji = '■') {
    const filledCount = Math.round((percent / 100) * length);
    const emptyCount = length - filledCount;
    
    return emoji.repeat(filledCount) + '□'.repeat(emptyCount);
  }
}

module.exports = CombatService;