const game = (key, title, route, sectionId, description) => ({ key, title, route, sectionId, description });

export const dyscalculiaOverview = {
  moduleId: 'dyscalculia',
  title: 'Dyscalculia Learning Module',
  description: 'Child-friendly number recognition, counting, comparison, and arithmetic activities.',
  totalSections: 4,
  totalGames: 6,
  assessmentInfo: {
    totalQuestions: 6,
    categories: {
      numberRecognition: { questions: 1, max: 1 },
      counting: { questions: 2, max: 2 },
      magnitudeComparison: { questions: 1, max: 1 },
      simpleArithmetic: { questions: 2, max: 2 },
    },
    alwaysUnlockedSections: [1, 2, 3, 4],
  },
  sections: [
    { id: 1, title: 'Learn Numbers', route: '/dyscalculia/numbers', gameCount: 1, unlockRule: { type: 'always' }, games: [game('number-learning', 'Number Learning', '/dyscalculia/numbers', 1, 'Learn and hear numbers from 0 to 10.')] },
    { id: 2, title: 'Count and Match', route: '/dyscalculia/games', gameCount: 2, unlockRule: { type: 'always' }, games: [game('balloon-pop', 'Balloon Pop', '/dyscalculia/balloon-pop', 2, 'Pop balloons in the requested number order.'), game('number-sorting', 'Number Sorting', '/dyscalculia/number-sorting', 2, 'Arrange numbers in the correct order.')] },
    { id: 3, title: 'Listen and Remember', route: '/dyscalculia/games', gameCount: 2, unlockRule: { type: 'always' }, games: [game('number-listening', 'Number Listening', '/dyscalculia/number-listening', 3, 'Listen to a number and choose it.'), game('number-memory-writing', 'Number Memory Writing', '/dyscalculia/number-memory-writing', 3, 'Remember and write the number shown.')] },
    { id: 4, title: 'Number Challenges', route: '/dyscalculia/games', gameCount: 1, unlockRule: { type: 'always' }, games: [game('symbol-detective', 'Symbol Detective', '/dyscalculia/symbol-detective', 4, 'Recognize and match number symbols.')] },
  ],
};
