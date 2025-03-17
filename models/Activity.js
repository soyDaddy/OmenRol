const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ActivitySchema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  serverId: {
    type: String,
    required: true,
    index: true
  },
  serverName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['command', 'quest', 'combat', 'levelup', 'item', 'currency'],
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true
  },
  details: {
    type: Schema.Types.Mixed,
    default: {}
  },
  character: {
    type: Schema.Types.Mixed,
    default: null
  },
  rewards: [{
    type: {
      type: String,
      enum: ['currency', 'exp', 'item']
    },
    name: String,
    value: Schema.Types.Mixed,
    quantity: Number
  }],
  success: {
    type: Boolean,
    default: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Método estático para registrar una nueva actividad
ActivitySchema.statics.logActivity = async function(data) {
  try {
    return await this.create(data);
  } catch (error) {
    console.error('Error logging activity:', error);
    return null;
  }
};

// Método estático para obtener actividades filtradas
ActivitySchema.statics.getActivities = async function(userId, filters = {}, page = 1, limit = 20) {
  try {
    const query = { userId };
    
    // Aplicar filtros
    if (filters.server) {
      query.serverId = filters.server;
    }
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.date) {
      const now = new Date();
      switch (filters.date) {
        case 'today':
          query.timestamp = { $gte: new Date(now.setHours(0, 0, 0, 0)) };
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(0, 0, 0, 0);
          const endOfYesterday = new Date(yesterday);
          endOfYesterday.setHours(23, 59, 59, 999);
          query.timestamp = { $gte: yesterday, $lte: endOfYesterday };
          break;
        case 'week':
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          query.timestamp = { $gte: startOfWeek };
          break;
        case 'month':
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          query.timestamp = { $gte: startOfMonth };
          break;
      }
    }
    
    // Ejecutar consulta paginada
    const skip = (page - 1) * limit;
    const activities = await this.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Obtener el total de resultados para paginación
    const total = await this.countDocuments(query);
    
    return {
      activities,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Error getting activities:', error);
    return { activities: [], pagination: { total: 0, page, limit, pages: 0 } };
  }
};

// Método estático para obtener resumen de actividades
ActivitySchema.statics.getActivitySummary = async function(userId) {
  try {
    const summary = {
      totalActivities: await this.countDocuments({ userId }),
      completedQuests: await this.countDocuments({ userId, type: 'quest', success: true }),
      combats: await this.countDocuments({ userId, type: 'combat' }),
      totalCurrency: 0
    };
    
    // Calcular total de monedas ganadas
    const currencyActivities = await this.find({
      userId,
      'rewards.type': 'currency'
    }).lean();
    
    summary.totalCurrency = currencyActivities.reduce((total, activity) => {
      const currencyRewards = activity.rewards.filter(r => r.type === 'currency');
      return total + currencyRewards.reduce((sum, reward) => sum + (reward.value || 0), 0);
    }, 0);
    
    return summary;
  } catch (error) {
    console.error('Error getting activity summary:', error);
    return {
      totalActivities: 0,
      completedQuests: 0,
      combats: 0,
      totalCurrency: 0
    };
  }
};

// Método estático para obtener datos para gráficos
ActivitySchema.statics.getActivityCharts = async function(userId) {
  try {
    // Actividades por tipo
    const typeStats = await this.aggregate([
      { $match: { userId } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Actividades por servidor
    const serverStats = await this.aggregate([
      { $match: { userId } },
      { $group: { _id: { serverId: '$serverId', serverName: '$serverName' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    return {
      byType: typeStats.map(item => ({
        type: item._id,
        count: item.count
      })),
      byServer: serverStats.map(item => ({
        serverId: item._id.serverId,
        serverName: item._id.serverName,
        count: item.count
      }))
    };
  } catch (error) {
    console.error('Error getting activity charts:', error);
    return { byType: [], byServer: [] };
  }
};

module.exports = mongoose.model('Activity', ActivitySchema);