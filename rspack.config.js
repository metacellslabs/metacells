const { defineConfig } = require('@meteorjs/rspack');

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
