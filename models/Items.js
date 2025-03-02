const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  image: { type: String, default: null },
  raceRestrictions: { type: [String], default: [] },
  classRestrictions: { type: [String], default: [] },
  levelRequired: { type: Number, default: 1, min: 1 },
  purchaseLimit: { type: Number, default: 0 },
  type: { type: String, enum: ['collectable', 'usable', 'equipment'], default: 'collectable' },
  equipmentSlot: { type: String, enum: ['head', 'body', 'hands', 'feet', 'weapon', 'accessory', 'none'], default: 'none' },
  effects: {
    health: { type: Number, default: 0 },
    mana: { type: Number, default: 0 },
    strength: { type: Number, default: 0 },
    intelligence: { type: Number, default: 0 },
    dexterity: { type: Number, default: 0 },
    defense: { type: Number, default: 0 }
  },
  consumable: { type: Boolean, default: false },
  maxUses: { type: Number, default: 1 },
  serverId: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ItemSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Item', ItemSchema);