const { app, server } = require("./dashboard/index"); // Importar la Dashboard
const client = require("./bot/index"); // Importar el bot
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const I18n = require("@soydaddy/i18n");

// Función recursiva para cargar archivos YAML
function loadTranslations(dir) {
  const translations = {};
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.lstatSync(itemPath);

    if (stat.isDirectory()) {
      translations[item] = loadTranslations(itemPath); // Cargar recursivamente
    } else if (item.endsWith(".yml")) {
      const data = fs.readFileSync(itemPath, { encoding: "utf8" });
      const name = path.basename(item, ".yml");
      translations[name] = YAML.parse(data);
    }
  }

  return translations;
}

// Cargar archivos de idiomas
const locales = {};
const localesPath = path.join(__dirname, "locales");
const langDirs = fs.readdirSync(localesPath);

for (const langDir of langDirs) {
  const langPath = path.join(localesPath, langDir);
  if (fs.lstatSync(langPath).isDirectory()) {
    locales[langDir] = loadTranslations(langPath);
  }
}

// Inicializar i18n
const i18n = new I18n("en-US", locales);
global.i18n = i18n;

async function startServices() {
  try {
    console.log("[SYSTEM] Iniciando servicios...");

    // Iniciar Dashboard (ya se inicia al importar `index.js` de dashboard)
    server.on("listening", () => {
      console.log(
        `[DASHBOARD] Disponible en http://${app.get("config")?.host}:${app.get("config")?.port}`
      );
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