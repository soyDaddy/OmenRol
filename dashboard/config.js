const config = require('../config');

module.exports = {
  // Configuración del servidor web
  port: config.dashboard.port,
  host: config.dashboard.host,
  
  // Configuración de Discord OAuth2
  clientId: config.bot.clientId,
  clientSecret: config.bot.clientSecret,
  callbackURL: config.dashboard.callbackURL,

  // Configuración de administración
  adminUsers: config.dashboard.adminUsers,
  
  // Configuración de sesión
  session: {
    secret: config.dashboard.sessionSecret,
    cookie: {
      maxAge: config.dashboard.cookieMaxAge
    },
    resave: false,
    saveUninitialized: false
  },
  
  // URLs de Discord
  discord: {
    tokenURL: 'https://discord.com/api/oauth2/token',
    userURL: 'https://discord.com/api/users/@me',
    guildURL: 'https://discord.com/api/users/@me/guilds',
    botGuildsURL: 'https://discord.com/api/v9/users/@me/guilds',
    inviteURL: (clientId, permissions) => 
      `https://discord.com/api/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=${permissions}`,
    guildIconURL: (id, icon) => 
      `https://cdn.discordapp.com/icons/${id}/${icon}.png`,
    userAvatarURL: (id, avatar) => 
      `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`,
    guildMembersURL: (guildId) => 
      `https://discord.com/api/v9/guilds/${guildId}/members`
  },
  
  // Permisos para la invitación del bot
  permissions: 8, // 8 = ADMINISTRATOR
  
  // Configuración de seguridad
  auth: {
    requireLogin: true, // Requiere inicio de sesión para acceder a la mayoría de rutas
    requireAdmin: {
      forGlobal: true, // Requiere ser admin global para acceder a la configuración global
      forGuild: false // Requiere ser admin de servidor para acceder a la configuración del servidor
    }
  },
  
  // Rutas protegidas y públicas
  publicRoutes: [
    '/',
    '/login',
    '/logout',
    '/auth',
    '/auth/discord',
    '/auth/discord/callback',
    '/error',
    '/invite',
    '/commands',
    '/assets',
    '/legal/privacy',
    '/legal/terms'
  ],
  
  // Tema y diseño
  theme: {
    name: 'default',
    colors: {
      primary: '#3498db',
      secondary: '#2ecc71',
      danger: '#e74c3c',
      warning: '#f39c12',
      info: '#00cec9',
      dark: '#2c3e50',
      light: '#ecf0f1'
    },
    logo: '/img/logo.svg',
    favicon: '/img/logo.svg'
  },
  
  // Ajustes de la aplicación
  app: {
    name: 'OmenRol',
    description: 'Dashboard para gestionar tu bot de Discord con sistema de rol',
    keywords: 'discord, bot, dashboard, roleplay',
    url: process.env.HTTPS ? 'https://'+process.env.DASHBOARD_HOST : process.env.APP_URL || `http://${config.dashboard.host}:${config.dashboard.port}`,
    contact: process.env.CONTACT_EMAIL || 'admin@example.com'
  },
  
  // Rutas de navegación
  nav: {
    main: [
      { name: 'Inicio', url: '/', icon: 'home' },
      { name: 'Comandos', url: '/commands', icon: 'terminal' },
      { name: 'Invitar', url: '/invite', icon: 'plus-circle' },
      { name: 'Soporte', url: 'https://discord.gg/hYQWbxjMUt', icon: 'message-circle', external: true }
    ],
    user: [
      { name: 'Mis servidores', url: '/servers', icon: 'server', auth: true },
      { name: 'Mi perfil', url: '/me', icon: 'user', auth: true },
      { name: 'Configuración', url: '/settings', icon: 'settings', auth: true }
    ],
    footer: [
      { name: 'Privacidad', url: '/legal/privacy' },
      { name: 'Términos', url: '/legal/terms' },
      { name: 'Contacto', url: 'mailto:admin@pulsey.xyz' }
    ]
  }
};