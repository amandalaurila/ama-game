#!/usr/bin/env node
// Encodes puzzle-plain.json → puzzle.json
// Usage: node encode.js

const fs = require('fs');
const path = require('path');

const src  = path.join(__dirname, 'puzzle-plain.json');
const dest = path.join(__dirname, 'puzzle.json');

const plain = JSON.parse(fs.readFileSync(src, 'utf8'));

function enc(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

const encoded = {
  ...plain,
  groups: plain.groups.map(g => ({
    ...g,
    category: g.category !== null ? enc(g.category) : null,
    words:    g.words.map(enc),
  })),
};

fs.writeFileSync(dest, JSON.stringify(encoded, null, 2) + '\n');

const wordCount = plain.groups.flatMap(g => g.words).length;
console.log(`puzzle.json written — ${wordCount} words encoded.`);
