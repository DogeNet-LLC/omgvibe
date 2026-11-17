declare const __OMGVIBE_VERSION__: string | undefined;

/** Injected by the bundler from package.json; `dev` when run straight from source. */
export const VERSION: string = typeof __OMGVIBE_VERSION__ === 'string' ? __OMGVIBE_VERSION__ : 'dev';

export const PACKAGE_NAME = 'omgvibe';
