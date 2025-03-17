document.addEventListener('DOMContentLoaded', function() {
  // 1. Variables globales y referencias a elementos del DOM
  const stagesContainer = document.getElementById('stages-container');
  const addStageButton = document.getElementById('add-stage');
  let stageCounter = 0;
  
  // 2. Definición de tipos de tareas (taskTypes)
  const taskTypes = {
    'custom': {
      name: 'Personalizada',
      description: 'Tarea personalizada que el usuario puede completar manualmente',
      fields: [
        { type: 'number', name: 'targetAmount', label: 'Cantidad objetivo', default: 1, 
          help: 'Cantidad total necesaria para completar la tarea (por defecto: 1)' }
      ]
    },
    'combat': {
      name: 'Combate',
      description: 'Enfrentamiento con enemigos',
      fields: [
        { type: 'text', name: 'enemyName', label: 'Nombre del enemigo', required: true },
        { type: 'number', name: 'enemyLevel', label: 'Nivel del enemigo', default: 1 },
        { type: 'number', name: 'enemyHealth', label: 'Salud del enemigo', default: 100 },
        { type: 'select', name: 'enemyType', label: 'Tipo de enemigo', 
          options: [
            { value: 'humanoid', text: 'Humanoide' },
            { value: 'beast', text: 'Bestia' },
            { value: 'undead', text: 'No-muerto' },
            { value: 'elemental', text: 'Elemental' },
            { value: 'demon', text: 'Demonio' },
            { value: 'construct', text: 'Constructo' },
            { value: 'dragon', text: 'Dragón' }
          ]
        },
        { type: 'textarea', name: 'enemyDescription', label: 'Descripción del enemigo' },
        { type: 'number', name: 'rewardExperience', label: 'Experiencia por victoria', default: 50 },
        { type: 'number', name: 'rewardCurrency', label: 'Monedas por victoria', default: 10 }
      ]
    },
    'collection': {
      name: 'Colección',
      description: 'Recolectar objetos o recursos',
      fields: [
        { type: 'text', name: 'itemName', label: 'Nombre del objeto', required: true },
        { type: 'number', name: 'quantity', label: 'Cantidad necesaria', default: 5 },
        { type: 'text', name: 'location', label: 'Ubicación de los objetos' },
        { type: 'textarea', name: 'collectionDescription', label: 'Detalles de la colección' }
      ]
    },
    'dialogue': {
      name: 'Diálogo',
      description: 'Conversación con un NPC',
      fields: [
        { type: 'text', name: 'npcName', label: 'Nombre del NPC', required: true },
        { type: 'textarea', name: 'dialogueScript', label: 'Guión del diálogo', required: true, help: 'Usa los prefijos emoji para estructurar el diálogo: 📜(Narrador), 🧙‍♂️(NPC), 🗣(Opciones), ❌(Final)' },
        { type: 'custom', name: 'dialogHelp', component: 'dialogGuidePanel', label: 'Guía de formato de diálogo' },
        { type: 'text', name: 'result', label: 'Resultado del diálogo', help: 'Etiqueta que identifica el resultado (ej: "información", "acepta_misión")' }
      ]
    },
    'puzzle': {
      name: 'Puzzle/Acertijo',
      description: 'Resolver un puzzle o acertijo',
      fields: [
        { type: 'select', name: 'puzzleType', label: 'Tipo de puzzle', 
          options: [
            { value: 'riddle', text: 'Acertijo' },
            { value: 'matching', text: 'Emparejamiento' },
            { value: 'sorting', text: 'Ordenamiento' },
            { value: 'cipher', text: 'Cifrado' }
          ],
          onChange: 'updatePuzzleFields' 
        },
        { type: 'textarea', name: 'puzzleContent', label: 'Contenido del puzzle', 
          help: 'El texto del acertijo o instrucciones del puzzle' },
        { type: 'textarea', name: 'solution', label: 'Solución', 
          help: 'La respuesta correcta al puzzle' },
        { type: 'number', name: 'attempts', label: 'Intentos permitidos', default: 3 },
        { type: 'textarea', name: 'hint', label: 'Pista (opcional)' },
        { type: 'number', name: 'timeLimit', label: 'Límite de tiempo (segundos)', default: 0,
          help: '0 = sin límite de tiempo' },
        
        // Campos específicos para diferentes tipos de puzzles
        { type: 'textarea', name: 'pairsList', label: 'Pares para emparejamiento', 
          show: 'puzzleType === "matching"',
          help: 'Un par por línea, separados por | (ej: Pregunta|Respuesta)' },
        
        { type: 'textarea', name: 'itemsList', label: 'Items para ordenar', 
          show: 'puzzleType === "sorting"',
          help: 'Un item por línea en el orden correcto' },
        
        { type: 'textarea', name: 'instructions', label: 'Instrucciones', 
          show: 'puzzleType === "matching" || puzzleType === "sorting"' }
      ]
    },
    'minigame': {
      name: 'Minijuego',
      description: 'Completar un minijuego interactivo',
      fields: [
        { type: 'select', name: 'gameType', label: 'Tipo de minijuego', 
          options: [
            { value: 'quiz', text: 'Cuestionario' },
            { value: 'memory', text: 'Memoria' },
            { value: 'reaction', text: 'Tiempo de reacción' }
          ],
          onChange: 'updateMinigameFields'
        },
        
        // Campos para cuestionario
        { type: 'textarea', name: 'questions', label: 'Preguntas y respuestas', 
          show: 'gameType === "quiz"',
          help: 'Formato: Pregunta|Opción A|Opción B|Opción C|Opción D|Correcta (A/B/C/D)' },
        { type: 'number', name: 'passingScore', label: 'Porcentaje para aprobar', 
          show: 'gameType === "quiz"', default: 70 },
        { type: 'checkbox', name: 'randomOrder', label: 'Orden aleatorio', 
          show: 'gameType === "quiz"', default: true },
          
        // Campos para juego de memoria
        { type: 'textarea', name: 'cards', label: 'Pares de cartas', 
          show: 'gameType === "memory"',
          help: 'Formato: Texto frontal|Texto trasero' },
        { type: 'number', name: 'pairCount', label: 'Número de pares a mostrar', 
          show: 'gameType === "memory"', default: 6 },
          
        // Campos para juego de reacción
        { type: 'number', name: 'rounds', label: 'Número de rondas', 
          show: 'gameType === "reaction"', default: 5 },
        { type: 'select', name: 'difficulty', label: 'Dificultad', 
          show: 'gameType === "reaction"',
          options: [
            { value: 'easy', text: 'Fácil' },
            { value: 'medium', text: 'Media' },
            { value: 'hard', text: 'Difícil' }
          ] },
        { type: 'number', name: 'targetTime', label: 'Tiempo objetivo (ms)', 
          show: 'gameType === "reaction"', default: 500 },
          
        // Campos comunes para todos los minijuegos
        { type: 'number', name: 'timeLimit', label: 'Límite de tiempo (segundos)', default: 0,
          help: '0 = sin límite de tiempo' }
      ]
    }
  };
  
  // Función para crear un campo de formulario
  function createFormField(field, value = null, stageId) {
  const fieldId = `stage-${stageId}-${field.name}`;
  let inputField = '';
  
  // Establecer valor predeterminado
  let fieldValue = value !== null ? value : (field.default !== undefined ? field.default : '');
  
  // Condición de visualización si existe
  const displayCondition = field.show ? `data-show-condition="${field.show}"` : '';
  
  // Para componentes personalizados
  if (field.type === 'custom') {
    if (field.component === 'dialogGuidePanel') {
      return createDialogGuidePanel(field, fieldId);
    }
    return '';
  }
  
  switch (field.type) {
    case 'text':
      inputField = `<input type="text" id="${fieldId}" name="stages[challengeData][${field.name}][]" 
                    ${field.required ? 'required' : ''} value="${fieldValue}" 
                    class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md">`;
      break;
      
    case 'number':
      inputField = `<input type="number" id="${fieldId}" name="stages[challengeData][${field.name}][]" 
                    ${field.required ? 'required' : ''} value="${fieldValue}" 
                    class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md">`;
      break;
      
    case 'textarea':
      inputField = `<textarea id="${fieldId}" name="stages[challengeData][${field.name}][]" 
                    ${field.required ? 'required' : ''} rows="4" 
                    class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md">${fieldValue}</textarea>`;
      break;
      
    case 'select':
      inputField = `<select id="${fieldId}" name="stages[challengeData][${field.name}][]" 
                    ${field.required ? 'required' : ''} 
                    ${field.onChange ? `data-onchange="${field.onChange}"` : ''}
                    class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md">`;
                    
      field.options.forEach(option => {
        const selected = fieldValue === option.value ? 'selected' : '';
        inputField += `<option value="${option.value}" ${selected}>${option.text}</option>`;
      });
      
      inputField += `</select>`;
      break;
      
    case 'checkbox':
      const checked = fieldValue ? 'checked' : '';
      inputField = `<div class="flex items-center h-5">
                      <input id="${fieldId}" name="stages[challengeData][${field.name}][]" type="checkbox" ${checked}
                      class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded">
                    </div>`;
      break;
  }
  
  // Crear el contenedor completo del campo
  return `
    <div class="mb-4 challenge-field" ${displayCondition}>
      <label for="${fieldId}" class="block text-sm font-medium text-gray-700">
        ${field.label} ${field.required ? '*' : ''}
      </label>
      <div class="mt-1">
        ${inputField}
      </div>
      ${field.help ? `<p class="mt-1 text-xs text-gray-500">${field.help}</p>` : ''}
    </div>
  `;
}
  
  // Función para crear una tarjeta de etapa
  if (addStageButton) {
    addStageButton.addEventListener('click', function() {
      // Crear una nueva tarjeta de etapa
      const newStage = createStageCard();
      stagesContainer.appendChild(newStage);
      updateStageOrder();
      
      // Hacer scroll hasta la nueva etapa
      newStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  
  // Cargar etapas existentes al iniciar (si las hay)
  if (stagesContainer && window.existingStages && window.existingStages.length > 0) {
    window.existingStages.forEach(stage => {
      const stageCard = createStageCard(stage);
      stagesContainer.appendChild(stageCard);
    });
    updateStageOrder();
  }
  
  // Añadir validación al formulario principal
  const missionForm = document.querySelector('form');
  if (missionForm) {
    missionForm.addEventListener('submit', function(event) {
      if (!validateMissionForm(this)) {
        event.preventDefault();
      }
    });
  }
  
  /**
   * Crea un panel de ayuda para el usuario con un ejemplo de cómo 
   * debe escribir un diálogo para una etapa de tipo diálogo.
   * 
   * @param {Object} field Campo de etapa con la información de la ayuda
   * @param {String} fieldId ID del campo en el formulario
   * @returns {String} Código HTML del panel de ayuda
   */
  function createDialogGuidePanel(field, fieldId) {
    return `
      <div class="mb-4 mt-2 p-3 bg-gray-50 rounded border border-gray-200 challenge-field">
        <h5 class="font-medium text-gray-700 mb-2">Guía de formato de diálogo</h5>
        <div class="text-sm">
          <p class="mb-1"><strong>📜 Narrador:</strong> Describe escenas o situaciones.</p>
          <p class="mb-1"><strong>🧙‍♂️ NPC:</strong> Diálogo del personaje no jugador.</p>
          <p class="mb-1"><strong>🗣 Opciones:</strong> Define las opciones de respuesta del jugador.</p>
          <p class="mb-1"><strong>❌ Final:</strong> Marca el final de una rama de diálogo.</p>
          <p class="mt-2 text-xs text-gray-500">Ejemplo:</p>
          <pre class="bg-gray-100 p-2 text-xs mt-1 rounded">
  📜 El tabernero limpia un vaso mientras te mira fijamente.
  🧙‍♂️ Tabernero: ¿Qué te trae por estos lares, forastero?
  🗣 Estoy buscando información sobre la cueva del dragón.
  🗣 Solo estoy de paso, busco un lugar para descansar.
  🗣 No es asunto tuyo. (Hostil)
          </pre>
        </div>
      </div>
    `;
  }
  
  function createStageCard(stage = null) {
    const stageId = stageCounter++;
    const isNewStage = stage === null;
    
    // Valores predeterminados o existentes
    const stageName = stage ? stage.name : '';
    const stageDescription = stage ? stage.description : '';
    const stageTaskType = stage ? stage.taskType : 'custom';
    const stageTargetAmount = stage ? stage.targetAmount : 1;
    const stageCompletionMessage = stage ? stage.completionMessage : '';
    
    const stageCard = document.createElement('div');
    stageCard.className = 'stage-card bg-white rounded-lg shadow mb-6 border border-gray-200 overflow-hidden';
    stageCard.dataset.stageId = stageId;
    
    // Título de la etapa con botonera
    const header = document.createElement('div');
    header.className = 'border-b border-gray-200 bg-gray-50 px-4 py-3 sm:px-6 flex justify-between items-center';
    header.innerHTML = `
      <h3 class="text-lg leading-6 font-medium text-gray-900 stage-title">
        ${isNewStage ? 'Nueva etapa' : stageName}
      </h3>
      <div class="flex space-x-2">
        <button type="button" class="collapse-stage-btn inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
        <button type="button" class="move-stage-up-btn inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-gray-500 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" />
          </svg>
        </button>
        <button type="button" class="move-stage-down-btn inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-gray-500 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
        <button type="button" class="delete-stage-btn inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    `;
    
    // Contenido de la etapa
    const body = document.createElement('div');
    body.className = 'stage-content p-6';
    
    let bodyContent = `
      <div class="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
        <div class="sm:col-span-4">
          <label for="stage-${stageId}-name" class="block text-sm font-medium text-gray-700">
            Nombre de la etapa *
          </label>
          <div class="mt-1">
            <input type="text" id="stage-${stageId}-name" name="stages[name][]" required value="${stageName}" 
              class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md stage-name-input">
          </div>
        </div>
        
        <div class="sm:col-span-2">
          <label for="stage-${stageId}-task-type" class="block text-sm font-medium text-gray-700">
            Tipo de tarea *
          </label>
          <div class="mt-1">
            <select id="stage-${stageId}-task-type" name="stages[taskType][]" required 
              class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md task-type-select">`;
              
    // Añadir opciones de tipos de tarea
    for (const [type, config] of Object.entries(taskTypes)) {
      const selected = stageTaskType === type ? 'selected' : '';
      bodyContent += `<option value="${type}" ${selected}>${config.name}</option>`;
    }
              
    bodyContent += `
            </select>
          </div>
          <p class="mt-1 text-xs text-gray-500 task-type-description">${taskTypes[stageTaskType].description}</p>
        </div>
        
        <div class="sm:col-span-6">
          <label for="stage-${stageId}-description" class="block text-sm font-medium text-gray-700">
            Descripción de la etapa *
          </label>
          <div class="mt-1">
            <textarea id="stage-${stageId}-description" name="stages[description][]" rows="3" required
              class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md">${stageDescription}</textarea>
          </div>
        </div>
        
        <div class="sm:col-span-6">
          <label for="stage-${stageId}-completion-message" class="block text-sm font-medium text-gray-700">
            Mensaje de completado
          </label>
          <div class="mt-1">
            <textarea id="stage-${stageId}-completion-message" name="stages[completionMessage][]" rows="2"
              class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md">${stageCompletionMessage}</textarea>
          </div>
          <p class="mt-1 text-xs text-gray-500">Este mensaje se mostrará al jugador cuando complete esta etapa.</p>
        </div>
        
        <div class="sm:col-span-2">
          <label for="stage-${stageId}-target-amount" class="block text-sm font-medium text-gray-700">
            Cantidad objetivo
          </label>
          <div class="mt-1">
            <input type="number" id="stage-${stageId}-target-amount" name="stages[targetAmount][]" min="1" value="${stageTargetAmount}"
              class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md">
          </div>
          <p class="mt-1 text-xs text-gray-500">Cuántas unidades se necesitan para completar (ej: matar 5 enemigos).</p>
        </div>
      </div>
      
      <div class="mt-6 challenge-config border-t border-gray-200 pt-4">
        <h4 class="text-md font-medium text-gray-900 mb-4">Configuración específica</h4>
        <div class="challenge-fields">`;
    
    // Generar campos específicos según el tipo de tarea
    if (taskTypes[stageTaskType] && taskTypes[stageTaskType].fields) {
      const fields = taskTypes[stageTaskType].fields;
      fields.forEach(field => {
        let fieldValue = null;
        if (stage && stage.challengeData && stage.challengeData[field.name] !== undefined) {
          fieldValue = stage.challengeData[field.name];
        }
        bodyContent += createFormField(field, fieldValue, stageId);
      });
    }
    
    bodyContent += `
        </div>
      </div>
    `;
    
    body.innerHTML = bodyContent;
    
    // Unir todo
    stageCard.appendChild(header);
    stageCard.appendChild(body);
    
    // Añadir eventos
    setTimeout(() => {
      // Colapsar/expandir
      const collapseBtn = stageCard.querySelector('.collapse-stage-btn');
      collapseBtn.addEventListener('click', function() {
        const content = stageCard.querySelector('.stage-content');
        if (content.style.display === 'none') {
          content.style.display = 'block';
          this.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>`;
        } else {
          content.style.display = 'none';
          this.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" />
          </svg>`;
        }
      });
      
      // Eliminar etapa
      const deleteBtn = stageCard.querySelector('.delete-stage-btn');
      deleteBtn.addEventListener('click', function() {
        if (confirm('¿Estás seguro de que quieres eliminar esta etapa?')) {
          stagesContainer.removeChild(stageCard);
          updateStageOrder();
        }
      });
      
      // Mover etapa hacia arriba
      const moveUpBtn = stageCard.querySelector('.move-stage-up-btn');
      moveUpBtn.addEventListener('click', function() {
        const prevStage = stageCard.previousElementSibling;
        if (prevStage) {
          stagesContainer.insertBefore(stageCard, prevStage);
          updateStageOrder();
        }
      });
      
      // Mover etapa hacia abajo
      const moveDownBtn = stageCard.querySelector('.move-stage-down-btn');
      moveDownBtn.addEventListener('click', function() {
        const nextStage = stageCard.nextElementSibling;
        if (nextStage) {
          stagesContainer.insertBefore(nextStage, stageCard);
          updateStageOrder();
        }
      });
      
      // Actualizar título cuando se cambia el nombre
      const nameInput = stageCard.querySelector('.stage-name-input');
      nameInput.addEventListener('input', function() {
        const title = stageCard.querySelector('.stage-title');
        title.textContent = this.value || 'Nueva etapa';
      });
      
      // Cambiar configuración cuando cambia el tipo de tarea
      const taskTypeSelect = stageCard.querySelector('.task-type-select');
      taskTypeSelect.addEventListener('change', function() {
        const selectedType = this.value;
        const descriptionElem = stageCard.querySelector('.task-type-description');
        const fieldsContainer = stageCard.querySelector('.challenge-fields');
        
        // Actualizar descripción
        if (taskTypes[selectedType]) {
          descriptionElem.textContent = taskTypes[selectedType].description;
        } else {
          descriptionElem.textContent = '';
        }
        
        // Limpiar y generar los campos específicos
        fieldsContainer.innerHTML = '';
        if (taskTypes[selectedType] && taskTypes[selectedType].fields) {
          const fields = taskTypes[selectedType].fields;
          fields.forEach(field => {
            fieldsContainer.innerHTML += createFormField(field, null, stageId);
          });
          
          // Si es un diálogo, añadir botón de vista previa
          if (selectedType === 'dialogue') {
            const previewButton = document.createElement('button');
            previewButton.type = 'button';
            previewButton.className = 'mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 dialogue-preview-btn';
            previewButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" /></svg> Previsualizar diálogo';
            
            previewButton.addEventListener('click', function() {
              const scriptTextarea = stageCard.querySelector('[name="stages[challengeData][dialogueScript][]"]');
              if (scriptTextarea && scriptTextarea.value) {
                showDialoguePreview(scriptTextarea.value);
              } else {
                alert('Por favor, escribe un guión de diálogo primero');
              }
            });
            
            fieldsContainer.appendChild(previewButton);
          }
        }
        
        // Configurar los eventos para campos con onChange
        setupChangeHandlers(stageCard);
        
        // Actualizar visibilidad condicional
        updateConditionalFields(stageCard);
      });
      
      // Configurar handlers para campos con onChange
      setupChangeHandlers(stageCard);
      
      // Inicializar visibilidad condicional
      updateConditionalFields(stageCard);
    }, 0);
    
    return stageCard;
  }
  
  // 4. Funciones para gestionar diálogos
  function processDialogueScript(script) {
    const lines = script.split('\n').filter(line => line.trim().length > 0);
    const dialogueTree = {};
    
    let currentNodeId = 'start';
    let currentNode = {
      id: currentNodeId,
      text: '',
      options: []
    };
    
    dialogueTree[currentNodeId] = currentNode;
    
    let nodeCounter = 0;
    let currentSpeaker = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('📜')) {
        // Narración
        const text = line.substring(1).trim();
        currentNode.narrator = true;
        currentNode.text = text;
        
        // Si hay más líneas, crear un nuevo nodo
        if (i < lines.length - 1) {
          const nextNodeId = `node_${++nodeCounter}`;
          currentNode.next = nextNodeId;
          
          currentNodeId = nextNodeId;
          currentNode = {
            id: currentNodeId,
            text: '',
            options: []
          };
          dialogueTree[currentNodeId] = currentNode;
        }
      } else if (line.startsWith('🧙‍♂️') || line.startsWith('🧙') || 
                 line.match(/^[^\:]+\:/) // Persona: formato
      ) {
        // Diálogo de NPC
        let text = '';
        let speaker = '';
        
        if (line.match(/^[^\:]+\:/)) {
          // Formato "Persona: Texto"
          const parts = line.split(':', 2);
          speaker = parts[0].trim();
          text = parts[1].trim();
        } else if (line.startsWith('🧙‍♂️') || line.startsWith('🧙')) {
          // Formato con emoji
          const content = line.substring(line.indexOf(' ') + 1).trim();
          if (content.includes(':')) {
            const parts = content.split(':', 2);
            speaker = parts[0].trim();
            text = parts[1].trim();
          } else {
            speaker = 'NPC';
            text = content;
          }
        }
        
        currentSpeaker = speaker;
        currentNode.speaker = speaker;
        currentNode.text = text;
        
        // Si hay más líneas, crear un nuevo nodo
        if (i < lines.length - 1 && !lines[i+1].startsWith('🗣')) {
          const nextNodeId = `node_${++nodeCounter}`;
          currentNode.next = nextNodeId;
          
          currentNodeId = nextNodeId;
          currentNode = {
            id: currentNodeId,
            text: '',
            options: []
          };
          dialogueTree[currentNodeId] = currentNode;
        }
      } else if (line.startsWith('🗣')) {
        // Opción de jugador
        const optionText = line.substring(1).trim();
        const optionNodeId = `node_${++nodeCounter}`;
        
        currentNode.options.push({
          text: optionText,
          next: optionNodeId
        });
        
        dialogueTree[optionNodeId] = {
          id: optionNodeId,
          text: '',
          options: []
        };
      } else if (line.startsWith('❌')) {
        // Final de diálogo
        const endMessage = line.substring(1).trim();
        currentNode.end = true;
        currentNode.outcomeMessage = endMessage || 'Fin de la conversación';
      } else {
        // Texto normal, lo añadimos al texto actual
        if (currentNode.text) {
          currentNode.text += '\n' + line;
        } else {
          currentNode.text = line;
        }
      }
    }
    
    return dialogueTree;
  }
  
  function showDialoguePreview(script) {
    try {
      const dialogueTree = processDialogueScript(script);
      
      // Crear modal de vista previa
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 overflow-y-auto z-50';
      modal.innerHTML = `
        <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          <div class="fixed inset-0 transition-opacity" aria-hidden="true">
            <div class="absolute inset-0 bg-gray-500 opacity-75"></div>
          </div>
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div class="sm:flex sm:items-start">
                <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                  <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Vista previa del diálogo
                  </h3>
                  <div class="border rounded-md border-gray-300 bg-gray-50 h-64 overflow-y-auto mb-4 p-2" id="preview-narrative-container">
                    <!-- Aquí se mostrará la conversación -->
                  </div>
                  <div id="preview-options" class="space-y-2">
                    <!-- Aquí se mostrarán las opciones -->
                  </div>
                </div>
              </div>
            </div>
            <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button type="button" class="close-preview-btn mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // Añadir evento para cerrar modal
      const closeBtn = modal.querySelector('.close-preview-btn');
      closeBtn.addEventListener('click', function() {
        document.body.removeChild(modal);
      });
      
      // Mostrar diálogo inicial
      setTimeout(() => {
        showDialogueNode('start', dialogueTree);
      }, 100);
    } catch (error) {
      alert(`Error al procesar el diálogo: ${error.message}`);
    }
  }  
  
  function showDialogueNode(nodeId, dialogueTree) {
    const node = dialogueTree[nodeId];
    const narrativeContainer = document.getElementById('preview-narrative-container');
    const optionsContainer = document.getElementById('preview-options');
    
    if (!node) {
      narrativeContainer.innerHTML += `
        <div class="bg-red-50 p-3 rounded">
          <p class="text-red-700">Error: Nodo "${nodeId}" no encontrado.</p>
        </div>
      `;
      return;
    }
    
    // Crear elemento narrativo
    const narrativeElement = document.createElement('div');
    narrativeElement.className = 'p-3';
    
    if (node.narrator) {
      // Es una narración
      narrativeElement.innerHTML = `
        <div class="text-gray-700 italic">
          <p>${node.text}</p>
        </div>
      `;
    } else if (node.speaker) {
      // Es diálogo de un personaje
      narrativeElement.innerHTML = `
        <div class="mb-1">
          <span class="font-bold text-indigo-800">${node.speaker}:</span>
        </div>
        <div class="bg-indigo-50 rounded p-3 border-l-4 border-indigo-500">
          <p>${node.text}</p>
        </div>
      `;
    } else {
      // Otro tipo de contenido
      narrativeElement.innerHTML = `
        <div>
          <p>${node.text}</p>
        </div>
      `;
    }
    
    // Agregar al contenedor
    narrativeContainer.appendChild(narrativeElement);
    
    // Limpiar opciones anteriores
    optionsContainer.innerHTML = '';
    
    // Si el nodo es final, mostrar mensaje de fin
    if (node.end) {
      optionsContainer.innerHTML = `
        <div class="bg-green-50 p-3 rounded text-center">
          <p class="text-green-800">Fin del diálogo: ${node.outcomeMessage || 'Conversación completada'}</p>
        </div>
      `;
      return;
    }
    
    // Mostrar opciones si existen
    if (node.options && node.options.length > 0) {
      node.options.forEach(option => {
        const optionButton = document.createElement('button');
        optionButton.className = 'block w-full text-left px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition';
        optionButton.textContent = option.text;
        
        optionButton.addEventListener('click', function() {
          // Mostrar la respuesta del jugador
          const playerResponseElement = document.createElement('div');
          playerResponseElement.className = 'p-3';
          playerResponseElement.innerHTML = `
            <div class="mb-1 text-right">
              <span class="font-bold text-blue-800">Jugador:</span>
            </div>
            <div class="bg-blue-50 rounded p-3 border-r-4 border-blue-500 ml-8">
              <p>${option.text}</p>
            </div>
          `;
          narrativeContainer.appendChild(playerResponseElement);
          
          // Ocultar opciones temporalmente
          optionsContainer.innerHTML = '';
          
          // Mostrar siguiente nodo con retraso para simular conversación
          setTimeout(() => {
            showDialogueNode(option.next, dialogueTree);
          }, 500);
        });
        
        optionsContainer.appendChild(optionButton);
      });
    }
  }  
  
  // 5. Funciones de validación y ordenamiento
  /**
 * Actualiza el orden visual de las etapas
 */
function updateStageOrder() {
  // Actualizar números o posiciones si es necesario
  const stages = stagesContainer.querySelectorAll('.stage-card');
  
  // Desactivar temporalmente botones de mover según posición
  stages.forEach((stage, index) => {
    const moveUpBtn = stage.querySelector('.move-stage-up-btn');
    const moveDownBtn = stage.querySelector('.move-stage-down-btn');
    
    if (index === 0) {
      moveUpBtn.disabled = true;
      moveUpBtn.classList.add('opacity-50');
    } else {
      moveUpBtn.disabled = false;
      moveUpBtn.classList.remove('opacity-50');
    }
    
    if (index === stages.length - 1) {
      moveDownBtn.disabled = true;
      moveDownBtn.classList.add('opacity-50');
    } else {
      moveDownBtn.disabled = false;
      moveDownBtn.classList.remove('opacity-50');
    }
  });
}
  
function validateMissionForm(form) {
  // Verificar que hay al menos una etapa
  const stages = stagesContainer.querySelectorAll('.stage-card');
  if (stages.length === 0) {
    alert('La misión debe tener al menos una etapa');
    return false;
  }
  
  // Verificar que todos los campos requeridos tienen valor
  const requiredFields = form.querySelectorAll('[required]');
  let allValid = true;
  
  requiredFields.forEach(field => {
    if (!field.value.trim()) {
      field.classList.add('border-red-500');
      allValid = false;
      
      // Encontrar la etapa contenedora y expandirla si está colapsada
      const stageCard = field.closest('.stage-card');
      if (stageCard) {
        const content = stageCard.querySelector('.stage-content');
        if (content.style.display === 'none') {
          const collapseBtn = stageCard.querySelector('.collapse-stage-btn');
          collapseBtn.click();
        }
        
        // Hacer scroll hasta el campo
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      field.classList.remove('border-red-500');
    }
  });
  
  if (!allValid) {
    alert('Por favor, completa todos los campos requeridos');
    return false;
  }
  
  // Validaciones específicas por tipo de etapa
  const dialogueStages = Array.from(stages).filter(stage => {
    const taskTypeSelect = stage.querySelector('.task-type-select');
    return taskTypeSelect && taskTypeSelect.value === 'dialogue';
  });
  
  // Validar diálogos
  for (const dialogueStage of dialogueStages) {
    const scriptTextarea = dialogueStage.querySelector('[name="stages[challengeData][dialogueScript][]"]');
    if (scriptTextarea && scriptTextarea.value) {
      try {
        processDialogueScript(scriptTextarea.value);
      } catch (error) {
        alert(`Error en el diálogo de la etapa ${dialogueStage.querySelector('.stage-title').textContent}: ${error.message}`);
        
        // Expandir la etapa si está colapsada
        const content = dialogueStage.querySelector('.stage-content');
        if (content.style.display === 'none') {
          const collapseBtn = dialogueStage.querySelector('.collapse-stage-btn');
          collapseBtn.click();
        }
        
        // Hacer scroll y resaltar el campo
        scriptTextarea.classList.add('border-red-500');
        scriptTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
    }
  }
  
  return true;
}
  
  // 6. Funciones para campos condicionales
function setupChangeHandlers(stageCard) {
  // Encontrar todos los selects que tienen un handler de cambio
  const selectsWithHandler = stageCard.querySelectorAll('select[data-onchange]');
  
  selectsWithHandler.forEach(select => {
    const handlerName = select.dataset.onchange;
    
    select.addEventListener('change', function() {
      if (handlerName === 'updatePuzzleFields') {
        updatePuzzleFields(stageCard, this.value);
      } else if (handlerName === 'updateMinigameFields') {
        updateMinigameFields(stageCard, this.value);
      }
      
      // Actualizar campos condicionales
      updateConditionalFields(stageCard);
    });
  });
}
  
function updateConditionalFields(stageCard) {
  // Encontrar todos los campos con condiciones
  const conditionalFields = stageCard.querySelectorAll('[data-show-condition]');
  
  conditionalFields.forEach(field => {
    const condition = field.dataset.showCondition;
    let show = false;
    
    try {
      // Obtener valores actuales de los campos relevantes
      const matches = condition.match(/(\w+)/g);
      if (matches) {
        const fieldValues = {};
        
        matches.forEach(match => {
          if (match !== 'true' && match !== 'false' && match !== 'null' && 
              match !== 'undefined' && !match.match(/^[0-9]+$/)) {
            
            const fieldSelect = stageCard.querySelector(`[name*="[${match}]"]`);
            if (fieldSelect) {
              fieldValues[match] = fieldSelect.value;
            }
          }
        });
        
        // Evaluar la condición con los valores actuales
        const evalCondition = condition.replace(/(\w+)(?!\()/g, (m) => {
          return fieldValues[m] !== undefined ? `"${fieldValues[m]}"` : m;
        });
        
        show = eval(evalCondition);
      }
    } catch (e) {
      console.error('Error evaluando condición:', condition, e);
      show = false;
    }
    
    // Aplicar visibilidad
    field.style.display = show ? 'block' : 'none';
  });
}

  
function updatePuzzleFields(stageCard, puzzleType) {
  // Implementar lógica para mostrar/ocultar campos específicos del tipo de puzzle
  updateConditionalFields(stageCard);
}
  
function updateMinigameFields(stageCard, gameType) {
  // Implementar lógica para mostrar/ocultar campos específicos del tipo de minijuego
  updateConditionalFields(stageCard);
}

  
  // 7. Funciones para borradores y tooltips
  function saveAutoDraft() {
    // Solo guardar si hay cambios
    if (document.querySelector('form.dirty')) {
      const formData = new FormData(document.querySelector('form'));
      localStorage.setItem('missionDraft', JSON.stringify(Object.fromEntries(formData)));
      console.log('Borrador guardado automáticamente', new Date().toLocaleTimeString());
    }
  }  
  
  function loadDraft() {
    const draft = localStorage.getItem('missionDraft');
    if (draft) {
      try {
        const data = JSON.parse(draft);
        
        // Preguntar al usuario si desea cargar el borrador
        if (confirm('Hay un borrador guardado. ¿Deseas cargarlo?')) {
          // Establecer valores en los campos
          Object.entries(data).forEach(([key, value]) => {
            const field = document.querySelector(`[name="${key}"]`);
            if (field) {
              if (field.type === 'checkbox') {
                field.checked = value;
              } else {
                field.value = value;
              }
            }
          });
          
          console.log('Borrador cargado correctamente');
        }
      } catch (error) {
        console.error('Error al cargar el borrador:', error);
      }
    }
  }
  
  
  function addTooltips() {
    const tooltips = document.querySelectorAll('[data-tooltip]');
    tooltips.forEach(element => {
      const tooltipText = element.dataset.tooltip;
      
      element.addEventListener('mouseenter', function(e) {
        const tooltip = document.createElement('div');
        tooltip.className = 'absolute z-10 bg-black text-white text-xs rounded py-1 px-2 max-w-xs';
        tooltip.textContent = tooltipText;
        tooltip.style.top = `${e.pageY + 10}px`;
        tooltip.style.left = `${e.pageX + 10}px`;
        tooltip.id = 'active-tooltip';
        document.body.appendChild(tooltip);
      });
      
      element.addEventListener('mouseleave', function() {
        const tooltip = document.getElementById('active-tooltip');
        if (tooltip) {
          tooltip.remove();
        }
      });
    });
  }
  
  
  // 8. Inicialización y eventos
  // Añadir evento al botón de añadir etapa
  if (addStageButton) {
    addStageButton.addEventListener('click', function() {
      // Crear una nueva tarjeta de etapa
      const newStage = createStageCard();
      stagesContainer.appendChild(newStage);
      updateStageOrder();
      
      // Hacer scroll hasta la nueva etapa
      newStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  
  // Cargar etapas existentes al iniciar
  if (stagesContainer && window.existingStages && window.existingStages.length > 0) {
    window.existingStages.forEach(stage => {
      const stageCard = createStageCard(stage);
      stagesContainer.appendChild(stageCard);
    });
    updateStageOrder();
  }
  
  // Guardar borrador cada 60 segundos
  setInterval(saveAutoDraft, 60 * 1000);
  
  // Marcar el formulario como "sucio" cuando se hagan cambios
  document.querySelectorAll('form input, form textarea, form select').forEach(field => {
    field.addEventListener('change', function() {
      document.querySelector('form').classList.add('dirty');
    });
  });
  
  // Inicializar tooltips
  addTooltips();
  
  // Intentar cargar borrador al iniciar
  if (document.querySelector('form')) {
    loadDraft();
  }
  
});  // Cierre del DOMContentLoaded