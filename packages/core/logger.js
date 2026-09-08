'use strict';

function log(event, fields = {}) {
  const entry = { timestamp: new Date().toISOString(), event, ...fields };
  const line = JSON.stringify(entry);
  if (fields.error || event.includes('FAIL')) console.error(line);
  else console.log(line);
  return entry;
}

module.exports = { log };
