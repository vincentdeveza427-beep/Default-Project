// build-fields.js
// Run from the folder that contains science-drill-1.html ... science-drill-6.html:
//     node build-fields.js
// Writes:
//   question-fields.json  - field of science for every question (B, C, P, E, A) per set. You can edit this file by hand.
//   field-review.txt      - the questions the tagger was NOT sure about. Check these and fix them in the JSON.
//
// Codes: B = Biology, C = Chemistry, P = Physics, E = Earth Science, A = Astronomy
// Tags follow the question ORDER in each file, so if you add/remove/reorder questions, run this again.

const fs = require('fs');

// [regex, weight]. Each rule counts up to 3 matches. Words in the question count fully, words in the answer options count half.
const RULES = {
  E: [
    [/\b(rocks?|igneous|sedimentary|metamorphic|minerals?|magma|lava|volcan\w*|caldera|earthquakes?|seismic\w*|seismology|epicenter|faults?|crust|mantle|lithosphere|hydrosphere|atmosphere|troposphere|weather\w*|climate|clouds?|humidity|typhoons?|monsoons?|amihan|habagat|barometer|anemometer|psychrometer|tornado|rainfall|fog|erosion|weathering|weathered|atmospheric|glaciers?|moraine|streams?|delta|dunes?|meanders?|floodplains?|groundwater|water table|permeab\w*|porosity|latitudes?|longitudes?|meridians?|equator|time zones?|date line|oceans?|continental|tectonics?|geolog\w*|fossils?|mesozoic|cenozoic|paleozoic|precambrian|streak|luster|mohs|quartz|marble|granite|limestone|sandstone|shale|obsidian|pumice|scoria|ozone|greenhouse|acid rain|el nino|cyclones?|hurricanes?|storms?|geysers?|stalagmite|stalactite|soil|radiosonde|bergeron|cloud seeding|air mass\w*|altitude|breeze|salinity|trench|deposition|sediment\w*|strata|stratus|cumulus|cirrus|nimbus|isobars?|jet-?lag|desertification|watershed|deforestation|tsunami|landslide|wind speed|prevailing wind|coriolis|dew|frost|snow|rain)\b/gi, 1],
    [/\b(earth|sea|heat|pressure|temperature|water|air|warm air|cold air)\b/gi, 0.3]
  ],
  A: [
    [/\b(planets?|planetary|moons?|lunar|solar system|solar eclipse|eclipse|stars?|galaxy|galaxies|universe|big bang|comets?|asteroids?|meteors?|orbits?|orbital|perihelion|aphelion|perigee|apogee|equinox|solstice|kepler\w*|copernicus|heliocentric|geocentric|telescope|black holes?|supernova|nebula\w*|neutron star|parallax|light-?years?|parsec|astronomical|astronomer|celestial|constellation|polaris|jupiter|saturn|mars|venus|uranus|neptune|pluto|terrestrial planets?|space shuttle|spacecraft|space station|nasa|redshift|hubble|precession|phases? of the moon|halley|sunspots?|zodiac|ursa|rigel|cepheid|white dwarf|red giant|seyfert|luna|titania|oberon|messier|herschel|mercury (mission|atlas|redstone)|apollo)\b/gi, 1],
    [/\b(sun|rotat\w*|revolution|revolves?|tilt|axis|seasons?|tides?|tidal|earth'?s?)\b/gi, 0.5]
  ],
  P: [
    [/\b(forces?|motion|velocity|speed|accelerat\w*|momentum|inertia|newton\w*|kinetic|potential energy|work done|power rating|watts?|joules?|friction|gravity|gravitational|waves?|wavelength|frequency|hertz|amplitude|interference|diffraction|refraction|refractive|reflection|reflects?|lens|lenses|mirrors?|light|rays?|sound|echo|sonar|doppler|electric\w*|charged?|current|voltage|volts?|resistance|resistors?|ohms?|circuits?|capacitors?|magnets?|magnetic|magnetism|induction|transformer|coils?|electromagnetic|photons?|photoelectric|torque|pendulum|projectile|buoyan\w*|thermodynamics?|entropy|relativity|vectors?|displacement|polariz\w*|polaroid|simple machine|lever|pulley|inclined plane|mechanical advantage|collision|elastic|harmonic|focal|converging|diverging|spectrum|bernoulli|streamline|tension|drag|thermal equilibrium|conductors?|insulators?|ammeter|galvanometer|speedometer|decibels?|pitch|beats?|resonance|node|antinode)\b/gi, 1],
    [/\b(energy|heat|pressure|temperature|density|mass|weigh\w*|nuclear|radioactiv\w*|half-life|electrons?)\b/gi, 0.4]
  ],
  C: [
    [/\b(atoms?|atomic|elements?|compounds?|molecules?|molecular|moles?|molar\w*|molal\w*|reactions?|reactants?|acids?|bases?|bronsted|ph|litmus|solutions?|solutes?|solvents?|mixtures?|colloid\w*|suspensions?|bonds?|bonding|ionic|covalent|valence|periodic|isotopes?|oxidation|oxidized|oxidizing|reduction|reducing|electrolyt\w*|polymers?|polymeriz\w*|hydrocarbons?|alkanes?|alkenes?|alkynes?|organic|inorganic|formula|equations?|balance|catalysts?|distillation|chromatography|filtration|crystalliz\w*|saturated|precipitate|equilibrium|titration|ions?|cations?|exothermic|endothermic|combustion|alloys?|allotrop\w*|synthesis|decomposition|sublim\w*|melting point|boiling point|freezing point|evaporation|condens\w*|reagents?|ammonia|sodium|chloride|hydroxide|sulfate|sulphate|nitrate|carbonate|oxide|ethanol|methanol|teflon|nylon|vinegar|baking soda|bleach|tyndall|corrosion|rust|electrochemical|dry cell|fuel cell|salt bridge|anode|cathode|orbitals?|quantum numbers?|pauli|hund|aufbau|gibbs|spontaneous|stoichiometr\w*|empirical|gas laws?|boyle|charles|avogadro|dalton|rutherford|bohr|thomson)\b/gi, 1],
    [/\b(chemical|chemistry|hydrogen|nitrogen|carbon dioxide|methane|energy|heat|temperature|electrons?|protons?|neutrons?|carbon|oxygen|water|density|radioactiv\w*|nuclear|fission|fusion)\b/gi, 0.3]
  ],
  B: [
    [/\b(cells?|cellular|plants?|animals?|organisms?|species|genus|kingdoms?|phylum|taxonom\w*|classif\w*|dna|rna|genes?|genetic\w*|chromosomes?|chromatids?|mitosis|meiosis|enzymes?|proteins?|amino acids?|peptide|photosynthesis|respiration|stomata|transpiration|chloroplasts?|mitochondri\w*|nucleus|ribosomes?|membrane|osmosis|ecosystems?|ecolog\w*|population|communit\w*|habitats?|food chain|food web|producers?|consumers?|decomposers?|symbio\w*|mutualism|commensalism|parasit\w*|predators?|bacteria|fungi|fungus|virus|viruses|protists?|protista|monera|algae|mosses|moss|ferns?|flowers?|seeds?|stems?|roots?|leaf|leaves|fruits?|xylem|phloem|auxins?|gibberellins?|cytokinins?|hormones?|blood|heart|arteries|artery|veins?|lungs?|brain|neurons?|kidneys?|digest\w*|stomach|intestin\w*|bones?|muscles?|skin|vitamins?|nutrition|nutrients?|diseases?|immune|antibod\w*|antigens?|lymph\w*|mammals?|reptiles?|amphibians?|insects?|arthropods?|vertebrates?|invertebrates?|cnidarian\w*|echinoderm\w*|porifera|annelida|platyhelminthes|evolution|adaptation|heredity|dominan\w*|recessive|genotype|phenotype|rabies|eczema|medicinal|endangered|biodiversity|tarsier|tamaraw|carbohydrates?|lipids?|glucose|cellulose|biolog\w*|zygote|embryo|fetus|adenosine|atp|triphosphate|tissues?|organs?|anatomy|morphology|histology|cytology|pollen|anthers?|carpels?|ovules?|sepals?|petals?|spiracles?|tracheae|metabolic|metabolism|photoperiodism|tropism|lichen|cloning|biotechnology|allosteric|eukaryot\w*|prokaryot\w*|archaea|eukarya|domain|vascular|pathogen\w*|fertiliz\w*|reproduc\w*|sperm|egg|larva|pupa|butterfly|mosquito|fish|eagle|worms?|cassava|potato|tomato|rice|mango)\b/gi, 1],
    [/\b(life|living|growth|food|water|oxygen|carbon dioxide)\b/gi, 0.3]
  ]
};

// phrases that fool the keyword rules (e.g. an electrochemical "cell" is chemistry, not biology)
const CHEMCELL = /\b(electrochemical|dry|fuel|storage|primary|secondary|galvanic|voltaic|chemical) cells?\b/gi;
const STRIP = /\b(electrochemical|dry|fuel|storage|primary|secondary|galvanic|voltaic|solar|photovoltaic|chemical) cells?\b|\bbase level\b|\bcell phone\b/gi;

function classify(q) {
  const qText = String(q[0]).replace(/<br>/gi, ' ').replace(STRIP, ' ');
  const oText = q[1].map(function (o) { return String(o); }).join(' ').replace(STRIP, ' ');
  const score = { E: 0, A: 0, P: 0, C: 0, B: 0 };
  score.C += Math.min((String(q[0]).match(CHEMCELL) || []).length, 2) * 2 + Math.min((q[1].join(' ').match(CHEMCELL) || []).length, 2) * 1;
  Object.keys(RULES).forEach(function (f) {
    RULES[f].forEach(function (r) {
      const re = new RegExp(r[0].source, 'gi');
      score[f] += Math.min((qText.match(re) || []).length, 3) * r[1];
      score[f] += Math.min((oText.match(re) || []).length, 3) * r[1] * 0.5;
    });
  });
  const ranked = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; });
  const top = ranked[0], second = ranked[1];
  return { field: top, score: score, margin: score[top] - score[second], sure: score[top] >= 1.5 && score[top] - score[second] >= 1.0 };
}

