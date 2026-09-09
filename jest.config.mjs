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
    // Type-only files have 0% runtime coverage by design — types are erased at compile time.
    // Both spellings: `foo.types.ts` and a bare `types.ts` barrel (e.g.
    // components/blocks/types.ts, which exports nothing but `type` aliases).
    '\\.types\\.ts$',
    '(^|/)types\\.ts$',
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
    // Per-file floors. Every file below now clears 80% statements AND lines —
    // these entries exist only because each sits under a folder threshold that
    // is stricter still (./app/ and ./hooks/ want 90 lines, ./components/ 85).
    // Branch/function floors are set just under the measured value so the gate
    // is real without being brittle; raise them as coverage rises rather than
    // letting them drift down.
    //
    // EmbedClient is a large orchestration component whose functions are mostly
    // inline callbacks reached through integration tests, hence the low fn floor.
    './app/embed/session/EmbedClient.tsx': {
      branches: 80,
      functions: 35,
      lines: 80,
      statements: 80,
    },
    // Fully covered on extraction from EmbedClient.controller; hold it there.
    './app/embed/session/hooks/useAttachments.ts': { branches: 95, functions: 100, lines: 100, statements: 100 },
    './app/embed/session/hooks/useBootstrap.ts': { branches: 85, functions: 95, lines: 90, statements: 90 },
    './app/embed/session/hooks/useQueuedMessageManagement.ts': { branches: 70, functions: 80, lines: 85, statements: 85 },
    // Branch floors differ between the two same-named hooks: the session one
    // measures 77% branches, the docs one 90%. Keep them straight.
    './app/embed/session/hooks/useSessionManagement.ts': { branches: 75, functions: 95, lines: 90, statements: 90 },
    './components/components/Composer.tsx': { branches: 80, functions: 80, lines: 95, statements: 95 },
    './components/components/FocusTrap.tsx': { branches: 90, functions: 95, lines: 95, statements: 95 },
    './components/components/JumpToLatest.tsx': { branches: 90, functions: 90, lines: 95, statements: 95 },
    './components/components/Suggestions.tsx': { branches: 90, functions: 45, lines: 95, statements: 95 },
    './components/components/TypingIndicator.tsx': { branches: 90, functions: 90, lines: 95, statements: 95 },
    './app/embed/docs/hooks/useMessageOperations.ts': { branches: 80, functions: 75, lines: 85, statements: 85 },
    './app/embed/docs/hooks/useSessionManagement.ts': { branches: 85, functions: 95, lines: 90, statements: 90 },
    './app/embed/docs/components/MessageFeedbackButtons.tsx': { branches: 60, functions: 60, lines: 85, statements: 85 },
  },
}

export default createJestConfig(config)