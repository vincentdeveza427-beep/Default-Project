// apply-fixes.js
// Run from the folder that contains science-drill-1.html ... science-drill-6.html:
//     node apply-fixes.js
// Backups of the original files are saved in ./backup-before-fixes/
// Key numbers: A=0, B=1, C=2, D=3

const fs = require('fs');
const path = require('path');

const LENS_OPTS = [
  "A converging lens is thicker at the middle than at the edges; a diverging lens is thicker at the edges than at the middle.",
  "A converging lens is thicker at the edges than at the middle; a diverging lens is thicker at the middle than at the edges.",
  "A converging lens is always made of glass; a diverging lens is always made of plastic.",
  "A converging lens always has a smaller diameter than a diverging lens."
];

// n = question number shown on the page. find = start of the question text.
// q = [old text, new text] (substring replace). opts = full array OR { index: newText }. key = new answer number.
const FIXES = {
  'science-drill-1.html': [   // SET A
    { n: 9,   find: 'Where does the pickup needle on a phonograph', key: 1 },
    { n: 19,  find: 'A magnet is a metallic substance', key: 0 },
    { n: 86,  find: 'Which of the following is NOT a physical characteristic of a terrestrial planet?', opts: { 2: 'High density' } },
    { n: 87,  find: "Jupiter's moon with an approximate diameter", q: ['for 75 days', 'for 692 earth days'], key: 2 },
    { n: 88,  find: "The precession of the Earth's axis", opts: { 2: "the Earth's meridian bulge" }, key: 3 },
    { n: 109, find: 'In how many days does the moon complete', key: 2 },
    { n: 116, find: 'In a darkened room in front of a white wall', key: 0 },
    { n: 117, find: 'The speed of sound in water is 1498', key: 1 },
    { n: 130, find: 'If the wavelength of a 4.40 x 10s Hz', q: ['4.40 x 10s Hz', '4.40 x 10\u00b2 Hz'],
      opts: ['1.10 x 10\u00b3 m/s', '7.70 x 10\u00b3 m/s', '1.45 x 10\u00b3 m/s', '7.70 x 10\u2075 m/s'], key: 2 },
    { n: 131, find: 'A student rubs a glass object and felt cloth together',
      opts: ['The felt cloth became charged negatively during the rubbing process.',
             'The felt materials have greater affinity to electrons than the glass',
             'Electrons are transferred from the glass to the felt cloth',
             'The glass gained protons during the rubbing process'], key: 3 },
    { n: 138, find: 'Why transmission of sound in the outer space impossible?',
      opts: ['Light travels faster than sound', 'Sound is produced only during lightning',
             'Sound needs a medium to travel and outer space is a vacuum',
             'We cannot hear and see two different events at the same time'], key: 2 },
    { n: 144, find: 'What is the speed of a jet plane that flies 7,200 km', key: 1 },
    { n: 150, find: 'A turning fork produces a sound wave', key: 1 }
  ],
  'science-drill-2.html': [   // SET B
    { n: 8,  find: 'Below are different quantities and their corresponding units', opts: { 2: 'Density - kg/m\u00b3' }, key: 1 },
    { n: 15, find: 'The temperature at which a substance changes from the liquid phase to the gas phase', key: 0 },
    { n: 40, find: 'Which among the following metals will be obtained by ore reduction?', opts: { 1: 'Hydrogen' } },
    { n: 46, find: 'The mercury level in a thermometer rises when dipped in hot water', opts: { 3: 'Makes molecules move slower and closer together' }, key: 2 },
    { n: 49, find: 'Two substances have to be separated. Both are temperature sensitive', key: 3 }
  ],
  'science-drill-3.html': [   // SET C
    { n: 15, find: 'Which of the following is used to measure altitude?', key: 1 },
    { n: 98, find: 'What is the overall order of a reaction?',
      q: ['What is the overall order of a reaction?', 'For a reaction with the rate law rate = k[A]^0 [B]^2, what is the overall order of the reaction?'], key: 1 }
  ],
  'science-drill-4.html': [   // SET D
    { n: 14,  find: 'What physical characteristic of a lens distinguishes', opts: LENS_OPTS, key: 0 },
    { n: 15,  find: "The domains included in Woese's 1990 classification", opts: { 0: 'I, II, IV' }, key: 0 },
    { n: 44,  find: 'Salinity is the proportion of dissolved salts to water', opts: { 1: '3.5%' }, key: 1 },
    { n: 59,  find: 'Identify the biotic community in a typical ecosystem', opts: { 1: 'Algae in the pond' }, key: 1 },
    { n: 90,  find: 'A fluorescent lamp rated at 100 kW', opts: { 2: '400 kW-hrs' }, key: 2 },
    { n: 97,  find: 'When a beam of ordinary white light passes through a Polaroid plate', opts: { 2: 'about one-third of the incident beam' }, key: 1 },
    { n: 98,  find: 'A convex spherical mirror has a focal length of 12 cm', opts: { 3: '4 cm behind the mirror' }, key: 3 },
    { n: 106, find: 'Three identical balls are thrown simultaneously', opts: { 3: 'All three balls reach the ground with the same kinetic energy' }, key: 3 },
    { n: 144, find: 'What is the required heat sufficient to melt rocks?',
      opts: ['200\u00b0C-400\u00b0C', '400\u00b0C-600\u00b0C', '600\u00b0C-1200\u00b0C', '1300\u00b0C-2000\u00b0C'], key: 2 }
  ],
  'science-drill-5.html': [   // SET E
    { n: 5,   find: 'Typhoon signal no 2 means', key: 1 },
    { n: 12,  find: 'What is formed when warm air rises and is replaced by cold air?', key: 1 },
    { n: 68,  find: 'A conductor differs from an insulator in that a conductor', key: 0 },
    { n: 98,  find: 'Why is evaporation a cooling process?', key: 2 },
    { n: 123, find: 'A girl whose weight is 490 N runs up a flight of stairs', opts: { 1: '4,900 J' }, key: 1 }
  ],
  'science-drill-6.html': [   // SET F
    { n: 2,   find: 'What physical characteristic of a lens distinguishes', opts: LENS_OPTS, key: 0 },
    { n: 27,  find: 'When uranium', q: ['(90 protons)', '(92 protons)'], key: 0 },
    { n: 58,  find: 'What is the frequency of electromagnetic radiation whose wavelength is 6 m?', opts: { 2: '5.0 x 10\u2077 Hz' }, key: 2 },
    { n: 81,  find: 'The ideal efficiency for a heat engine', opts: { 3: '48%' }, key: 3 },
    { n: 136, find: 'A transformer with 1000 turns in the primary coil', q: ['from 220 V.', 'from 220 V to 11 V.'], key: 1 }
  ]
};

