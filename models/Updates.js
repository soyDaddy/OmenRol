const mongoose = require('mongoose');

const Schema = new mongoose.Schema({
    version: { type: String, required: true },
    url: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Updates', Schema);