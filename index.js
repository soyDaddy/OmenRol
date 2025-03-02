const { app, server } = require("./dashboard/index"); // Importar la Dashboard
const client = require("./bot/index"); // Importar el bot

async function startServices() {
  try {
    console.log("[SYSTEM] Iniciando servicios...");

    // Iniciar Dashboard (ya se inicia al importar `index.js` de dashboard)
    server.on("listening", () => {
      console.log(`[DASHBOARD] Disponible en http://${app.get("config")?.host}:${app.get("config")?.port}`);
    });

    // Iniciar Bot (ya se inicia al importar `index.js` de bot)
    client.once("ready", () => {
      console.log(`[BOT] Conectado como ${client.user.tag}`);
    });

    console.log("[SYSTEM] Todos los servicios iniciados correctamente");
  } catch (error) {
    console.error("[ERROR] Ha ocurrido un problema:", error);
    process.exit(1);
  }
}

// Ejecutar ambos servicios
startServices();
