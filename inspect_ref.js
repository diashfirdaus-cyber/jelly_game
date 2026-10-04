const fs = require('fs');
const code = fs.readFileSync('ref_index.js', 'utf8');

const aeIdx = code.indexOf('class Ae');
if (aeIdx !== -1) {
  console.log(code.slice(aeIdx - 200, aeIdx + 1200));
}
