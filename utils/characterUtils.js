const Profile = require('../models/Profile');
const Item = require('../models/Items');
const Skill = require('../models/Skill');
const { Mission, Adventure } = require('../models/Missions');
const profileUtils = require('./profileUtils');
const Server = require('../models/Server');

const characterUtils = {

  async addXP(userId, serverId, amount) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Guardar nivel actual para comparar después
      const oldLevel = profile.character.level;
      
      // Añadir experiencia
      profile.character.experience += amount;
      
      // Calcular si sube de nivel
      const newLevel = this.calculateLevel(profile.character.experience);
      profile.character.level = newLevel;
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        oldLevel,
        newLevel,
        levelUp: newLevel > oldLevel,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al añadir experiencia:', error);
      return { success: false, error: error.message };
    }
  },
  
  calculateLevel(experience) {
    // Fórmula de nivel: cada nivel requiere un 20% más de experiencia que el anterior
    let expRequired = 100;
    let currentLevel = 1;
    let remainingExp = experience;
    
    while (remainingExp >= expRequired) {
      remainingExp -= expRequired;
      currentLevel++;
      expRequired = Math.floor(expRequired * 1.2);
    }
    
    return currentLevel;
  },

  async setLevel(userId, serverId, level) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Guardar nivel actual para comparar después
      const oldLevel = profile.character.level;
      
      // Establecer nuevo nivel
      profile.character.level = level;
      
      // Calcular la experiencia necesaria para este nivel
      let totalExp = 0;
      let expForLevel = 100;
      
      for (let i = 1; i < level; i++) {
        totalExp += expForLevel;
        expForLevel = Math.floor(expForLevel * 1.2);
      }
      
      // Establecer la experiencia
      profile.character.experience = totalExp;
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        oldLevel,
        newLevel: level,
        levelUp: level > oldLevel,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al establecer nivel:', error);
      return { success: false, error: error.message };
    }
  },

  async addCurrency(userId, serverId, amount) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Añadir monedas
      profile.character.currency += amount;
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        oldAmount: profile.character.currency - amount,
        newAmount: profile.character.currency,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al añadir monedas:', error);
      return { success: false, error: error.message };
    }
  },

  async removeCurrency(userId, serverId, amount) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Verificar si tiene suficientes monedas
      if (profile.character.currency < amount) {
        return {
          success: false,
          error: 'Monedas insuficientes',
          character: profile.character
        };
      }
      
      // Quitar monedas
      profile.character.currency -= amount;
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        oldAmount: profile.character.currency + amount,
        newAmount: profile.character.currency,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al quitar monedas:', error);
      return { success: false, error: error.message };
    }
  },

  async modifyHealth(userId, serverId, amount) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Guardar salud actual para comparar después
      const oldHealth = profile.character.health.current;
      
      // Modificar salud
      profile.character.health.current += amount;
      
      // Asegurar que no exceda los límites
      if (profile.character.health.current > profile.character.health.max) {
        profile.character.health.current = profile.character.health.max;
      }
      
      if (profile.character.health.current < 0) {
        profile.character.health.current = 0;
      }
      
      // Verificar si el personaje ha muerto
      const isDead = profile.character.health.current === 0;
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        oldHealth,
        newHealth: profile.character.health.current,
        isDead,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al modificar salud:', error);
      return { success: false, error: error.message };
    }
  },

  async killCharacter(userId, serverId, deathData = {}) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Guardar salud actual para comparar después
      const oldHealth = profile.character.health.current;
      
      // Establecer salud a 0
      profile.character.health.current = 0;
      
      // Incrementar contador de muertes
      if (!profile.stats.deaths) {
        profile.stats.deaths = 0;
      }
      profile.stats.deaths += 1;
      
      // Registrar información sobre la muerte
      if (!profile.progress.deathHistory) {
        profile.progress.deathHistory = [];
      }
      
      profile.progress.deathHistory.push({
        timestamp: new Date(),
        reason: deathData.reason || 'Desconocida',
        location: deathData.location,
        killedBy: deathData.killedBy,
        lostItems: deathData.lostItems || []
      });
      
      // Aplicar penalizaciones por muerte si están configuradas
      if (deathData.applyPenalties) {
        // Aquí se pueden implementar penalizaciones como:
        // - Pérdida de experiencia
        // - Pérdida de monedas
        // - Pérdida de items
      }
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        oldHealth,
        newHealth: 0,
        isDead: true,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al matar personaje:', error);
      return { success: false, error: error.message };
    }
  },

  async resurrectCharacter(userId, serverId, healthPercent = 100) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Verificar si el personaje está muerto
      if (profile.character.health.current > 0) {
        return {
          success: false,
          error: 'El personaje no está muerto',
          character: profile.character
        };
      }
      
      // Calcular salud a restaurar
      const healthToRestore = Math.floor((profile.character.health.max * healthPercent) / 100);
      
      // Restaurar salud
      profile.character.health.current = healthToRestore;
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        oldHealth: 0,
        newHealth: healthToRestore,
        healthPercent,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al resucitar personaje:', error);
      return { success: false, error: error.message };
    }
  },

  async addItem(userId, serverId, itemId, quantity = 1) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar el objeto
      const item = await Item.findById(itemId);
      
      if (!item) {
        throw new Error('Objeto no encontrado');
      }
      
      // Verificar si ya tiene el objeto en el inventario
      const existingItemIndex = profile.character.inventory.findIndex(i => i.itemId === itemId);
      
      if (existingItemIndex !== -1) {
        // Incrementar cantidad del objeto existente
        profile.character.inventory[existingItemIndex].quantity += quantity;
      } else {
        // Añadir nuevo objeto al inventario
        profile.character.inventory.push({
          itemId,
          quantity,
          equipped: false,
          uses: item.maxUses > 0 ? item.maxUses : null
        });
      }
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        item,
        quantity,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al añadir objeto:', error);
      return { success: false, error: error.message };
    }
  },

  async removeItem(userId, serverId, itemId, quantity = 1) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar el objeto en el inventario
      const existingItemIndex = profile.character.inventory.findIndex(i => i.itemId === itemId);
      
      if (existingItemIndex === -1) {
        return {
          success: false,
          error: 'El personaje no tiene este objeto',
          character: profile.character
        };
      }
      
      // Verificar si tiene suficiente cantidad
      if (profile.character.inventory[existingItemIndex].quantity < quantity) {
        return {
          success: false,
          error: 'Cantidad insuficiente del objeto',
          character: profile.character
        };
      }
      
      // Restar cantidad
      profile.character.inventory[existingItemIndex].quantity -= quantity;
      
      // Si la cantidad llega a 0, eliminar el objeto del inventario
      if (profile.character.inventory[existingItemIndex].quantity <= 0) {
        // Desequipar si estaba equipado
        if (profile.character.inventory[existingItemIndex].equipped) {
          profile.character.inventory[existingItemIndex].equipped = false;
        }
        
        // Eliminar del inventario
        profile.character.inventory.splice(existingItemIndex, 1);
      }
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        itemId,
        quantity,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al quitar objeto:', error);
      return { success: false, error: error.message };
    }
  },

  async equipItem(userId, serverId, itemId) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar el objeto
      const item = await Item.findById(itemId);
      
      if (!item) {
        throw new Error('Objeto no encontrado');
      }
      
      // Verificar si es un objeto equipable
      if (item.type !== 'equipment' || !item.equipmentSlot) {
        return {
          success: false,
          error: 'Este objeto no se puede equipar',
          character: profile.character
        };
      }
      
      // Buscar el objeto en el inventario
      const existingItemIndex = profile.character.inventory.findIndex(i => i.itemId === itemId);
      
      if (existingItemIndex === -1) {
        return {
          success: false,
          error: 'El personaje no tiene este objeto',
          character: profile.character
        };
      }
      
      // Desequipar otros objetos en el mismo slot
      if (item.equipmentSlot !== 'none') {
        for (let i = 0; i < profile.character.inventory.length; i++) {
          const inventoryItem = profile.character.inventory[i];
          if (inventoryItem.equipped && i !== existingItemIndex) {
            const otherItem = await Item.findById(inventoryItem.itemId);
            if (otherItem && otherItem.equipmentSlot === item.equipmentSlot) {
              profile.character.inventory[i].equipped = false;
            }
          }
        }
      }
      
      // Equipar el objeto
      profile.character.inventory[existingItemIndex].equipped = true;
      
      // Aplicar efectos del objeto
      // (Esto se maneja típicamente en tiempo de ejecución o en la lógica del juego)
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        item,
        slot: item.equipmentSlot,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al equipar objeto:', error);
      return { success: false, error: error.message };
    }
  },

  async unequipItem(userId, serverId, itemId) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar el objeto en el inventario
      const existingItemIndex = profile.character.inventory.findIndex(i => i.itemId === itemId);
      
      if (existingItemIndex === -1) {
        return {
          success: false,
          error: 'El personaje no tiene este objeto',
          character: profile.character
        };
      }
      
      // Verificar si está equipado
      if (!profile.character.inventory[existingItemIndex].equipped) {
        return {
          success: false,
          error: 'Este objeto no está equipado',
          character: profile.character
        };
      }
      
      // Desequipar el objeto
      profile.character.inventory[existingItemIndex].equipped = false;
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        itemId,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al desequipar objeto:', error);
      return { success: false, error: error.message };
    }
  },

  async useItem(userId, serverId, itemId) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar el objeto
      const item = await Item.findById(itemId);
      
      if (!item) {
        throw new Error('Objeto no encontrado');
      }
      
      // Buscar el objeto en el inventario
      const existingItemIndex = profile.character.inventory.findIndex(i => i.itemId === itemId);
      
      if (existingItemIndex === -1) {
        return {
          success: false,
          error: 'El personaje no tiene este objeto',
          character: profile.character
        };
      }
      
      // Verificar si es consumible
      if (!item.consumable) {
        return {
          success: false,
          error: 'Este objeto no es consumible',
          character: profile.character
        };
      }
      
      // Aplicar efectos del objeto
      const effects = {
        healthRestored: 0,
        manaRestored: 0,
        statsBuffed: {}
      };
      
      // Restaurar salud si aplica
      if (item.effects.health > 0) {
        const oldHealth = profile.character.health.current;
        profile.character.health.current += item.effects.health;
        
        // Limitar a la salud máxima
        if (profile.character.health.current > profile.character.health.max) {
          profile.character.health.current = profile.character.health.max;
        }
        
        effects.healthRestored = profile.character.health.current - oldHealth;
      }
      
      // Restaurar maná si aplica
      if (item.effects.mana > 0) {
        const oldMana = profile.character.mana.current;
        profile.character.mana.current += item.effects.mana;
        
        // Limitar al maná máximo
        if (profile.character.mana.current > profile.character.mana.max) {
          profile.character.mana.current = profile.character.mana.max;
        }
        
        effects.manaRestored = profile.character.mana.current - oldMana;
      }
      
      // Aplicar buffs a estadísticas si aplica
      if (item.effects.strength > 0) {
        profile.character.stats.strength += item.effects.strength;
        effects.statsBuffed.strength = item.effects.strength;
      }
      
      if (item.effects.intelligence > 0) {
        profile.character.stats.intelligence += item.effects.intelligence;
        effects.statsBuffed.intelligence = item.effects.intelligence;
      }
      
      if (item.effects.dexterity > 0) {
        profile.character.stats.dexterity += item.effects.dexterity;
        effects.statsBuffed.dexterity = item.effects.dexterity;
      }
      
      if (item.effects.defense > 0) {
        profile.character.stats.defense += item.effects.defense;
        effects.statsBuffed.defense = item.effects.defense;
      }
      
      // Reducir usos si está configurado
      if (profile.character.inventory[existingItemIndex].uses !== null) {
        profile.character.inventory[existingItemIndex].uses -= 1;
        
        // Si se agotan los usos, eliminar o reducir cantidad
        if (profile.character.inventory[existingItemIndex].uses <= 0) {
          // Reducir cantidad
          profile.character.inventory[existingItemIndex].quantity -= 1;
          
          // Si la cantidad llega a 0, eliminar el objeto
          if (profile.character.inventory[existingItemIndex].quantity <= 0) {
            profile.character.inventory.splice(existingItemIndex, 1);
          } else {
            // Reiniciar usos para la siguiente unidad
            profile.character.inventory[existingItemIndex].uses = item.maxUses > 0 ? item.maxUses : null;
          }
        }
      } else {
        // Reducir cantidad
        profile.character.inventory[existingItemIndex].quantity -= 1;
        
        // Si la cantidad llega a 0, eliminar el objeto
        if (profile.character.inventory[existingItemIndex].quantity <= 0) {
          profile.character.inventory.splice(existingItemIndex, 1);
        }
      }
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        item,
        effects,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al usar objeto:', error);
      return { success: false, error: error.message };
    }
  },

  async addSkill(userId, serverId, skillId, level = 1) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar la habilidad
      const skill = await Skill.findById(skillId);
      
      if (!skill) {
        throw new Error('Habilidad no encontrada');
      }
      
      // Verificar si ya tiene la habilidad
      const existingSkillIndex = profile.character.skills.findIndex(s => s.skillId === skillId);
      
      if (existingSkillIndex !== -1) {
        return {
          success: false,
          error: 'El personaje ya tiene esta habilidad',
          character: profile.character
        };
      }
      
      // Añadir la habilidad
      profile.character.skills.push({
        skillId,
        level,
        usesLeft: skill.maxUses > 0 ? skill.maxUses : null,
        cooldownUntil: null
      });
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        skill,
        level,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al añadir habilidad:', error);
      return { success: false, error: error.message };
    }
  },

  async upgradeSkill(userId, serverId, skillId, levels = 1) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Verificar si tiene la habilidad
      const existingSkillIndex = profile.character.skills.findIndex(s => s.skillId === skillId);
      
      if (existingSkillIndex === -1) {
        return {
          success: false,
          error: 'El personaje no tiene esta habilidad',
          character: profile.character
        };
      }
      
      // Guardar nivel actual para comparar después
      const oldLevel = profile.character.skills[existingSkillIndex].level;
      
      // Aumentar nivel
      profile.character.skills[existingSkillIndex].level += levels;
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        skillId,
        oldLevel,
        newLevel: profile.character.skills[existingSkillIndex].level,
        levelUp: profile.character.skills[existingSkillIndex].level > oldLevel,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al aumentar el nivel de habilidad:', error);
      return { success: false, error: error.message };
    }
  },

  async useSkill(userId, serverId, skillId, targetId = null) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Verificar si tiene la habilidad
      const existingSkillIndex = profile.character.skills.findIndex(s => s.skillId === skillId);
      
      if (existingSkillIndex === -1) {
        return {
          success: false,
          error: 'El personaje no tiene esta habilidad',
          character: profile.character
        };
      }
      
      // Buscar la habilidad en la base de datos para obtener sus propiedades
      const skill = await Skill.findById(skillId);
      
      if (!skill) {
        throw new Error('Habilidad no encontrada en la base de datos');
      }
      
      // Verificar si la habilidad está en enfriamiento
      const characterSkill = profile.character.skills[existingSkillIndex];
      
      if (characterSkill.cooldownUntil && new Date(characterSkill.cooldownUntil) > new Date()) {
        return {
          success: false,
          error: 'La habilidad está en enfriamiento',
          cooldownRemaining: Math.ceil((new Date(characterSkill.cooldownUntil) - new Date()) / 1000),
          character: profile.character
        };
      }
      
      // Verificar usos restantes
      if (characterSkill.usesLeft !== null && characterSkill.usesLeft <= 0) {
        return {
          success: false,
          error: 'No quedan usos de esta habilidad',
          character: profile.character
        };
      }
      
      // Verificar maná suficiente
      if (skill.manaCost > 0 && profile.character.mana.current < skill.manaCost) {
        return {
          success: false,
          error: 'Maná insuficiente para usar esta habilidad',
          character: profile.character
        };
      }
      
      // Consumir maná
      if (skill.manaCost > 0) {
        profile.character.mana.current -= skill.manaCost;
      }
      
      // Reducir usos restantes si aplica
      if (characterSkill.usesLeft !== null) {
        characterSkill.usesLeft -= 1;
      }
      
      // Establecer enfriamiento si aplica
      if (skill.cooldown > 0) {
        const cooldownDate = new Date();
        cooldownDate.setSeconds(cooldownDate.getSeconds() + skill.cooldown);
        characterSkill.cooldownUntil = cooldownDate;
      }
      
      // Aplicar efectos de la habilidad
      const effects = {
        damage: 0,
        healing: 0,
        buffs: {}
      };
      
      // El nivel de la habilidad puede aumentar sus efectos
      const powerMultiplier = 1 + ((characterSkill.level - 1) * 0.1); // 10% más fuerte por nivel
      
      // Procesar efectos según el tipo de habilidad
      if (skill.effects) {
        // Daño
        if (skill.effects.damage > 0) {
          effects.damage = Math.floor(skill.effects.damage * powerMultiplier);
        }
        
        // Curación
        if (skill.effects.healing > 0) {
          const healAmount = Math.floor(skill.effects.healing * powerMultiplier);
          const oldHealth = profile.character.health.current;
          
          profile.character.health.current += healAmount;
          
          // Limitar a la salud máxima
          if (profile.character.health.current > profile.character.health.max) {
            profile.character.health.current = profile.character.health.max;
          }
          
          effects.healing = profile.character.health.current - oldHealth;
        }
        
        // Buffs temporales a estadísticas
        if (skill.effects.buffStrength > 0) {
          const buffAmount = Math.floor(skill.effects.buffStrength * powerMultiplier);
          effects.buffs.strength = buffAmount;
          // Implementar lógica de buffs temporales
        }
        
        if (skill.effects.buffIntelligence > 0) {
          const buffAmount = Math.floor(skill.effects.buffIntelligence * powerMultiplier);
          effects.buffs.intelligence = buffAmount;
          // Implementar lógica de buffs temporales
        }
        
        if (skill.effects.buffDexterity > 0) {
          const buffAmount = Math.floor(skill.effects.buffDexterity * powerMultiplier);
          effects.buffs.dexterity = buffAmount;
          // Implementar lógica de buffs temporales
        }
        
        if (skill.effects.buffDefense > 0) {
          const buffAmount = Math.floor(skill.effects.buffDefense * powerMultiplier);
          effects.buffs.defense = buffAmount;
          // Implementar lógica de buffs temporales
        }
      }
      
      // Si hay un objetivo, procesar efectos sobre él
      if (targetId) {
        // Procesar efectos sobre el objetivo (jugador o NPC)
        // Implementar según necesidades específicas
      }
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        skill,
        effects,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al usar habilidad:', error);
      return { success: false, error: error.message };
    }
  },

  async startMission(userId, serverId, missionId) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar la misión
      const mission = await Mission.findById(missionId);
      
      if (!mission) {
        throw new Error('Misión no encontrada');
      }
      
      // Verificar si la misión está activa
      if (mission.status !== 'active') {
        return {
          success: false,
          error: 'Esta misión no está disponible actualmente',
          character: profile.character
        };
      }
      
      // Verificar nivel requerido
      if (profile.character.level < mission.levelRequired) {
        return {
          success: false,
          error: `Se requiere nivel ${mission.levelRequired} para esta misión`,
          character: profile.character
        };
      }
      
      // Verificar restricciones de raza si existen
      if (mission.raceRestrictions && mission.raceRestrictions.length > 0) {
        if (!mission.raceRestrictions.includes(profile.character.race)) {
          return {
            success: false,
            error: 'Tu raza no puede aceptar esta misión',
            character: profile.character
          };
        }
      }
      
      // Verificar restricciones de clase si existen
      if (mission.classRestrictions && mission.classRestrictions.length > 0) {
        if (!mission.classRestrictions.includes(profile.character.class)) {
          return {
            success: false,
            error: 'Tu clase no puede aceptar esta misión',
            character: profile.character
          };
        }
      }
      
      // Verificar si ya tiene la misión activa
      if (profile.progress.activeMissions.some(m => m.missionId === missionId)) {
        return {
          success: false,
          error: 'Ya tienes esta misión activa',
          character: profile.character
        };
      }
      
      // Verificar si ya completó esta misión
      if (profile.progress.completedMissions.some(m => m.missionId === missionId)) {
        // Verificar si la misión es repetible
        if (!mission.repeatable) {
          return {
            success: false,
            error: 'Ya has completado esta misión y no es repetible',
            character: profile.character
          };
        }
        
        // Verificar cooldown si la misión es repetible
        const completedMission = profile.progress.completedMissions.find(m => m.missionId === missionId);
        const cooldownTime = mission.cooldown * 60 * 60 * 1000; // Convertir horas a milisegundos
        
        if (cooldownTime > 0 && completedMission.completedAt) {
          const timeSinceCompletion = Date.now() - new Date(completedMission.completedAt).getTime();
          
          if (timeSinceCompletion < cooldownTime) {
            const hoursRemaining = Math.ceil((cooldownTime - timeSinceCompletion) / (60 * 60 * 1000));
            
            return {
              success: false,
              error: `Debes esperar ${hoursRemaining} horas antes de repetir esta misión`,
              character: profile.character
            };
          }
        }
      }
      
      // Verificar costos de la misión
      if (mission.costs) {
        // Verificar costo de monedas
        if (mission.costs.currency > 0) {
          if (profile.character.currency < mission.costs.currency) {
            return {
              success: false,
              error: `No tienes suficientes monedas (${mission.costs.currency} requeridas)`,
              character: profile.character
            };
          }
        }
        
        // Verificar costos de objetos
        if (mission.costs.items && mission.costs.items.length > 0) {
          for (const costItem of mission.costs.items) {
            const inventoryItem = profile.character.inventory.find(i => i.itemId === costItem.itemId);
            
            if (!inventoryItem || inventoryItem.quantity < costItem.quantity) {
              const item = await Item.findById(costItem.itemId);
              return {
                success: false,
                error: `No tienes suficientes ${item ? item.name : 'objetos requeridos'}`,
                character: profile.character
              };
            }
          }
        }
      }
      
      // Cobrar costos de la misión
      if (mission.costs) {
        // Cobrar monedas
        if (mission.costs.currency > 0) {
          profile.character.currency -= mission.costs.currency;
        }
        
        // Cobrar objetos
        if (mission.costs.items && mission.costs.items.length > 0) {
          for (const costItem of mission.costs.items) {
            const inventoryItemIndex = profile.character.inventory.findIndex(i => i.itemId === costItem.itemId);
            
            if (inventoryItemIndex !== -1) {
              profile.character.inventory[inventoryItemIndex].quantity -= costItem.quantity;
              
              // Si la cantidad llega a 0, eliminar el objeto del inventario
              if (profile.character.inventory[inventoryItemIndex].quantity <= 0) {
                profile.character.inventory.splice(inventoryItemIndex, 1);
              }
            }
          }
        }
      }
      
      // Añadir la misión a las misiones activas
      profile.progress.activeMissions.push({
        missionId,
        startedAt: new Date(),
        currentStage: 0,
        progress: 0,
        generalProgress: 0,
        completed: false
      });
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        mission,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al iniciar misión:', error);
      return { success: false, error: error.message };
    }
  },

  async completeMission(userId, serverId, missionId) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar la misión activa
      const activeMissionIndex = profile.progress.activeMissions.findIndex(m => m.missionId === missionId);
      
      if (activeMissionIndex === -1) {
        return {
          success: false,
          error: 'No tienes esta misión activa',
          character: profile.character
        };
      }
      
      const activeMission = profile.progress.activeMissions[activeMissionIndex];
      
      // Verificar que la misión esté completada
      if (!activeMission.completed) {
        return {
          success: false,
          error: 'Esta misión no está completada',
          character: profile.character
        };
      }
      
      // Obtener detalles de la misión
      const mission = await Mission.findById(missionId);
      
      if (!mission) {
        throw new Error('Misión no encontrada en la base de datos');
      }
      
      // Otorgar recompensas
      const rewards = {
        experience: 0,
        currency: 0,
        items: [],
        skills: []
      };
      
      // Experiencia
      if (mission.rewards.experience > 0) {
        // Obtener nivel actual antes de añadir experiencia
        const oldLevel = profile.character.level;
        
        // Añadir experiencia
        profile.character.experience += mission.rewards.experience;
        rewards.experience = mission.rewards.experience;
        
        // Calcular si sube de nivel
        const newLevel = this.calculateLevel(profile.character.experience);
        profile.character.level = newLevel;
        
        // Añadir información sobre subida de nivel
        if (newLevel > oldLevel) {
          rewards.levelUp = {
            from: oldLevel,
            to: newLevel
          };
        }
      }
      
      // Monedas
      if (mission.rewards.currency > 0) {
        profile.character.currency += mission.rewards.currency;
        rewards.currency = mission.rewards.currency;
      }
      
      // Items
      if (mission.rewards.items && mission.rewards.items.length > 0) {
        for (const rewardItem of mission.rewards.items) {
          const item = await Item.findById(rewardItem.itemId);
          
          if (item) {
            // Añadir el item al inventario
            const existingItemIndex = profile.character.inventory.findIndex(i => i.itemId === rewardItem.itemId);
            
            if (existingItemIndex !== -1) {
              profile.character.inventory[existingItemIndex].quantity += rewardItem.quantity;
            } else {
              profile.character.inventory.push({
                itemId: rewardItem.itemId,
                quantity: rewardItem.quantity,
                equipped: false,
                uses: item.maxUses > 0 ? item.maxUses : null
              });
            }
            
            rewards.items.push({
              name: item.name,
              quantity: rewardItem.quantity,
              item
            });
          }
        }
      }
      
      // Habilidades
      if (mission.rewards.skills && mission.rewards.skills.length > 0) {
        for (const skillId of mission.rewards.skills) {
          const skill = await Skill.findById(skillId);
          
          if (skill) {
            // Verificar si ya tiene la habilidad
            const existingSkillIndex = profile.character.skills.findIndex(s => s.skillId === skillId);
            
            if (existingSkillIndex === -1) {
              // Añadir la nueva habilidad
              profile.character.skills.push({
                skillId: skillId,
                level: 1,
                usesLeft: skill.maxUses > 0 ? skill.maxUses : null,
                cooldownUntil: null
              });
              
              rewards.skills.push({
                name: skill.name,
                level: 1,
                skill
              });
            } else {
              // Aumentar nivel de la habilidad existente
              const oldLevel = profile.character.skills[existingSkillIndex].level;
              profile.character.skills[existingSkillIndex].level += 1;
              
              rewards.skills.push({
                name: skill.name,
                oldLevel,
                newLevel: profile.character.skills[existingSkillIndex].level,
                skill
              });
            }
          }
        }
      }
      
      // Mover la misión de activas a completadas
      profile.progress.completedMissions.push({
        missionId: missionId,
        completedAt: new Date()
      });
      
      // Eliminar la misión de activas
      profile.progress.activeMissions.splice(activeMissionIndex, 1);
      
      // Actualizar estadísticas de misiones
      profile.stats.quests.completed += 1;
      
      // Verificar si la misión forma parte de una aventura
      const adventures = await Adventure.find({
        serverId,
        'missions.missionId': missionId,
        status: 'active'
      });
      
      const adventureUpdates = [];
      
      for (const adventure of adventures) {
        // Verificar si el usuario tiene la aventura activa
        const activeAdventureIndex = profile.progress.activeAdventures.findIndex(a => a.adventureId === adventure._id.toString());
        
        if (activeAdventureIndex !== -1) {
          const activeAdventure = profile.progress.activeAdventures[activeAdventureIndex];
          
          // Marcar la misión como completada en la aventura
          if (!activeAdventure.completedMissions.includes(missionId)) {
            activeAdventure.completedMissions.push(missionId);
            
            // Verificar si se ha completado la aventura
            const requiredMissions = adventure.missions.filter(m => m.required).map(m => m.missionId);
            const allRequiredCompleted = requiredMissions.every(m => activeAdventure.completedMissions.includes(m));
            
            if (allRequiredCompleted) {
              activeAdventure.completed = true;
              adventureUpdates.push({
                title: adventure.title,
                id: adventure._id,
                completed: true
              });
            } else {
              const remainingRequired = requiredMissions.filter(m => !activeAdventure.completedMissions.includes(m)).length;
              adventureUpdates.push({
                title: adventure.title,
                id: adventure._id,
                completed: false,
                remainingMissions: remainingRequired
              });
            }
          }
        }
      }
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        mission,
        rewards,
        adventureUpdates,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al completar misión:', error);
      return { success: false, error: error.message };
    }
  },
 
  async updateMissionProgress(userId, serverId, missionId, progress) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar la misión activa
      const activeMissionIndex = profile.progress.activeMissions.findIndex(m => m.missionId === missionId);
      
      if (activeMissionIndex === -1) {
        return {
          success: false,
          error: 'No tienes esta misión activa',
          character: profile.character
        };
      }
      
      // Obtener detalles de la misión
      const mission = await Mission.findById(missionId);
      
      if (!mission) {
        throw new Error('Misión no encontrada en la base de datos');
      }
      
      // Actualizar progreso de la etapa actual
      const activeMission = profile.progress.activeMissions[activeMissionIndex];
      activeMission.progress = Math.min(Math.max(0, progress), 100); // Asegurar que esté entre 0 y 100
      
      // Calcular el progreso general
      const totalStages = mission.stages.length;
      const completedStagesProgress = (activeMission.currentStage / totalStages) * 100;
      const currentStageContribution = (activeMission.progress / 100) * (1 / totalStages) * 100;
      activeMission.generalProgress = Math.floor(completedStagesProgress + currentStageContribution);
      
      // Verificar si se ha completado la etapa actual
      if (activeMission.progress >= 100) {
        // Verificar si hay más etapas
        if (activeMission.currentStage < mission.stages.length - 1) {
          // Avanzar a la siguiente etapa
          activeMission.currentStage++;
          activeMission.progress = 0;
        } else {
          // Marcar la misión como completada
          activeMission.completed = true;
          activeMission.generalProgress = 100;
        }
      }
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        mission,
        currentStage: activeMission.currentStage,
        progress: activeMission.progress,
        generalProgress: activeMission.generalProgress,
        completed: activeMission.completed,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al actualizar progreso de misión:', error);
      return { success: false, error: error.message };
    }
  },

  async updateProfileChannels(userId, serverId, profile) {
    try {
      // Obtener la configuración del servidor
      const serverConfig = await Server.findOne({ serverId });
      
      if (!serverConfig) {
        return;
      }
      
      // Verificar si está habilitada la funcionalidad de canales de perfil
      if (serverConfig.config.autoCreateProfileChannels || serverConfig.config.profilesChannel) {
        const channelId = await profileUtils.createOrUpdateProfileChannel(serverId, userId, profile);
        
        // Si se creó un canal individual, actualizar el ID en el perfil
        if (channelId && channelId !== serverConfig.config.profilesChannel) {
          profile.profileChannelId = channelId;
          await profile.save();
        }
        
        // Actualizar también el canal general de perfiles
        if (serverConfig.config.profilesChannel) {
          await profileUtils.updateGeneralProfilesChannel(serverId);
        }
      }
    } catch (error) {
      console.error('Error al actualizar canales de perfil:', error);
    }
  },

  async startAdventure(userId, serverId, adventureId) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar la aventura
      const adventure = await Adventure.findById(adventureId);
      
      if (!adventure) {
        throw new Error('Aventura no encontrada');
      }
      
      // Verificar si la aventura está activa
      if (adventure.status !== 'active') {
        return {
          success: false,
          error: 'Esta aventura no está disponible actualmente',
          character: profile.character
        };
      }
      
      // Verificar nivel requerido
      if (profile.character.level < adventure.levelRequired) {
        return {
          success: false,
          error: `Se requiere nivel ${adventure.levelRequired} para esta aventura`,
          character: profile.character
        };
      }
      
      // Verificar restricciones de raza si existen
      if (adventure.raceRestrictions && adventure.raceRestrictions.length > 0) {
        if (!adventure.raceRestrictions.includes(profile.character.race)) {
          return {
            success: false,
            error: 'Tu raza no puede aceptar esta aventura',
            character: profile.character
          };
        }
      }
      
      // Verificar restricciones de clase si existen
      if (adventure.classRestrictions && adventure.classRestrictions.length > 0) {
        if (!adventure.classRestrictions.includes(profile.character.class)) {
          return {
            success: false,
            error: 'Tu clase no puede aceptar esta aventura',
            character: profile.character
          };
        }
      }
      
      // Verificar si ya tiene la aventura activa
      if (profile.progress.activeAdventures.some(a => a.adventureId === adventureId)) {
        return {
          success: false,
          error: 'Ya tienes esta aventura activa',
          character: profile.character
        };
      }
      
      // Verificar disponibilidad temporal
      const now = new Date();
      
      if (adventure.availableFrom && new Date(adventure.availableFrom) > now) {
        return {
          success: false,
          error: `Esta aventura no está disponible hasta ${new Date(adventure.availableFrom).toLocaleString()}`,
          character: profile.character
        };
      }
      
      if (adventure.availableUntil && new Date(adventure.availableUntil) < now) {
        return {
          success: false,
          error: 'Esta aventura ya no está disponible',
          character: profile.character
        };
      }
      
      // Añadir la aventura a las aventuras activas
      profile.progress.activeAdventures.push({
        adventureId,
        startedAt: new Date(),
        completedMissions: [],
        completed: false
      });
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        adventure,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al iniciar aventura:', error);
      return { success: false, error: error.message };
    }
  },

  async completeAdventure(userId, serverId, adventureId) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Buscar la aventura activa
      const activeAdventureIndex = profile.progress.activeAdventures.findIndex(a => a.adventureId === adventureId);
      
      if (activeAdventureIndex === -1) {
        return {
          success: false,
          error: 'No tienes esta aventura activa',
          character: profile.character
        };
      }
      
      const activeAdventure = profile.progress.activeAdventures[activeAdventureIndex];
      
      // Verificar que la aventura esté completada
      if (!activeAdventure.completed) {
        return {
          success: false,
          error: 'Esta aventura no está completada',
          character: profile.character
        };
      }
      
      // Obtener detalles de la aventura
      const adventure = await Adventure.findById(adventureId);
      
      if (!adventure) {
        throw new Error('Aventura no encontrada en la base de datos');
      }
      
      // Otorgar recompensas
      const rewards = {
        experience: 0,
        currency: 0,
        items: [],
        skills: []
      };
      
      // Experiencia
      if (adventure.completionRewards.experience > 0) {
        // Obtener nivel actual antes de añadir experiencia
        const oldLevel = profile.character.level;
        
        // Añadir experiencia
        profile.character.experience += adventure.completionRewards.experience;
        rewards.experience = adventure.completionRewards.experience;
        
        // Calcular si sube de nivel
        const newLevel = this.calculateLevel(profile.character.experience);
        profile.character.level = newLevel;
        
        // Añadir información sobre subida de nivel
        if (newLevel > oldLevel) {
          rewards.levelUp = {
            from: oldLevel,
            to: newLevel
          };
        }
      }
      
      // Monedas
      if (adventure.completionRewards.currency > 0) {
        profile.character.currency += adventure.completionRewards.currency;
        rewards.currency = adventure.completionRewards.currency;
      }
      
      // Items
      if (adventure.completionRewards.items && adventure.completionRewards.items.length > 0) {
        for (const rewardItem of adventure.completionRewards.items) {
          const item = await Item.findById(rewardItem.itemId);
          
          if (item) {
            // Añadir el item al inventario
            const existingItemIndex = profile.character.inventory.findIndex(i => i.itemId === rewardItem.itemId);
            
            if (existingItemIndex !== -1) {
              profile.character.inventory[existingItemIndex].quantity += rewardItem.quantity;
            } else {
              profile.character.inventory.push({
                itemId: rewardItem.itemId,
                quantity: rewardItem.quantity,
                equipped: false,
                uses: item.maxUses > 0 ? item.maxUses : null
              });
            }
            
            rewards.items.push({
              name: item.name,
              quantity: rewardItem.quantity,
              item
            });
          }
        }
      }
      
      // Habilidades
      if (adventure.completionRewards.skills && adventure.completionRewards.skills.length > 0) {
        for (const skillId of adventure.completionRewards.skills) {
          const skill = await Skill.findById(skillId);
          
          if (skill) {
            // Verificar si ya tiene la habilidad
            const existingSkillIndex = profile.character.skills.findIndex(s => s.skillId === skillId);
            
            if (existingSkillIndex === -1) {
              // Añadir la nueva habilidad
              profile.character.skills.push({
                skillId: skillId,
                level: 1,
                usesLeft: skill.maxUses > 0 ? skill.maxUses : null,
                cooldownUntil: null
              });
              
              rewards.skills.push({
                name: skill.name,
                level: 1,
                skill
              });
            } else {
              // Aumentar nivel de la habilidad existente
              const oldLevel = profile.character.skills[existingSkillIndex].level;
              profile.character.skills[existingSkillIndex].level += 1;
              
              rewards.skills.push({
                name: skill.name,
                oldLevel,
                newLevel: profile.character.skills[existingSkillIndex].level,
                skill
              });
            }
          }
        }
      }
      
      // Mover la aventura de activas a completadas
      profile.progress.completedAdventures.push({
        adventureId: adventureId,
        completedAt: new Date(),
        completedMissions: activeAdventure.completedMissions
      });
      
      // Eliminar la aventura de activas
      profile.progress.activeAdventures.splice(activeAdventureIndex, 1);
      
      // Actualizar estadísticas de aventuras
      if (!profile.stats.adventures) {
        profile.stats.adventures = { completed: 0, failed: 0 };
      }
      profile.stats.adventures.completed += 1;
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        adventure,
        rewards,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al completar aventura:', error);
      return { success: false, error: error.message };
    }
  },
  
  async updateCombatStats(userId, serverId, combatResult) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Inicializar estadísticas de combate si no existen
      if (!profile.stats.combat) {
        profile.stats.combat = {
          wins: 0,
          losses: 0,
          draws: 0,
          damageDone: 0,
          damageReceived: 0,
          criticalHits: 0,
          enemiesDefeated: {
            total: 0,
            byType: {}
          }
        };
      }
      
      // Actualizar resultado general del combate
      if (combatResult.result === 'win') {
        profile.stats.combat.wins += 1;
        profile.stats.wins += 1;  // Para mantener compatibilidad con el esquema anterior
      } else if (combatResult.result === 'loss') {
        profile.stats.combat.losses += 1;
        profile.stats.losses += 1;  // Para mantener compatibilidad con el esquema anterior
      } else if (combatResult.result === 'draw') {
        profile.stats.combat.draws += 1;
      }
      
      // Actualizar estadísticas detalladas
      if (combatResult.damageDone) {
        profile.stats.combat.damageDone += combatResult.damageDone;
      }
      
      if (combatResult.damageReceived) {
        profile.stats.combat.damageReceived += combatResult.damageReceived;
      }
      
      if (combatResult.criticalHits) {
        profile.stats.combat.criticalHits += combatResult.criticalHits;
      }
      
      // Actualizar enemigos derrotados
      if (combatResult.result === 'win' && combatResult.enemyType) {
        profile.stats.combat.enemiesDefeated.total += 1;
        
        if (!profile.stats.combat.enemiesDefeated.byType[combatResult.enemyType]) {
          profile.stats.combat.enemiesDefeated.byType[combatResult.enemyType] = 0;
        }
        
        profile.stats.combat.enemiesDefeated.byType[combatResult.enemyType] += 1;
      }
      
      // Procesar recompensas del combate
      if (combatResult.rewards) {
        // Experiencia
        if (combatResult.rewards.experience > 0) {
          const oldLevel = profile.character.level;
          profile.character.experience += combatResult.rewards.experience;
          
          // Calcular si sube de nivel
          const newLevel = this.calculateLevel(profile.character.experience);
          profile.character.level = newLevel;
          
          combatResult.levelUp = newLevel > oldLevel ? { from: oldLevel, to: newLevel } : null;
        }
        
        // Monedas
        if (combatResult.rewards.currency > 0) {
          profile.character.currency += combatResult.rewards.currency;
        }
        
        // Items
        if (combatResult.rewards.items && combatResult.rewards.items.length > 0) {
          for (const rewardItem of combatResult.rewards.items) {
            await this.addItem(userId, serverId, rewardItem.itemId, rewardItem.quantity);
          }
        }
      }
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        combatResult,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al actualizar estadísticas de combate:', error);
      return { success: false, error: error.message };
    }
  },

  async getCharacterInfo(userId, serverId) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Obtener items equipados
      const equippedItems = [];
      
      for (const inventoryItem of profile.character.inventory) {
        if (inventoryItem.equipped) {
          try {
            const item = await Item.findById(inventoryItem.itemId);
            if (item) {
              equippedItems.push({
                id: item._id,
                name: item.name,
                type: item.type,
                slot: item.equipmentSlot,
                effects: item.effects
              });
            }
          } catch (err) {
            console.error(`Error al obtener item equipado ${inventoryItem.itemId}:`, err);
          }
        }
      }
      
      // Calcular estadísticas totales (incluyendo efectos de items)
      const totalStats = {
        strength: profile.character.stats.strength,
        intelligence: profile.character.stats.intelligence,
        dexterity: profile.character.stats.dexterity,
        defense: profile.character.stats.defense
      };
      
      // Aplicar efectos de items equipados
      for (const item of equippedItems) {
        if (item.effects) {
          if (item.effects.strength) totalStats.strength += item.effects.strength;
          if (item.effects.intelligence) totalStats.intelligence += item.effects.intelligence;
          if (item.effects.dexterity) totalStats.dexterity += item.effects.dexterity;
          if (item.effects.defense) totalStats.defense += item.effects.defense;
        }
      }
      
      // Obtener misiones activas
      const activeMissions = [];
      
      for (const mission of profile.progress.activeMissions) {
        try {
          const missionData = await Mission.findById(mission.missionId);
          if (missionData) {
            activeMissions.push({
              id: missionData._id,
              title: missionData.title,
              progress: mission.progress,
              generalProgress: mission.generalProgress,
              currentStage: mission.currentStage,
              completed: mission.completed
            });
          }
        } catch (err) {
          console.error(`Error al obtener misión activa ${mission.missionId}:`, err);
        }
      }
      
      // Obtener aventuras activas
      const activeAdventures = [];
      
      for (const adventure of profile.progress.activeAdventures) {
        try {
          const adventureData = await Adventure.findById(adventure.adventureId);
          if (adventureData) {
            // Calcular progreso general
            const totalMissions = adventureData.missions.length;
            const completedMissions = adventure.completedMissions.length;
            const progress = totalMissions > 0 ? Math.floor((completedMissions / totalMissions) * 100) : 0;
            
            activeAdventures.push({
              id: adventureData._id,
              title: adventureData.title,
              completedMissions,
              totalMissions,
              progress,
              completed: adventure.completed
            });
          }
        } catch (err) {
          console.error(`Error al obtener aventura activa ${adventure.adventureId}:`, err);
        }
      }
      
      // Formatear experiencia para mostrar progreso al siguiente nivel
      const experienceInfo = this.calculateExperienceToNextLevel(profile.character.experience);
      
      return {
        success: true,
        character: {
          name: profile.character.name,
          race: profile.character.race,
          class: profile.character.class,
          level: profile.character.level,
          experience: profile.character.experience,
          experienceInfo,
          health: profile.character.health,
          mana: profile.character.mana,
          currency: profile.character.currency,
          stats: profile.character.stats,
          totalStats,
          equippedItems,
          activeEffects: profile.character.activeEffects || []
        },
        progress: {
          activeMissions,
          activeAdventures
        },
        stats: profile.stats
      };
    } catch (error) {
      console.error('Error al obtener información del personaje:', error);
      return { success: false, error: error.message };
    }
  },

  calculateExperienceToNextLevel(currentExp) {
    let totalExpForCurrentLevel = 0;
    let expNeededForNextLevel = 100;
    let currentLevel = 1;
    let remainingExp = currentExp;
    
    // Calcular nivel actual y experiencia restante
    while (true) {
      if (remainingExp < expNeededForNextLevel) {
        break;
      }
      
      remainingExp -= expNeededForNextLevel;
      totalExpForCurrentLevel += expNeededForNextLevel;
      currentLevel++;
      expNeededForNextLevel = Math.floor(expNeededForNextLevel * 1.2);
    }
    
    return {
      currentLevel,
      currentExp: remainingExp,
      totalExpForCurrentLevel,
      expNeededForNextLevel,
      progress: Math.floor((remainingExp / expNeededForNextLevel) * 100)
    };
  },

  async updatePosition(userId, serverId, coordinates) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Inicializar posición si no existe
      if (!profile.progress.position) {
        profile.progress.position = {
          x: 0,
          y: 0,
          mapId: 'default',
          lastUpdated: new Date()
        };
      }
      
      // Guardar posición anterior
      const previousPosition = {
        x: profile.progress.position.x,
        y: profile.progress.position.y,
        mapId: profile.progress.position.mapId
      };
      
      // Actualizar posición
      profile.progress.position.x = coordinates.x;
      profile.progress.position.y = coordinates.y;
      
      if (coordinates.mapId) {
        profile.progress.position.mapId = coordinates.mapId;
      }
      
      profile.progress.position.lastUpdated = new Date();
      
      // Guardar cambios
      await profile.save();
      
      // No actualizar canales de perfil para movimientos frecuentes
      
      return {
        success: true,
        previousPosition,
        currentPosition: profile.progress.position,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al actualizar posición:', error);
      return { success: false, error: error.message };
    }
  },

  async addEffect(userId, serverId, effect) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Inicializar array de efectos activos si no existe
      if (!profile.character.activeEffects) {
        profile.character.activeEffects = [];
      }
      
      // Verificar si ya existe un efecto del mismo tipo
      const existingEffectIndex = profile.character.activeEffects.findIndex(e => e.type === effect.type);
      
      if (existingEffectIndex !== -1) {
        // Actualizar efecto existente o extender duración
        const existingEffect = profile.character.activeEffects[existingEffectIndex];
        
        // Si el nuevo efecto es más fuerte, actualizar
        if (effect.value > existingEffect.value) {
          existingEffect.value = effect.value;
        }
        
        // Extender duración si es más larga
        if (effect.expiresAt && (!existingEffect.expiresAt || new Date(effect.expiresAt) > new Date(existingEffect.expiresAt))) {
          existingEffect.expiresAt = effect.expiresAt;
        }
        
        // Actualizar fuente si se proporciona
        if (effect.source) {
          existingEffect.source = effect.source;
        }
      } else {
        // Añadir nuevo efecto
        profile.character.activeEffects.push({
          type: effect.type,
          name: effect.name,
          value: effect.value,
          startedAt: effect.startedAt || new Date(),
          expiresAt: effect.expiresAt || null,
          source: effect.source || 'unknown',
          description: effect.description || ''
        });
      }
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        effect,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al añadir efecto:', error);
      return { success: false, error: error.message };
    }
  },

  async removeEffect(userId, serverId, effectType) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Verificar si hay efectos activos
      if (!profile.character.activeEffects || profile.character.activeEffects.length === 0) {
        return {
          success: false,
          error: 'No hay efectos activos',
          character: profile.character
        };
      }
      
      // Buscar el efecto a eliminar
      const effectIndex = profile.character.activeEffects.findIndex(e => e.type === effectType);
      
      if (effectIndex === -1) {
        return {
          success: false,
          error: 'Efecto no encontrado',
          character: profile.character
        };
      }
      
      // Guardar el efecto para devolverlo en la respuesta
      const removedEffect = profile.character.activeEffects[effectIndex];
      
      // Eliminar el efecto
      profile.character.activeEffects.splice(effectIndex, 1);
      
      // Guardar cambios
      await profile.save();
      
      // Actualizar canales de perfil si es necesario
      await this.updateProfileChannels(userId, serverId, profile);
      
      return {
        success: true,
        removedEffect,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al eliminar efecto:', error);
      return { success: false, error: error.message };
    }
  },

  async updateEffects(userId, serverId) {
    try {
      // Buscar el perfil del usuario
      const profile = await Profile.findOne({ userId, serverId });
      
      if (!profile) {
        throw new Error('Perfil no encontrado');
      }
      
      // Verificar si hay efectos activos
      if (!profile.character.activeEffects || profile.character.activeEffects.length === 0) {
        return {
          success: true,
          message: 'No hay efectos activos que actualizar',
          character: profile.character
        };
      }
      
      const now = new Date();
      const expiredEffects = [];
      
      // Filtrar efectos expirados
      profile.character.activeEffects = profile.character.activeEffects.filter(effect => {
        if (!effect.expiresAt || new Date(effect.expiresAt) > now) {
          return true;
        } else {
          expiredEffects.push(effect);
          return false;
        }
      });
      
      // Guardar cambios solo si se eliminaron efectos
      if (expiredEffects.length > 0) {
        await profile.save();
        
        // Actualizar canales de perfil si es necesario
        await this.updateProfileChannels(userId, serverId, profile);
      }
      
      return {
        success: true,
        expiredEffects,
        remainingEffects: profile.character.activeEffects,
        character: profile.character
      };
    } catch (error) {
      console.error('Error al actualizar efectos:', error);
      return { success: false, error: error.message };
    }
  }
};

module.exports = characterUtils;