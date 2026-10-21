'use strict';
const crypto = require('crypto');
exports.rand = (n) => crypto.randomInt(n);
exports.float = () => crypto.randomInt(0x100000000) / 0x100000000;
exports.pick = (a) => a[crypto.randomInt(a.length)];
exports.shuffle = function (a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
};
exports.int = (v, min, max, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
exports.bool = (v) => v === true;
