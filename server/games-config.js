'use strict';

const GAMES = [
  {
    slug: 'flappy-finance',
    title: 'Flappy Finance',
    shortTitle: 'Flappy',
    icon: '🐤',
    accent: '#ffd147',
    accent2: '#ff8a3d',
    category: 'Reflex + Accounting',
    description: 'Soar through the correct accounting gates before gravity or speed catches you!',
    rules: '+100 per right gate · 3 lives · Speed rises every 5 questions',
    url: '/games/flappy-finance.html'
  },
  {
    slug: 'finance-hangman',
    title: 'Finance Hangman',
    shortTitle: 'Hangman',
    icon: '🔤',
    accent: '#22e5d2',
    accent2: '#38bdf8',
    category: 'Vocab + Strategy',
    description: 'Decode accounting clues letter by letter across 5 escalating difficulty levels.',
    rules: '5 levels · +100 per word · +50 no-mistake bonus',
    url: '/games/finance-hangman.html'
  },
  {
    slug: 'finance-blaster',
    title: 'Finance Blaster',
    shortTitle: 'Blaster',
    icon: '🎯',
    accent: '#ff5e8a',
    accent2: '#f43f5e',
    category: 'Arcade Shooter',
    description: 'Aim your neon cannon and blast the right account category before the clock hits zero!',
    rules: '+100 per hit · Faster clock every level · Keys 1–6 or click',
    url: '/games/finance-blaster.html'
  },
  {
    slug: 'cash-collector',
    title: 'Cash Collector',
    shortTitle: 'Collector',
    icon: '🪙',
    accent: '#34d399',
    accent2: '#10b981',
    category: '4-Stage Platformer',
    description: 'Jump across platforms, dodge hazards, and grab only the matching accounting items.',
    rules: '4 stages · 60s each · +10 time bonus per second left',
    url: '/games/cash-collector.html'
  },
  {
    slug: 'accounting-crossword',
    title: 'Accounting Crossword',
    shortTitle: 'Crossword',
    icon: '🧩',
    accent: '#a78bfa',
    accent2: '#8b5cf6',
    category: 'Brain Puzzle',
    description: 'Solve 10 fun, easy accounting clues in a 5-minute crossword showdown.',
    rules: '10 easy words · 5-minute timer · +2 bonus per second left',
    url: '/games/accounting-crossword.html'
  }
];

const GAME_MAP = Object.fromEntries(GAMES.map(g => [g.slug, g]));
const GAME_SLUGS = GAMES.map(g => g.slug);

const AVATARS = ['🦊', '🚀', '🦁', '🐼', '⚡', '👾', '🦄', '🐯', '🐙', '🦅', '🐸', '🤖'];

module.exports = { GAMES, GAME_MAP, GAME_SLUGS, AVATARS };
