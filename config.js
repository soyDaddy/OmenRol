require('dotenv').config();

module.exports = {
  bot: {
    token: process.env.DISCORD_BOT_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    prefix: process.env.BOT_PREFIX || '!',
    defaultLanguage: process.env.DEFAULT_LANGUAGE || 'es',
    developers: (process.env.DEVELOPERS || '').split(',')
  },
  
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/TestDB',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  
  dashboard: {
    port: process.env.DASHBOARD_PORT || 3000,
    host: process.env.DASHBOARD_HOST || 'localhost',
    callbackURL: process.env.DASHBOARD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
    sessionSecret: process.env.SESSION_SECRET || 'supersecret',
    cookieMaxAge: 1000 * 60 * 60 * 24 * 7, // 1 semana
    adminUsers: (process.env.ADMIN_USERS || '').split(',')
  },
  
  roleplay: {
    defaultRaces: ['Humano', 'Elfo', 'Enano', 'Orco', 'Tiefling'],
    defaultClasses: ['Guerrero', 'Mago', 'Ladrón', 'Clérigo', 'Bardo'],
    startingCurrency: 100,
    maxLevel: 100,
    expCurve: 'medium' // 'easy', 'medium', 'hard'
  },
  
  version: '1.0.0',
  maintenance: false
};