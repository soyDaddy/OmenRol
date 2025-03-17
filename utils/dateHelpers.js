/**
 * Funciones auxiliares para manejar fechas en la aplicación
 */

/**
 * Formatea una fecha para mostrarla de forma relativa al momento actual
 * @param {Date|string} date - La fecha a formatear
 * @returns {string} - Texto formateado (ej: "hace 2 horas", "ayer", etc.)
 */
function formatDateRelative(date) {
    const now = new Date();
    const targetDate = new Date(date);
    const diffMs = now - targetDate;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    // Si es hoy
    if (targetDate.toDateString() === now.toDateString()) {
      if (diffMins < 1) {
        return 'Ahora mismo';
      }
      if (diffMins < 60) {
        return `Hace ${diffMins} ${diffMins === 1 ? 'minuto' : 'minutos'}`;
      }
      return `Hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
    }
    
    // Si es ayer
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (targetDate.toDateString() === yesterday.toDateString()) {
      return 'Ayer';
    }
    
    // Si es esta semana (máximo 6 días atrás)
    if (diffDays < 7) {
      return `Hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
    }
    
    // Más de una semana
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return targetDate.toLocaleDateString('es-ES', options);
  }
  
  /**
   * Agrupa actividades por fecha para mostrarlas en la timeline
   * @param {Array} activities - Lista de actividades
   * @returns {Object} - Objeto con días como claves y arrays de actividades como valores
   */
  function groupActivitiesByDate(activities) {
    if (!activities || activities.length === 0) {
      return {};
    }
    
    const groupedByDate = {};
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toDateString();
    
    activities.forEach(activity => {
      const activityDate = new Date(activity.timestamp);
      const dateString = activityDate.toDateString();
      
      let dateLabel;
      if (dateString === today) {
        dateLabel = 'Hoy';
      } else if (dateString === yesterdayString) {
        dateLabel = 'Ayer';
      } else {
        // Calcular diferencia en días
        const diffDays = Math.floor((now - activityDate) / (1000 * 60 * 60 * 24));
        if (diffDays < 7) {
          dateLabel = `Hace ${diffDays} días`;
        } else {
          const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
          dateLabel = activityDate.toLocaleDateString('es-ES', options);
        }
      }
      
      // Inicializar el arreglo si no existe
      if (!groupedByDate[dateLabel]) {
        groupedByDate[dateLabel] = [];
      }
      
      groupedByDate[dateLabel].push(activity);
    });
    
    return groupedByDate;
  }
  
  /**
   * Obtiene un ícono de FontAwesome según el tipo de actividad
   * @param {string} type - Tipo de actividad
   * @returns {string} - Clase de ícono de FontAwesome
   */
  function getActivityIcon(type) {
    const icons = {
      command: 'fa-terminal',
      quest: 'fa-tasks',
      combat: 'fa-fist-raised',
      levelup: 'fa-level-up-alt',
      item: 'fa-box',
      currency: 'fa-coins'
    };
    
    return icons[type] || 'fa-circle';
  }
  
  /**
   * Obtiene un color según el tipo de actividad
   * @param {string} type - Tipo de actividad
   * @param {boolean} success - Si la actividad fue exitosa
   * @returns {string} - Clase de color de Tailwind
   */
  function getActivityColor(type, success = true) {
    if (!success) {
      return 'bg-gray-400'; // Actividad fallida
    }
    
    const colors = {
      command: 'bg-gray-500',
      quest: 'bg-green-500',
      combat: 'bg-red-500',
      levelup: 'bg-indigo-500',
      item: 'bg-blue-500',
      currency: 'bg-yellow-500'
    };
    
    return colors[type] || 'bg-gray-500';
  }
  
  module.exports = {
    formatDateRelative,
    groupActivitiesByDate,
    getActivityIcon,
    getActivityColor
  };