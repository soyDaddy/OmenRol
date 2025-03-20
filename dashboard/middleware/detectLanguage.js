const i18n = require('@soydaddy/i18n'); // Tu sistema de traducciones
const locales = require('../../locales'); // Las traducciones cargadas

function detectLanguage(req, res, next) {
  let lang = 'en-US'; 

  if (req.query.lang && locales[req.query.lang]) {
    lang = req.query.lang;
  } else if (req.user.locale && locales[req.user.locale]) {
    lang = req.user.locale;
  } else if (req.headers['accept-language']) {
    const browserLang = req.headers['accept-language'].split(',')[0].split('-')[0];
    if (locales[browserLang]) {
      lang = browserLang;
    }
  }

  // Asignar el idioma a la solicitud
  req.lang = lang;
  req.t = (key) => i18n.getMessage(lang, key); // Función de traducción

  next();
}

module.exports = detectLanguage;