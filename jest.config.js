/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    // Only run .test.ts files inside src/
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    // ts-jest uses the project tsconfig
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                // Relax strict settings for tests so we can write concise fixtures
                strict: true,
                module: 'CommonJS',
                moduleResolution: 'node',
            },
        }],
    },
    // Map @/* to src/* (mirrors tsconfig paths)
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
};
