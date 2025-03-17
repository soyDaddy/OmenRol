const Mission = require('../models/Missions').Mission;
const Adventure = require('../models/Missions').Adventure;
const Profile = require('../models/Profile');
const Item = require('../models/Items');
const Skill = require('../models/Skill');

/**
 * Middleware para cargar la misión y el perfil del usuario
 */
exports.loadMissionAndProfile = async (req, res, next) => {
  try {
    const { guildId, missionId } = req.params;
    
    // Cargar el perfil del usuario
    const profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    if (!profile) {
      return res.redirect(`/servers/${guildId}/profile?error=No tienes un perfil en este servidor`);
    }
    
    // Buscar la misión activa
    const activeMissionIndex = profile.progress.activeMissions.findIndex(m => m.missionId === missionId);
    
    if (activeMissionIndex === -1) {
      return res.redirect(`/servers/${guildId}/missions/active?error=No tienes esa misión activa`);
    }
    
    const activeMission = profile.progress.activeMissions[activeMissionIndex];
    
    // Obtener detalles de la misión
    const mission = await Mission.findById(missionId);
    
    if (!mission || mission.serverId !== guildId) {
      return res.redirect(`/servers/${guildId}/missions/active?error=Misión no encontrada`);
    }
    
    // Guardar datos en la solicitud para uso posterior
    req.mission = mission;
    req.profile = profile;
    req.activeMission = activeMission;
    req.activeMissionIndex = activeMissionIndex;
    req.currentStage = mission.stages[activeMission.currentStage];
    
    next();
  } catch (error) {
    console.error('Error al cargar misión y perfil:', error);
    res.redirect(`/servers/${req.params.guildId}/missions/active?error=Error al cargar datos`);
  }
};

/**
 * Maneja la finalización de cualquier tipo de desafío
 */
exports.completeChallenge = async (req, res) => {
  try {
    const { guildId, missionId, type } = req.params;
    const { success, data } = req.body;
    const { profile, mission, activeMission, activeMissionIndex } = req;
    
    // Verificar éxito
    if (!success) {
      return res.json({
        success: false,
        message: 'No has completado el desafío. Inténtalo de nuevo.'
      });
    }
    
    // Marcar la etapa actual como completada
    const currentStage = activeMission.currentStage;
    
    // Verificar si hay más etapas
    if (currentStage < mission.stages.length - 1) {
      // Avanzar a la siguiente etapa
      profile.progress.activeMissions[activeMissionIndex].currentStage++;
      profile.progress.activeMissions[activeMissionIndex].progress = 0;
      
      // Calcular el progreso total de la misión
      const totalProgress = ((currentStage + 1) / mission.stages.length) * 100;
      profile.progress.activeMissions[activeMissionIndex].progress = totalProgress;
    } else {
      // Marcar la misión como completada
      profile.progress.activeMissions[activeMissionIndex].completed = true;
      profile.progress.activeMissions[activeMissionIndex].progress = 100;
    }
    
    // Guardar cambios en el perfil
    await profile.save();
    
    // Verificar si la misión forma parte de alguna aventura activa
    await updateAdventureProgress(guildId, profile, missionId);
    
    return res.json({
      success: true,
      completed: profile.progress.activeMissions[activeMissionIndex].completed,
      nextStage: profile.progress.activeMissions[activeMissionIndex].currentStage,
      message: profile.progress.activeMissions[activeMissionIndex].completed ? 
        '¡Has completado todas las etapas de la misión!' : 
        `Has avanzado a la etapa ${profile.progress.activeMissions[activeMissionIndex].currentStage + 1}`
    });
  } catch (error) {
    console.error('Error al completar desafío:', error);
    res.status(500).json({ error: 'Error al procesar el desafío' });
  }
};

/**
 * Maneja la reclamación de recompensas
 */
