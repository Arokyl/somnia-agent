const webpack = require('webpack')

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@somnia-agent/shared'],
  webpack: (config) => {
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@react-native-async-storage\/async-storage|pino-pretty)$/,
      })
    )

    return config
  },
}

module.exports = nextConfig
