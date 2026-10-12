const makeGame = ({ key, title, route, sectionId, description }) => ({
  key,
  title,
  route,
  sectionId,
  description,
});

/**
 * Unlock rules for each section.
 * 'always'  — always available, no assessment needed
 * 'perfect' — child must score perfectly (max score) in the given assessment category
 */
const UNLOCK_RULES = {
  1: { type: 'always' },
  2: { type: 'always' },
  3: { type: 'perfect', category: 'letters',    required: 3, label: 'Letters 3/3' },
  4: { type: 'perfect', category: 'twoLetter',  required: 2, label: '2-Letter words 2/2' },
  5: { type: 'always' },
  6: { type: 'always' },
};

export const dyslexiaOverview = {
  moduleId: 'dyslexia',
  title: 'Dyslexia Learning Module',
  description: 'Multisensory letter, word, listening, speaking, and building activities for learners.',
  totalSections: 6,
  totalGames: 12,
  assessmentInfo: {
    totalQuestions: 7,
    categories: {
      letters:     { questions: 3, max: 3, description: 'Letter identification (Q1-Q3)' },
      twoLetter:   { questions: 2, max: 2, description: 'Two-letter word recognition (Q4-Q5)' },
      threeLetter: { questions: 2, max: 2, description: 'Three-letter word recognition (Q6-Q7)' },
    },
    alwaysUnlockedSections: [1, 2, 5, 6],
  },
  sections: [
    {
      id: 1,
      title: 'ගෙවත්තේ චාරිකාව',
      route: '/dyslexia/garden-journey',
      standalone: true,
      gameCount: 1,
      unlockRule: UNLOCK_RULES[1],
      games: [
        makeGame({
          key: 'garden-journey',
          title: 'Garden Journey',
          route: '/dyslexia/garden-journey',
          sectionId: 1,
          description: 'Standalone animal and garden journey activity.',
        }),
      ],
    },
    {
      id: 2,
      title: 'අකුරු කියමු',
      standalone: false,
      gameCount: 2,
      unlockRule: UNLOCK_RULES[2],
      games: [
        makeGame({
          key: 'letter-listening',
          title: 'Letter Listening',
          route: '/dyslexia/letter-listening',
          sectionId: 2,
          description: 'Hear the letter sound and choose the correct one.',
        }),
        makeGame({
          key: 'letter-pronunciation',
          title: 'Letter Pronunciation',
          route: '/dyslexia/letter-pronunciation',
          sectionId: 2,
          description: 'Practice pronouncing the Sinhala letters clearly.',
        }),
      ],
    },
    {
      id: 3,
      title: 'අකුරු 2 වචන කියමු',
      standalone: false,
      gameCount: 3,
      unlockRule: UNLOCK_RULES[3],
      games: [
        makeGame({
          key: 'two-letter-word-match',
          title: 'Two Letter Word Match',
          route: '/dyslexia/two-letter-word-match',
          sectionId: 3,
          description: 'Match the spoken two-letter word to the correct image or word.',
        }),
        makeGame({
          key: 'letter-sound-match',
          title: 'Letter Sound Match',
          route: '/dyslexia/letter-sound-match',
          sectionId: 3,
          description: 'Match the sound to the correct beginning letter.',
        }),
        makeGame({
          key: 'two-letter-speak',
          title: 'Two Letter Speak',
          route: '/dyslexia/two-letter-speak',
          sectionId: 3,
          description: 'Speak the shown two-letter word into the microphone.',
        }),
      ],
    },
    {
      id: 4,
      title: 'අකුරු තුනේ වචන කියමු',
      standalone: false,
      gameCount: 3,
      unlockRule: UNLOCK_RULES[4],
      games: [
        makeGame({
          key: 'word-listen-match',
          title: 'Word Listen Match',
          route: '/dyslexia/word-listen-match',
          sectionId: 4,
          description: 'Listen to the spoken three-letter word and match it.',
        }),
        makeGame({
          key: 'word-image-match',
          title: 'Word Image Match',
          route: '/dyslexia/word-image-match',
          sectionId: 4,
          description: 'Choose the correct image for the spoken word.',
        }),
        makeGame({
          key: 'word-speak',
          title: 'Word Speak',
          route: '/dyslexia/word-speak',
          sectionId: 4,
          description: 'Pronounce the displayed word aloud.',
        }),
      ],
    },
    {
      id: 5,
      title: 'හපනෙක් වෙමු',
      standalone: false,
      gameCount: 2,
      unlockRule: UNLOCK_RULES[5],
      games: [
        makeGame({
          key: 'first-letter',
          title: 'First Letter',
          route: '/dyslexia/first-letter',
          sectionId: 5,
          description: 'Choose the correct first letter for the picture.',
        }),
        makeGame({
          key: 'rhyme-odd-one-out',
          title: 'Rhyme Odd One Out',
          route: '/dyslexia/rhyme-odd-one-out',
          sectionId: 5,
          description: 'Find the word that does not rhyme.',
        }),
      ],
    },
    {
      id: 6,
      title: 'වචන හදමු',
      standalone: false,
      gameCount: 1,
      unlockRule: UNLOCK_RULES[6],
      games: [
        makeGame({
          key: 'word-builder',
          title: 'Word Builder',
          route: '/dyslexia/word-builder',
          sectionId: 6,
          description: 'Build the word by arranging the letters in the right order.',
        }),
      ],
    },
  ],
};
