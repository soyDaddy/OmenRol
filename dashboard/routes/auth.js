const express = require('express');
const router = express.Router();
const passport = require('passport');
const config = require('../config');

// Ruta para iniciar el proceso de autenticación con Discord
router.get('/discord', passport.authenticate('discord', {
  scope: ['identify', 'email', 'guilds']
}));

// Ruta de callback después de la autenticación
router.get('/discord/callback', passport.authenticate('discord', {
  failureRedirect: '/login'
}), (req, res) => {
  // Redireccionar según la URL almacenada en la sesión o a la página principal
  const redirectTo = req.session.redirectTo || '/me';
  delete req.session.redirectTo;
  res.redirect(redirectTo);
});

// Ruta para cerrar sesión
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.redirect('/error?message=Error al cerrar sesión&status=500');
    }
    res.redirect('/');
  });
});

module.exports = router;