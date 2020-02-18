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

  return function (url, width, __callback, webpCompression) {
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
    logger.log(`1. Kraken ${url}`)

    // force timeout with 20s
    let callbackSent = false
    let timer
    const callback = (err, data) => {
      if (!callbackSent) {
        callbackSent = true
        __callback(err, data)
      }
      if (timer) {
        clearTimeout(timer)
      }
    }
    timer = setTimeout(() => {
      callback(new Error('Kraken optimization timed out'))
    }, 20000)

    kraken.url(opts, function (err, data) {
      logger.log(`2. Kraken process finished`)
      if (!err && data.kraked_url) {
        // image optimized
        const url = data.kraked_url
        logger.log(`3. Kraken optimized ${url}`)
        const fallback = err => {
          logger.error(err)
          callback(err, { url })
        }

        let httpClient
        if (url.startsWith('https')) {
          httpClient = https
        } else {
          httpClient = http
        }

        setTimeout(() => {
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
                callback(null, {
                  url,
                  imageBody: Buffer.concat(imageBody)
                })
              })
            }
          })

            // set request timeout and handle errors with fallback
            .setTimeout(10000)
            .on('timeout', () => {
              fallback(new Error('Timed out trying to get obtimized image body'))
            })
            .on('error', fallback)
        }, 500)
        return
      }

      callback(err)
    })
  }
}
