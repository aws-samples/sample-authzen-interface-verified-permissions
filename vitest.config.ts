import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      // https://docs.powertools.aws.dev/lambda/typescript/latest/core/logger/#suppress-logsq
      POWERTOOLS_DEV: 'true',
      POWERTOOLS_LOG_LEVEL: 'SILENT',
    },
  },
});