exports.claimRewards = async (req, res) => {
  try {
    const { guildId, missionId } = req.params;
    const { profile, mission, activeMission, activeMissionIndex } = req;
    
    // Verificar que la misión esté completada
    if (!activeMission.completed) {
      return res.status(400).json({ error: 'Esta misión no está completada' });
    }
    
    // Preparar recompensas
    const rewards = {
      experience: 0,
      currency: 0,
      items: [],
      skills: []
    };
    
    // Aplicar experiencia
    if (mission.rewards.experience > 0) {
      profile.character.experience += mission.rewards.experience;
      rewards.experience = mission.rewards.experience;
      
      // Verificar si sube de nivel
      const oldLevel = profile.character.level;
      
      // Fórmula de nivel: cada nivel requiere un 20% más de experiencia que el anterior
      let expRequired = 100;
      let currentLevel = 1;
      let remainingExp = profile.character.experience;
      
      while (remainingExp >= expRequired) {
        remainingExp -= expRequired;
        currentLevel++;
        expRequired = Math.floor(expRequired * 1.2);
      }
      
      profile.character.level = currentLevel;
      
      if (currentLevel > oldLevel) {
        rewards.levelUp = {
          from: oldLevel,
          to: currentLevel
        };
      }
    }
    
    // Aplicar monedas
    if (mission.rewards.currency > 0) {
      profile.character.currency += mission.rewards.currency;
      rewards.currency = mission.rewards.currency;
      
      // Actualizar estadísticas
      profile.stats.totalCurrencyEarned += mission.rewards.currency;
    }
    
    // Aplicar items
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
              uses: item.maxUses > 0 ? item.maxUses : null,
              acquiredAt: new Date()
            });
          }
          
          rewards.items.push({
            name: item.name,
            quantity: rewardItem.quantity,
            item: {
              id: item._id,
              name: item.name,
              type: item.type
            }
          });
          
          // Actualizar estadísticas
          profile.stats.itemsAcquired += rewardItem.quantity;
        }
      }
    }
    
    // Aplicar habilidades
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
              skill: {
                id: skill._id,
                name: skill.name,
                category: skill.category
              }
            });
            
            // Actualizar estadísticas
            profile.stats.skillsLearned += 1;
          }
        }
      }
    }
    
    // Mover la misión de activas a completadas
    profile.progress.completedMissions.push({
      missionId: missionId,
      completedAt: new Date(),
      rewards: {
        experience: rewards.experience,
        currency: rewards.currency,
        items: rewards.items.map(item => ({
          itemId: item.item.id,
          quantity: item.quantity
        }))
      }
    });
    
    // Eliminar la misión de activas
    profile.progress.activeMissions.splice(activeMissionIndex, 1);
    
    // Actualizar estadísticas de misiones
    profile.stats.quests.completed += 1;
    profile.stats.missionsCompleted += 1;
    profile.stats.totalExperienceEarned += rewards.experience;
    
    // Verificar si la misión forma parte de alguna aventura
    const adventureUpdates = await updateAdventureProgress(guildId, profile, missionId);
    
    // Guardar cambios en el perfil
    await profile.save();
    
    res.json({
      success: true,
      rewards,
      adventureUpdates
    });
  } catch (error) {
    console.error('Error al reclamar recompensas:', error);
    res.status(500).json({ error: 'Error al reclamar recompensas' });
  }
};

/**
 * Actualiza el progreso de las aventuras cuando se completa una misión
 */
