const path = require('path');

module.exports = {
  entry: './renderer/app.ts',
  target: 'electron-renderer',
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
  },
  output: {
    filename: 'app.js',
    path: path.resolve(__dirname, 'renderer'),
  },
  mode: 'development',
  devtool: 'source-map',
};
