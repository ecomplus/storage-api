'use strict'

// log on files
const logger = require('./Logger.js')
// Kraken.io SDK client
const Kraken = require('kraken')
// download image from Kraken temporary CDN
const download = require('./Download')

module.exports = (auth, awsConfig) => {
  // setup Kraken client with API credentials
  const kraken = new Kraken({
    api_key: auth.apiKey,
    api_secret: auth.apiSecret
  })
  let s3Store
  if (awsConfig) {
    const { locationConstraint, accessKeyId, secretAccessKey } = awsConfig
    s3Store = {
      key: accessKeyId,
      secret: secretAccessKey,
      region: locationConstraint,
      acl: 'public_read'
    }
  }

  return function (callbackUrl, url, width, webpCompression, { bucket, path, headers }, __callback) {
    // https://github.com/kraken-io/kraken-node#usage---image-url
    const opts = { url }
    if (s3Store && bucket) {
      opts.s3_store = {
        ...s3Store,
        bucket,
        path,
        headers
      }
    }
    if (callbackUrl) {
      opts.callback_url = callbackUrl
    } else {
      opts.wait = true
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
      logger.log(`Kraken timed out with opts:\n${JSON.stringify(opts, null, 2)}`)
    }, 20000)

    kraken.url(opts, (status, data) => {
      logger.log(`2. Kraken process finished (${opts.callback_url})`)
      if (status instanceof Error) {
        // error response
        return callback(status)
      }
      // OK
      if (!opts.wait) {
        return callback(null, {})
      }

      // image optimized syncronously
      const url = (status || data).kraked_url
      if (url) {
        logger.log(`3. Kraken optimized ${url}`)
        setTimeout(() => {
          download(url, (err, imageBody) => {
            callback(err, { url, imageBody })
          })
        }, 500)
      }

      const err = new Error('Unexpected Kraken response')
      err.status = status
      err.data = data
      logger.error(err)
      callback(err)
    })
  }
}
