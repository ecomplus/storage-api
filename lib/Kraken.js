'use strict'

// log on files
const logger = require('./../lib/Logger.js')

// Kraken.io SDK client
const Kraken = require('kraken')

module.exports = (auth) => {
  // setup Kraken client with API credentials
  let kraken = new Kraken({
    api_key: auth.apiKey,
    api_secret: auth.apiSecret
  })
  let opts = {
    wait: true
  }

  return function (url, width, callback) {
    // https://github.com/kraken-io/kraken-node#usage---image-url
    opts.url = url
    if (width) {
      opts.resize = {
        // the best strategy (portrait or landscape) will be selected
        // according to image aspect ratio
        strategy: 'auto',
        width,
        // max height equals to width
        heigth: width
      }
    }
    kraken.url(opts, function (err, data) {
      if (err) {
        logger.error(err)
      } else if (data.kraked_url) {
        // image optimized
        callback(null, { url: data.kraked_url })
        return
      }
      callback(err)
    })
  }
}