// Only Set F is processed in this version (Sets A-E were already fixed)
Object.keys(FIXES).forEach(function (k) { if (k !== 'science-drill-6.html') delete FIXES[k]; });

const ENTRY = /^\["((?:[^"\\]|\\.)*)", \[((?:"(?:[^"\\]|\\.)*"(?:, )?)+)\], (\d)\]/;
const L = ['A', 'B', 'C', 'D'];

function loadQuestions(src) {
  const m = src.match(/const QUESTIONS\s*=\s*(\[[\s\S]*?\]);\s*\n\s*const letters/);
  if (!m) throw new Error('could not find the QUESTIONS array');
  return new Function('return ' + m[1])();
}

const backupDir = path.join(process.cwd(), 'backup-before-fixes');
let problems = 0;

Object.keys(FIXES).forEach(function (file) {
  if (!fs.existsSync(file)) { console.log('SKIP  ' + file + ' (not found in this folder)'); problems++; return; }
  const original = fs.readFileSync(file, 'utf8');
  let src = original;
  const setName = 'Set ' + String.fromCharCode(64 + parseInt(file.match(/\d+/)[0], 10));
  const report = [];
  let failed = false;

  FIXES[file].forEach(function (fx) {
    const needle = '["' + fx.find;
    const count = src.split(needle).length - 1;
    if (count !== 1) { console.log('FAIL  ' + setName + ' Q' + fx.n + ': found ' + count + ' matches for "' + fx.find + '"'); failed = true; return; }
    const idx = src.indexOf(needle);
    const m = src.slice(idx).match(ENTRY);
    if (!m) { console.log('FAIL  ' + setName + ' Q' + fx.n + ': could not read the entry'); failed = true; return; }

    let q = JSON.parse('"' + m[1] + '"');
    let opts = JSON.parse('[' + m[2] + ']');
    let key = parseInt(m[3], 10);

    if (fx.q) {
      if (q.indexOf(fx.q[0]) === -1) { console.log('FAIL  ' + setName + ' Q' + fx.n + ': text "' + fx.q[0] + '" not found'); failed = true; return; }
      q = q.replace(fx.q[0], fx.q[1]);
    }
    if (Array.isArray(fx.opts)) opts = fx.opts.slice();
    else if (fx.opts) Object.keys(fx.opts).forEach(function (i) { opts[+i] = fx.opts[i]; });
    if (typeof fx.key === 'number') key = fx.key;

    const entry = '[' + JSON.stringify(q) + ', [' + opts.map(function (o) { return JSON.stringify(o); }).join(', ') + '], ' + key + ']';
    src = src.slice(0, idx) + entry + src.slice(idx + m[0].length);
    report.push(setName + ' Q' + fx.n + '  ->  ' + L[key] + '. ' + opts[key]);
  });

  if (failed) { console.log('NOT SAVED  ' + file + ' (fix the failures above first)\n'); problems++; return; }

  // verify the result: still 150 valid questions and each edit sits at the right number
  try {
    const arr = loadQuestions(src);
    if (arr.length !== 150) throw new Error('expected 150 questions, got ' + arr.length);
    arr.forEach(function (e, i) {
      if (e.length !== 3 || e[1].length !== 4 || !(e[2] >= 0 && e[2] <= 3)) throw new Error('bad entry at Q' + (i + 1));
    });
    FIXES[file].forEach(function (fx) {
      if (arr[fx.n - 1][0].indexOf(fx.find.slice(0, 25)) !== 0 && !(fx.q && arr[fx.n - 1][0].indexOf(fx.q[1].slice(0, 25)) === 0)) {
        throw new Error('Q' + fx.n + ' is not where expected (question numbering differs)');
      }
    });
  } catch (e) {
    console.log('NOT SAVED  ' + file + ': ' + e.message + '\n'); problems++; return;
  }

  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  fs.writeFileSync(path.join(backupDir, file), original);
  fs.writeFileSync(file, src);
  console.log('SAVED  ' + file + '  (' + report.length + ' questions updated)');
  report.forEach(function (r) { console.log('   ' + r); });
  console.log('');
});

console.log(problems ? 'Finished with ' + problems + ' problem(s). Files with problems were left untouched.' : 'All fixes applied. Originals are in backup-before-fixes/.');
