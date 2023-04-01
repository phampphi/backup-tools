var path = require('path');
const TerserPlugin = require("terser-webpack-plugin");

module.exports = function (env, argv) {
    return [{
        target: 'node',
        experiments: {
            topLevelAwait: true
        },
        entry: {
            index: [
                path.resolve(__dirname, 'src/index.js')
            ]
        },
        module: {
            rules: [{
                test: /\.js$/,
                include: path.resolve(__dirname, 'src'),
                resolve: {
                    fullySpecified: false,
                },
            }]
        },
        optimization: {
            minimize: argv.mode == 'production',
            minimizer: [
                new TerserPlugin({
                    terserOptions: {
                        keep_fnames: /AbortSignal/,
                    },
                }),
            ]
        },
        devtool: 'source-map'
    },
    ]
}