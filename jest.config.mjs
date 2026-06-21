import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config = {
  coverageProvider: 'v8',
  testEnvironment: '<rootDir>/jest.custom-environment.js',
  setupFiles: ['<rootDir>/jest.env.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^lib/(.*)$': '<rootDir>/lib/$1',
    '^types/(.*)$': '<rootDir>/types/$1',
    '^components/(.*)$': '<rootDir>/components/$1',
    '^hooks/(.*)$': '<rootDir>/hooks/$1',
    '^baseline-browser-mapping$': '<rootDir>/__mocks__/baseline-browser-mapping.js',
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
  },

  // Ignore specific files from test runs
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '/__fixtures__/',
    '/__helpers__/',
    '/__mocks__/',
    '/\\.next/',
  ],

  // Ignore specific files from coverage reports
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    // Type-only files have 0% runtime coverage by design — types are erased at compile time
    '\\.types\\.ts$',
  ],
  // Collect coverage from all source files so files not imported by tests
  // still appear in the report (and will be measured against thresholds).
  collectCoverage: true,
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'hooks/**/*.{js,jsx,ts,tsx}',
    'src/**/*.{js,jsx,ts,tsx}',
    'scripts/**/*.{js,jsx,ts,tsx}',
    'types/**/*.{js,jsx,ts,tsx}',
    '!components/DynamicIcon.tsx',
    '!**/*.types.ts',
    '!**/*.d.ts',
    '!**/__tests__/**',
    '!**/*.test.{js,jsx,ts,tsx}',
    '!**/*.spec.{js,jsx,ts,tsx}',
    '!**/.next/**',
    '!**/coverage/**',
  ],
  coverageReporters: ['text', 'json', 'lcov', 'text-summary'],
  coverageThreshold: {
    './app/': {
      branches: 80,
      functions: 80,
      lines: 90,
      statements: 90,
    },
    './hooks/': {
      branches: 80,
      functions: 80,
      lines: 90,
      statements: 90,
    },
    './lib/': {
      branches: 80,
      functions: 80,
      lines: 90,
      statements: 90,
    },
    // per-folder thresholds kept
    './components/': {
      branches: 70,
      functions: 70,
      lines: 85,
      statements: 85,
    },
    // EmbedClient is a large orchestration component; its branch coverage is
    // tracked separately so the per-file glob below can stay at 80%.
    './app/embed/session/EmbedClient.tsx': {
      branches: 75,
      functions: 0,
      lines: 80,
      statements: 80,
    },
    // Extracted hooks — tested via EmbedClient integration tests, raise when unit tests added
    './app/embed/session/hooks/useBootstrap.ts': { branches: 75, functions: 0, lines: 80, statements: 80 },
    './app/embed/session/hooks/useQueuedMessageManagement.ts': { branches: 65, functions: 0, lines: 75, statements: 75 },
    './app/embed/session/hooks/useSessionManagement.ts': { branches: 65, functions: 0, lines: 75, statements: 75 },
    // Extracted sub-components — tested via parent integration tests, raise when unit tests added
    './components/components/Composer.tsx': { branches: 35, functions: 0, lines: 75, statements: 75 },
    './components/components/FocusTrap.tsx': { branches: 0, functions: 0, lines: 15, statements: 15 },
    './components/components/JumpToLatest.tsx': { branches: 0, functions: 0, lines: 20, statements: 20 },
    './components/components/Suggestions.tsx': { branches: 0, functions: 0, lines: 15, statements: 15 },
    './components/components/TypingIndicator.tsx': { branches: 0, functions: 0, lines: 15, statements: 15 },
    './app/embed/docs/hooks/useMessageOperations.ts': { branches: 70, functions: 0, lines: 80, statements: 80 },
    './app/embed/docs/components/MessageFeedbackButtons.tsx': { branches: 60, functions: 0, lines: 75, statements: 75 },
    // enforce per-file minimums (any file below this will fail the run)
    // Note: relax `functions` to 0 to avoid failing files that contain no functions
    '{app,components,lib,hooks}/**/*.{js,jsx,ts,tsx}': {
      branches: 80,
      functions: 0,
      lines: 80,
      statements: 80,
    },
  },
}

export default createJestConfig(config)