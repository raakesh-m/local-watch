const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './renderer/app.ts',
  target: 'web', // Changed from 'electron-renderer' to 'web' to avoid external marking
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
    fallback: {
      buffer: require.resolve('buffer/'),
      events: require.resolve('events/'),
      util: require.resolve('util/'),
      stream: false,
      crypto: false,
      path: false,
      fs: false,
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
};