function loadQuestions(src, file) {
  const m = src.match(/const QUESTIONS\s*=\s*(\[[\s\S]*?\]);\s*\n\s*const letters/);
  if (!m) throw new Error('could not find the QUESTIONS array in ' + file);
  return new Function('return ' + m[1])();
}

function run() {
  const out = {};
  const review = [];
  const NAMES = { B: 'Biology', C: 'Chemistry', P: 'Physics', E: 'Earth Science', A: 'Astronomy' };
  const totals = {};
  for (let n = 1; n <= 6; n++) {
    const file = 'science-drill-' + n + '.html';
    if (!fs.existsSync(file)) { console.log('SKIP  ' + file + ' (not found)'); continue; }
    const letter = String.fromCharCode(64 + n);
    const qs = loadQuestions(fs.readFileSync(file, 'utf8'), file);
    const res = qs.map(classify);
    const tags = res.map(function (r) { return r.field; });
    // Questions are grouped in topical blocks, so an unsure one takes the field of the nearest sure neighbour (previous first).
    res.forEach(function (r, i) {
      if (r.sure) return;
      let k = i - 1, found = null;
      while (k >= 0 && !found) { if (res[k].sure) found = tags[k]; k--; }
      k = i + 1;
      while (k < res.length && !found) { if (res[k].sure) found = res[k].field; k++; }
      if (found && r.score[r.field] < 1.5) tags[i] = found;
      review.push({ set: letter, n: i + 1, text: String(qs[i][0]).replace(/<br>/gi, ' ').slice(0, 110), tag: tags[i], score: r.score });
    });
    out[letter] = tags.join('').split('');
    tags.forEach(function (t) { totals[t] = (totals[t] || 0) + 1; });
    console.log('Set ' + letter + ': ' + qs.length + ' questions tagged');
  }
  fs.writeFileSync('question-fields.json', JSON.stringify(out));
  const lines = [
    'FIELD TAGS TO DOUBLE-CHECK (' + review.length + ' of ' + Object.keys(out).reduce(function (a, k) { return a + out[k].length; }, 0) + ' questions)',
    'Codes: B=Biology  C=Chemistry  P=Physics  E=Earth Science  A=Astronomy',
    'To fix one, open question-fields.json, find the set letter, and change the letter at that question number.', ''
  ];
  review.forEach(function (r) {
    const sc = Object.keys(r.score).map(function (f) { return f + ':' + (Math.round(r.score[f] * 10) / 10); }).join(' ');
    lines.push('Set ' + r.set + ' Q' + r.n + '  -> ' + r.tag + '   [' + sc + ']\n   ' + r.text);
  });
  fs.writeFileSync('field-review.txt', lines.join('\n'));
  console.log('\nTotals: ' + Object.keys(totals).map(function (t) { return NAMES[t] + ' ' + totals[t]; }).join(', '));
  console.log('Wrote question-fields.json and field-review.txt (' + review.length + ' questions to double-check).');
}

if (require.main === module) run();
module.exports = { classify };
