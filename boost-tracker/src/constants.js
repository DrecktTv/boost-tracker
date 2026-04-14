export const SUPABASE_URL = 'https://ugntykuulfkqhwtmvson.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_uto1aEv3Kagy5R3_psg9iQ_NgcEMlUp';

export const SLOT_DEFS = [
  { role: 'DPS',    lbl: 'DPS 1' },
  { role: 'DPS',    lbl: 'DPS 2' },
  { role: 'TANK',   lbl: 'Tank'  },
  { role: 'Heal',   lbl: 'Heal'  },
];

export const SPE_COLORS = {
  'Guerrier': '#C69B3A', 'Paladin': '#F48CBA', 'Chasseur': '#AAD372', 'Voleur': '#e8d44d',
  'Prêtre': '#CCC', 'Chaman': '#0070DD', 'Mage': '#3FC7EB', 'Démoniste': '#8788EE',
  'Druide': '#FF7C0A', 'Moine': '#00FF98', 'DK': '#C41E3A', 'DH': '#A330C9', 'Évocateur': '#33937F',
};

export const SPES = {
  'DPS.C': [
    'Guerrier Armes', 'Guerrier Fureur', 'Paladin Vindicte', 'DK Impie', 'DK Givre',
    'DH Ravage', 'Druide Féral', 'Moine Vent du Vent', 'Voleur Assassinat',
    'Voleur Hors-la-loi', 'Voleur Subtilité', 'Chaman Amélioration',
  ],
  'DPS.D': [
    'Chasseur Maîtrise des Bêtes', 'Chasseur Tir', 'Chasseur Survie', 'Mage Arcane',
    'Mage Feu', 'Mage Givre', 'Démoniste Affliction', 'Démoniste Démonologie',
    'Démoniste Destruction', 'Prêtre Ombre', 'Chaman Élémentaire', 'Druide Balance',
    'Évocateur Dévastation',
  ],
  'TANK': [
    'Guerrier Protection', 'Paladin Protection', 'DK Sang', 'DH Vengeance',
    'Druide Gardien', 'Moine Brasseur',
  ],
  'Heal': [
    'Prêtre Discipline', 'Prêtre Sacré', 'Paladin Sacré', 'Druide Restauration',
    'Chaman Restauration', 'Moine Tissevent', 'Évocateur Préservation',
  ],
};

export const CLE_OPTIONS = ['MT', 'MC', 'Nexus', 'WS', 'AA', 'Pit', 'Seat', 'Sky'];

// Mapping noms WCL (lowercase) → clés CLE_OPTIONS
export const WCL_DUNGEON_MAP = {
  "magisters' terrace":      'MT',
  "maisara caverns":         'MC',
  "nexus-point xenas":       'Nexus',
  "windrunner spire":        'WS',
  "algeth'ar academy":       'AA',
  "pit of saron":            'Pit',
  "seat of the triumvirate": 'Seat',
  "skyreach":                'Sky',
};

const CDN = 'https://cdn.raiderio.net/images/dungeons';
export const DONJONS = {
  MT:    { fr: "Terrasse des Mages",    en: "Magisters' Terrace",       img: `${CDN}/expansion11/base/magisters-terrace.jpg`        },
  MC:    { fr: 'Cavernes de Maisara',   en: 'Maisara Caverns',          img: `${CDN}/expansion11/base/maisara-caverns.jpg`          },
  Nexus: { fr: 'Point Néant Xenas',     en: 'Nexus-Point Xenas',        img: `${CDN}/expansion11/base/nexuspoint-xenas.jpg`         },
  WS:    { fr: 'Flèche du Marchevents', en: 'Windrunner Spire',         img: `${CDN}/expansion11/base/windrunner-spire.jpg`         },
  AA:    { fr: "Académie d'Algeth'ar",  en: "Algeth'ar Academy",        img: `${CDN}/expansion9/base/algethar-academy.jpg`          },
  Pit:   { fr: 'Fosse de Saron',        en: 'Pit of Saron',             img: `${CDN}/expansion2/base/pit-of-saron.jpg`              },
  Seat:  { fr: 'Siège du Triumvirat',   en: 'Seat of the Triumvirate',  img: `${CDN}/expansion6/base/seat-of-the-triumvirate.jpg`   },
  Sky:   { fr: 'Cîmes Azurées',         en: 'Skyreach',                 img: `${CDN}/expansion5/base/skyreach.jpg`                  },
};

// Icons base64 (extraits de indexV2.html)
export const ICON_DPS  = 'data:image/png;base64,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';
export const ICON_TANK = 'data:image/png;base64,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';
export const ICON_HEAL = 'data:image/png;base64,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';
export const ICON_GOLD = '/boost-tracker/gold.png';
