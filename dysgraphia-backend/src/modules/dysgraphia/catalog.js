const CATALOG_VERSION = "2026-06-03";

const SHAPES = [
  { id: "straightline", name: "සරල රේඛාව" },
  { id: "upward", name: "ඉහළ රේඛාව" },
  { id: "downward", name: "පහළ රේඛාව" },
  { id: "rectangle", name: "දිග හතරැස්" },
  { id: "square", name: "සම හතරැස්" },
  { id: "triangle", name: "ත්‍රිකෝණය" },
  { id: "circle", name: "රවුම" },
  { id: "waves", name: "රැළි" },
  { id: "star", name: "තරුව" },
];

const LETTER_LEVELS = {
  level1: {
    id: "level1",
    name: "අදියර 1",
    items: [
      { id: "ta", targetChar: "ට", name: "ටඅකුර", path: "/dysgraphia/letter-ta" },
      { id: "ra", targetChar: "ර", name: "රඅකුර", path: "/dysgraphia/letter-ra" },
      { id: "ya", targetChar: "ය", name: "යඅකුර", path: "/dysgraphia/letter-ya" },
      { id: "ga", targetChar: "ග", name: "ගඅකුර", path: "/dysgraphia/letter-ga" },
      { id: "la", targetChar: "ල", name: "ලඅකුර", path: "/dysgraphia/letter-la" },
    ],
  },
  level2: {
    id: "level2",
    name: "අදියර 2",
    items: [
      { id: "pa", targetChar: "ප", name: "පඅකුර", path: "/dysgraphia/letter-pa" },
      { id: "u", targetChar: "උ", name: "උඅකුර", path: "/dysgraphia/letter-u" },
      { id: "na", targetChar: "න", name: "නඅකුර", path: "/dysgraphia/letter-na" },
      { id: "tha", targetChar: "ත", name: "තඅකුර", path: "/dysgraphia/letter-tha" },
      { id: "ha", targetChar: "හ", name: "හඅකුර", path: "/dysgraphia/letter-ha" },
    ],
  },
  level3: {
    id: "level3",
    name: "අදියර 3",
    items: [
      { id: "ba", targetChar: "බ", name: "බඅකුර", path: "/dysgraphia/letter-ba" },
      { id: "dha", targetChar: "ද", name: "දඅකුර", path: "/dysgraphia/letter-dha" },
      { id: "ka", targetChar: "ක", name: "කඅකුර", path: "/dysgraphia/letter-ka" },
      { id: "a", targetChar: "අ", name: "අඅකුර", path: "/dysgraphia/letter-a" },
      { id: "ma", targetChar: "ම", name: "මඅකුර", path: "/dysgraphia/letter-ma" },
      { id: "sa", targetChar: "ස", name: "සඅකුර", path: "/dysgraphia/letter-sa" },
    ],
  },
};

const WORD_GROUPS = {
  twoLetters: {
    id: "twoLetters",
    name: "අකුරු දෙක",
    items: [
      { id: "bata", targetWord: "බට", expectedLength: 2 },
      { id: "gasa", targetWord: "ගස", expectedLength: 2 },
      { id: "dara", targetWord: "දර", expectedLength: 2 },
      { id: "mala", targetWord: "මල", expectedLength: 2 },
      { id: "yata", targetWord: "යට", expectedLength: 2 },
      { id: "ula", targetWord: "උල", expectedLength: 2 },
      { id: "rata", targetWord: "රට", expectedLength: 2 },
      { id: "mama", targetWord: "මම", expectedLength: 2 },
    ],
  },
  threeLetters: {
    id: "threeLetters",
    name: "අකුරු තුන",
    items: [
      { id: "basaya", targetWord: "බසය", expectedLength: 3 },
      { id: "ahasa", targetWord: "අහස", expectedLength: 3 },
      { id: "wayasa", targetWord: "වයස", expectedLength: 3 },
      { id: "pahana", targetWord: "පහන", expectedLength: 3 },
      { id: "wataya", targetWord: "වටය", expectedLength: 3 },
      { id: "sarama", targetWord: "සරම", expectedLength: 3 },
      { id: "mahatha", targetWord: "මහත", expectedLength: 3 },
    ],
  },
  writingLines: {
    id: "writingLines",
    name: "රේඛා අතර ලිවීම",
    items: [
      { id: "bata",  targetWord: "බට", expectedLength: 2 },
      { id: "gasa",  targetWord: "ගස", expectedLength: 2 },
      { id: "dara",  targetWord: "දර", expectedLength: 2 },
      { id: "mala",  targetWord: "මල", expectedLength: 2 },
      { id: "yata",  targetWord: "යට", expectedLength: 2 },
      { id: "ula",   targetWord: "උල", expectedLength: 2 },
      { id: "rata",  targetWord: "රට", expectedLength: 2 },
      { id: "mama",  targetWord: "මම", expectedLength: 2 },
    ],
  },
};

const FLAT_LETTERS = Object.values(LETTER_LEVELS).flatMap((level) =>
  level.items.map((item) => ({ ...item, levelId: level.id, levelName: level.name }))
);
const FLAT_WORDS = Object.values(WORD_GROUPS).flatMap((group) =>
  group.items.map((item) => ({ ...item, groupId: group.id, groupName: group.name }))
);

function getCatalog() {
  return {
    version: CATALOG_VERSION,
    shapes: SHAPES,
    letters: LETTER_LEVELS,
    words: WORD_GROUPS,
    counts: {
      shapes: SHAPES.length,
      letters: {
        total: FLAT_LETTERS.length,
        level1: LETTER_LEVELS.level1.items.length,
        level2: LETTER_LEVELS.level2.items.length,
        level3: LETTER_LEVELS.level3.items.length,
      },
      words: {
        total: FLAT_WORDS.length,
        twoLetters: WORD_GROUPS.twoLetters.items.length,
        threeLetters: WORD_GROUPS.threeLetters.items.length,
        writingLines: WORD_GROUPS.writingLines.items.length,
      },
    },
  };
}

function findShape(shapeId) {
  return SHAPES.find((shape) => shape.id === shapeId) || null;
}

function findLetter(letterId) {
  return FLAT_LETTERS.find((letter) => letter.id === letterId) || null;
}

function findWord(groupId, wordId) {
  return FLAT_WORDS.find((word) => word.groupId === groupId && word.id === wordId) || null;
}

module.exports = {
  CATALOG_VERSION,
  FLAT_LETTERS,
  FLAT_WORDS,
  LETTER_LEVELS,
  SHAPES,
  WORD_GROUPS,
  findLetter,
  findShape,
  findWord,
  getCatalog,
};