async function updateAdventureProgress(guildId, profile, missionId) {
  try {
    // Buscar aventuras activas que contengan esta misión
    const adventures = await Adventure.find({
      serverId: guildId,
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
          profile.progress.activeAdventures[activeAdventureIndex].completedMissions.push(missionId);
          
          // Verificar si se ha completado la aventura
          const requiredMissions = adventure.missions
            .filter(m => m.required)
            .map(m => m.missionId);
            
          const allRequiredCompleted = requiredMissions.every(m => 
            profile.progress.activeAdventures[activeAdventureIndex].completedMissions.includes(m)
          );
          
          if (allRequiredCompleted) {
            profile.progress.activeAdventures[activeAdventureIndex].completed = true;
            adventureUpdates.push({
              title: adventure.title,
              id: adventure._id,
              completed: true
            });
          } else {
            const remainingRequired = requiredMissions.filter(
              m => !profile.progress.activeAdventures[activeAdventureIndex].completedMissions.includes(m)
            ).length;
            
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
    
    return adventureUpdates;
  } catch (error) {
    console.error('Error al actualizar progreso de aventuras:', error);
    return [];
  }
}

/**
 * Maneja la finalización de una aventura y reclama recompensas
 */
exports.completeAdventure = async (req, res) => {
  try {
    const { guildId, adventureId } = req.params;
    
    // Buscar el perfil del usuario
    const profile = await Profile.findOne({
      userId: req.user.id,
      serverId: guildId
    });
    
    if (!profile) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }
    
    // Buscar la aventura activa
    const activeAdventureIndex = profile.progress.activeAdventures.findIndex(a => a.adventureId === adventureId);
    
    if (activeAdventureIndex === -1) {
      return res.status(404).json({ error: 'Aventura no encontrada en tu perfil' });
    }
    
    const activeAdventure = profile.progress.activeAdventures[activeAdventureIndex];
    
    if (!activeAdventure.completed) {
      return res.status(400).json({ error: 'Esta aventura no está completada' });
    }
    
    // Obtener detalles de la aventura
    const adventure = await Adventure.findById(adventureId);
    
    if (!adventure || adventure.serverId !== guildId) {
      return res.status(404).json({ error: 'Aventura no encontrada' });
    }
    
    // Preparar recompensas
    const rewards = {
      experience: 0,
      currency: 0,
      items: [],
      skills: []
    };
    
    // Aplicar experiencia
    if (adventure.completionRewards.experience > 0) {
      profile.character.experience += adventure.completionRewards.experience;
      rewards.experience = adventure.completionRewards.experience;
      
      // Verificar si sube de nivel (mismo código que en claimRewards)
      const oldLevel = profile.character.level;
      let expRequired = 100;
      let currentLevel = 1;
      let remainingExp = profile.character.experience;
      
      while (remainingExp >= expRequired) {
        remainingExp -= expRequired;
        currentLevel++;
        expRequired = Math.floor(expRequired * 1.2);
      }
      
      profile.character.level = currentLevel;
      
      if (currentLevel > oldLevel) {
        rewards.levelUp = {
          from: oldLevel,
          to: currentLevel
        };
      }
      
      // Actualizar estadísticas
      profile.stats.totalExperienceEarned += adventure.completionRewards.experience;
    }
    
    // Aplicar monedas
    if (adventure.completionRewards.currency > 0) {
      profile.character.currency += adventure.completionRewards.currency;
      rewards.currency = adventure.completionRewards.currency;
      
      // Actualizar estadísticas
      profile.stats.totalCurrencyEarned += adventure.completionRewards.currency;
    }
    
    // Aplicar items
    if (adventure.completionRewards.items && adventure.completionRewards.items.length > 0) {
      for (const rewardItem of adventure.completionRewards.items) {
        const item = await Item.findById(rewardItem.itemId);
        
        if (item) {
          // Añadir el item al inventario (mismo código que en claimRewards)
          const existingItemIndex = profile.character.inventory.findIndex(i => i.itemId === rewardItem.itemId);
          
          if (existingItemIndex !== -1) {
            profile.character.inventory[existingItemIndex].quantity += rewardItem.quantity;
          } else {
            profile.character.inventory.push({
              itemId: rewardItem.itemId,
              quantity: rewardItem.quantity,
              equipped: false,
              uses: item.maxUses > 0 ? item.maxUses : null,
              acquiredAt: new Date()
            });
          }
          
          rewards.items.push({
            name: item.name,
            quantity: rewardItem.quantity,
            item: {
              id: item._id,
              name: item.name,
              type: item.type
            }
          });
          
          // Actualizar estadísticas
          profile.stats.itemsAcquired += rewardItem.quantity;
        }
      }
    }
    
    // Aplicar habilidades
    if (adventure.completionRewards.skills && adventure.completionRewards.skills.length > 0) {
      for (const skillId of adventure.completionRewards.skills) {
        const skill = await Skill.findById(skillId);
        
        if (skill) {
          // Verificar si ya tiene la habilidad (mismo código que en claimRewards)
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
              skill: {
                id: skill._id,
                name: skill.name,
                category: skill.category
              }
            });
            
            // Actualizar estadísticas
            profile.stats.skillsLearned += 1;
          }
        }
      }
    }
    
    // Mover la aventura de activas a completadas
    profile.progress.completedAdventures.push({
      adventureId: adventureId,
      completedAt: new Date(),
      rewards: {
        experience: rewards.experience,
        currency: rewards.currency,
        items: rewards.items.map(item => ({
          itemId: item.item.id,
          quantity: item.quantity
        }))
      }
    });
    
    // Eliminar la aventura de activas
    profile.progress.activeAdventures.splice(activeAdventureIndex, 1);
    
    // Actualizar estadísticas
    profile.stats.adventuresCompleted += 1;
    
    // Guardar cambios en el perfil
    await profile.save();
    
    res.json({
      success: true,
      rewards
    });
  } catch (error) {
    console.error('Error al completar aventura:', error);
    res.status(500).json({ error: 'Error al completar la aventura' });
  }
};