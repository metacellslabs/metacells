const { defineConfig } = require('@meteorjs/rspack');
const path = require('node:path');

const OPTIONAL_WARNING_PATTERNS = [
  /Can't resolve 'bufferutil'/,
  /Can't resolve 'utf-8-validate'/,
  /Can't resolve '@img\/sharp-libvips-dev\/include'/,
  /Can't resolve '@img\/sharp-libvips-dev\/cplusplus'/,
  /Can't resolve '@img\/sharp-wasm32\/versions'/,
];

/**
 * Rspack configuration for Meteor projects.
 *
 * Provides typed flags on the `Meteor` object, such as:
 * - `Meteor.isClient` / `Meteor.isServer`
 * - `Meteor.isDevelopment` / `Meteor.isProduction`
 * - …and other flags available
 *
 * Use these flags to adjust your build settings based on environment.
 */
module.exports = defineConfig((Meteor) => {
  const isWorkerRuntime =
    String(process.env.METACELLS_ROLE || '')
      .trim()
      .toLowerCase() === 'worker';
  return {
    cache: Meteor.isDevelopment ? false : undefined,
    performance: false,
    resolve: {
      alias: {
        'simple-yenc$': path.resolve(
          __dirname,
          'node_modules/simple-yenc/dist/esm.js',
        ),
      },
    },
    ignoreWarnings: [
      (warning) => {
        const moduleName = String(
          warning?.module?.resource || warning?.moduleIdentifier || '',
        );
        const message = String(warning?.message || '');

        if (
          moduleName.includes('@eshaz/web-worker/cjs/node.js') &&
          /Critical dependency: the request of a dependency is an expression/.test(
            message,
          )
        ) {
          return true;
        }

        if (
          moduleName.includes('node_modules/ws/lib/') &&
          OPTIONAL_WARNING_PATTERNS.some((pattern) => pattern.test(message))
        ) {
          return true;
        }

        if (
          moduleName.includes('node_modules/sharp/lib/') &&
          (/Critical dependency: the request of a dependency is an expression/.test(
            message,
          ) ||
            OPTIONAL_WARNING_PATTERNS.some((pattern) => pattern.test(message)))
        ) {
          return true;
        }

        return false;
      },
    ],
    ...(Meteor.isDevelopment
      ? {
          devServer: {
            port: isWorkerRuntime ? 8086 : 8084,
          },
        }
      : {}),
    module: {
      rules: [
        // Add support for importing SVGs as React components
        {
          test: /\.svg$/i,
          issuer: /\.[jt]sx?$/,
          use: ['@svgr/webpack'],
        },
      ],
    },
  };
});
