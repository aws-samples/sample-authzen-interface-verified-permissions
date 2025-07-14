import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      // option to suppress logs when unit testing
      // https://docs.powertools.aws.dev/lambda/typescript/latest/core/logger/#suppress-logs
      POWERTOOLS_DEV: 'true',
      POWERTOOLS_LOG_LEVEL: 'SILENT',
    },
  },
});
