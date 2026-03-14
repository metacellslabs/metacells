const { defineConfig } = require('@meteorjs/rspack');
const path = require('node:path');

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
    resolve: {
      alias: {
        'simple-yenc$': path.resolve(
          __dirname,
          'node_modules/simple-yenc/dist/esm.js',
        ),
      },
    },
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
