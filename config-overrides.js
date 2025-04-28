const { ProvidePlugin, NormalModuleReplacementPlugin } = require('webpack');

module.exports = function override(config) {
  // Mevcut resolve.fallback ayarlarını koruyun ve "module" fallback'unu ekleyin
  config.resolve = {
    ...config.resolve,
    fallback: {
      ...config.resolve.fallback,
      module: false, // Node built-in "module"u devre dışı bırakıyoruz
      stream: require.resolve('stream-browserify'),
      assert: require.resolve('assert/'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      os: require.resolve('os-browserify/browser'),
      url: require.resolve('url/'),
      buffer: require.resolve('buffer/')
    },
    // Alias: Import './module' ifadesini emptyModule.js'ye yönlendirin.
    alias: {
      ...config.resolve.alias,
      './module': require.resolve('./emptyModule.js')
    }
  };

  // Pluginler
  config.plugins = [
    ...config.plugins,
    new ProvidePlugin({
      Buffer: ['buffer', 'Buffer']
    }),
    // Ek olarak, NormalModuleReplacementPlugin kullanımı (alias yeterli olmazsa)
    new NormalModuleReplacementPlugin(/^\.\/module$/, function(resource) {
      resource.request = require.resolve('./emptyModule.js');
    })
  ];

  // source-map-loader için exclude ayarlarını koruyun/güncelleyin
  config.module.rules = config.module.rules.map(rule => {
    if (rule.loader && rule.loader.includes('source-map-loader')) {
      return {
        ...rule,
        exclude: [
          /node_modules\/@walletconnect/,
          /node_modules\/@metamask/,
          /node_modules\/ethereumjs-abi/,
          /node_modules\/json-rpc-engine/,
          /node_modules\/xhr2-cookies/,
          /node_modules\/@walletconnect\/browser-utils/,
          /node_modules\/@walletconnect\/client/,
          /node_modules\/@walletconnect\/core/,
          /node_modules\/@walletconnect\/crypto/,
          /node_modules\/@walletconnect\/encoding/,
          /node_modules\/@walletconnect\/environment/,
          /node_modules\/@walletconnect\/http-connection/,
          /node_modules\/@walletconnect\/iso-crypto/,
          /node_modules\/@walletconnect\/jsonrpc-utils/,
          /node_modules\/@walletconnect\/randombytes/,
          /node_modules\/@walletconnect\/safe-json/,
          /node_modules\/@walletconnect\/socket-transport/,
          /node_modules\/@walletconnect\/utils/,
          /node_modules\/@walletconnect\/web3-provider/,
          /node_modules\/@walletconnect\/window-getters/,
          /node_modules\/@walletconnect\/window-metadata/
        ]
      };
    }
    return rule;
  });

  return config;
};
