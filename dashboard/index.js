const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const methodOverride = require('method-override');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const config = require('./config');
const mainConfig = require('../config');
const User = require('../models/User');

// Iniciar la conexión a MongoDB si no existe
if (!mongoose.connection.readyState) {
  mongoose.connect(mainConfig.database.uri, mainConfig.database.options)
    .then(() => console.log('Dashboard: Conectado a MongoDB'))
    .catch(err => {
      console.error('Dashboard: Error al conectar a MongoDB:', err);
      process.exit(1);
    });
}

// Configurar Passport con Discord
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: config.clientId,
  clientSecret: config.clientSecret,
  callbackURL: config.callbackURL,
  scope: ['identify', 'email', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Buscar al usuario en la base de datos
    let user = await User.findOne({ discordId: profile.id });
    
    // Si el usuario no existe, crear uno nuevo
    if (!user) {
      user = new User({
        discordId: profile.id,
        username: profile.username,
        discriminator: profile.discriminator,
        avatar: profile.avatar,
        email: profile.email,
        guilds: profile.guilds,
        accessToken,
        refreshToken
      });
    } else {
      // Actualizar la información del usuario
      user.username = profile.username;
      user.discriminator = profile.discriminator;
      user.avatar = profile.avatar;
      user.email = profile.email;
      user.guilds = profile.guilds;
      user.accessToken = accessToken;
      user.refreshToken = refreshToken;
      user.lastLogin = Date.now();
    }

    const currentUser = {
      ...profile,
      createdAt: user.createdAt,
      lastLogin: Date.now()
    }

    await user.save();
    return done(null, currentUser);
  } catch (err) {
    return done(err, null);
  }
}));

// Crear la aplicación Express
const app = express();

// Establecer el motor de vistas EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configuración de middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));

// Configuración de la sesión
app.use(session({
  secret: config.session.secret,
  cookie: config.session.cookie,
  resave: config.session.resave,
  saveUninitialized: config.session.saveUninitialized,
  store: MongoStore.create({
    mongoUrl: mainConfig.database.uri,
    collectionName: 'sessions'
  })
}));

// Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Middleware para pasar variables a todas las vistas
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.config = config;
  res.locals.currentPath = req.path;
  res.locals.success = req.flash ? req.flash('success') : null;
  res.locals.error = req.flash ? req.flash('error') : null;
  next();
});

// Middleware para verificar autenticación en rutas protegidas
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
};

// Middleware para verificar si el usuario es administrador del servidor
const isGuildAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const { guildId } = req.params;
  
  // Verificar si el usuario tiene permisos de administrador
  const userGuild = req.user.guilds.find(g => g.id === guildId);
  
  if (userGuild && (
    (userGuild.permissions & 0x8) === 0x8 || // Permisos de administrador
    userGuild.owner || // Es propietario
    mainConfig.dashboard.adminUsers.includes(req.user.id) // Es admin global
  )) {
    return next();
  }
  
  res.status(403).render('error', {
    title: 'Acceso denegado',
    req,
    message: 'No tienes permisos para administrar este servidor.',
    status: 403
  });
};

// Middleware para verificar si el usuario es administrador global
const isGlobalAdmin = (req, res, next) => {
  if (req.user && mainConfig.dashboard.adminUsers.includes(req.user.id)) {
    return next();
  }
  
  res.status(403).render('error', {
    title: 'Acceso denegado',
    req,
    message: 'No tienes permisos para acceder a esta área.',
    status: 403
  });
};

// Cargar rutas
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/servers', isAuthenticated, require('./routes/servers'));
app.use('/me', isAuthenticated, require('./routes/me'));
app.use('/admin', isAuthenticated, isGlobalAdmin, require('./routes/admin'));
app.use('/', isAuthenticated, require('./routes/trivia'));
app.use('/api', require('./routes/api'));

// Manejar 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Página no encontrada',
    req,
    message: 'La página que estás buscando no existe.',
    status: 404
  });
});

// Manejar errores
app.use((err, req, res, next) => {
  console.error('Error en el dashboard:', err);
  res.status(err.status || 500).render('error', {
    title: 'Error',
    req,
    message: err.message || 'Se ha producido un error interno.',
    status: err.status || 500,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Iniciar el servidor
const server = app.listen(config.port, () => {
  console.log(`Dashboard disponible en ${config.app.url}`);
});

// Exportar la aplicación para uso externo
module.exports = { app, server, isGuildAdmin, isAuthenticated };