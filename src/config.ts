import { figue } from 'figue';

export const config = figue({
  app: {
    version: {
      doc: 'Application current version',
      format: 'string',
      default: '0.0.0',
      env: 'PACKAGE_VERSION',
    },
    lastCommitSha: {
      doc: 'Application last commit SHA version',
      format: 'string',
      default: '',
      env: 'VITE_VERCEL_GIT_COMMIT_SHA',
    },
    baseUrl: {
      doc: 'Application base url',
      format: 'string',
      default: '/',
      env: 'BASE_URL',
    },
    env: {
      doc: 'Application current env',
      format: 'enum',
      values: ['production', 'development', 'preview', 'test'],
      default: 'development',
      env: 'VITE_VERCEL_ENV',
    },
  },
  showBanner: {
    doc: 'Show the banner',
    format: 'boolean',
    default: false,
    env: 'VITE_SHOW_BANNER',
  },
})
  .loadEnv({
    ...import.meta.env,
    // Because the string 'import.meta.env.PACKAGE_VERSION' is statically replaced during build time (see 'define' in vite.config.ts)
    PACKAGE_VERSION: import.meta.env.PACKAGE_VERSION,
  })
  .validate()
  .getConfig();
