const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './renderer/app.ts',
  target: 'web',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      // Ensure pako works in browser environment
      pako: path.resolve(__dirname, 'node_modules/pako'),
      // Fix process/browser resolution
      'process/browser': require.resolve('process/browser'),
    },
    fallback: {
      buffer: require.resolve('buffer/'),
      events: require.resolve('events/'),
      util: require.resolve('util/'),
      process: require.resolve('process/browser'),
      stream: require.resolve('stream-browserify'),
      crypto: false,
      path: false,
      fs: false,
      net: false,
      tls: false,
      dgram: false,
      dns: false,
      http: false,
      https: false,
      os: false,
      zlib: false,
    },
  },
  output: {
    filename: 'app.js',
    path: path.resolve(__dirname, 'renderer'),
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],
  mode: 'development',
  devtool: 'source-map',
  optimization: {
    minimize: false, // Keep readable for debugging
  },
};
