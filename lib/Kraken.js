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
  const kraken = new Kraken({
    api_key: auth.apiKey,
    api_secret: auth.apiSecret
  })

  return function (url, width, callback, webpCompression) {
    // https://github.com/kraken-io/kraken-node#usage---image-url
    const opts = {
      wait: true,
      url
    }
    opts.lossy = opts.webp = Boolean(webpCompression)

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
    logger.log(`Kraken ${url}`)

    kraken.url(opts, function (err, data) {
      if (!err && data.kraked_url) {
        // image optimized
        const url = data.kraked_url

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
            const imageBody = []

            res.on('data', (chunk) => { imageBody.push(chunk) })
            res.on('end', () => {
              logger.log(`Kraken optimized ${url}`)
              callback(null, {
                url,
                imageBody: Buffer.concat(imageBody)
              })
            })
          }
        }).setTimeout(20000).on('error', (e) => {
          logger.error(e)
          callback(e, { url })
        })
        return
      }

      callback(err)
    })
  }
}
