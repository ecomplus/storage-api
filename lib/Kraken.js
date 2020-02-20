'use strict'

// log on files
const logger = require('./../lib/Logger.js')

// Kraken.io SDK client
const Kraken = require('kraken')

module.exports = (auth, { awsEndpoint, locationConstraint, accessKeyId, secretAccessKey }) => {
  // setup Kraken client with API credentials
  const kraken = new Kraken({
    api_key: auth.apiKey,
    api_secret: auth.apiSecret
  })
  const s3Store = {
    key: accessKeyId,
    secret: secretAccessKey,
    region: locationConstraint,
    acl: 'public_read'
  }

  return function (url, width, webpCompression, { bucket, path, headers }, __callback) {
    // https://github.com/kraken-io/kraken-node#usage---image-url
    const opts = {
      url,
      s3_store: {
        ...s3Store,
        bucket,
        path,
        headers
      }
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
    const callback = (err, data) => {
      if (!callbackSent) {
        callbackSent = true
        __callback(err, data)
      }
      if (timer) {
        clearTimeout(timer)
      }
    }
    const timer = setTimeout(() => {
      callback(new Error('Kraken optimization timed out'))
    }, 20000)

    kraken.url(opts, status => {
      logger.log('2. Kraken process finished')
      if (status instanceof Error) {
        // error response
        callback(status)
      } else {
        // OK
        callback(null, {})
      }
    })
  }
}
