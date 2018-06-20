'use strict'

// log on files
const logger = require('./../lib/Logger.js')

// Kraken.io SDK client
const Kraken = require('kraken')

// Node raw HTTP modules
const http = require('http')
const https = require('https')

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
        height: width
      }
    }
    // debug
    logger.log(opts)

    kraken.url(opts, function (err, data) {
      if (err) {
        logger.error(err, opts)
      } else if (data.kraked_url) {
        // image optimized
        let url = data.kraked_url

        let httpClient
        if (url.startsWith('https')) {
          httpClient = https
        } else {
          httpClient = http
        }

        // GET image body
        httpClient.get(url, (res) => {
          if (res.statusCode !== 200) {
            // consume response data to free up memory
            res.resume()
            callback(null, { url })
          } else {
            let imageBody = []

            res.on('data', (chunk) => { imageBody.push(chunk) })
            res.on('end', () => {
              callback(null, {
                url,
                imageBody: Buffer.concat(imageBody)
              })
            })
          }
        }).on('error', (e) => {
          logger.error(e)
          callback(e, { url })
        })
        return
      }

      callback(err)
    })
  }
}
