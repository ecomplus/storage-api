'use strict'

// log on files
const logger = require('./../lib/Logger.js')

// Kraken.io SDK client
const Kraken = require('kraken')

module.exports = ({ api_key, api_secret }) => {
  // setup Kraken client with API credentials
  let kraken = new Kraken({
    api_key,
    api_secret
  })
  let opts = {
    wait: true
  }

  return function (url, width, callback) {
    // https://github.com/kraken-io/kraken-node#usage---image-url
    opts.url = url
    if (width) {
      opts.resize = {
        // exact width will be set
        // height will be adjusted according to aspect ratio
        strategy: 'portrait',
        width
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
