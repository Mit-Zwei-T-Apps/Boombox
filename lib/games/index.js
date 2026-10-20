'use strict';
module.exports = {
  impostor: { min: 3, mod: require('./hidden')('impostor') },
  spy: { min: 3, mod: require('./hidden')('spy') },
  wolf: { min: 5, mod: require('./wolf') },
  wouldrather: { min: 2, mod: require('./wouldrather') },
  bomb: { min: 2, mod: require('./bomb') },
  spectrum: { min: 3, mod: require('./spectrum') },
  boxes: { min: 2, mod: require('./boxes') },
  sketch: { min: 2, mod: require('./sketch') }
};
