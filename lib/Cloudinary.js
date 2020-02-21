'use strict'

// log on files
const logger = require('./Logger.js')
// Cloudinary SDK client
const cloudinary = require('cloudinary').v2
// download image from Kraken temporary CDN
const download = require('./Download')

module.exports = auth => {
  // setup Cloudinary client with API credentials
  cloudinary.config({
    cloud_name: auth.cloudName,
    api_key: auth.apiKey,
    api_secret: auth.apiSecret
  })

  return function (url, size, webpCompression, __callback) {
    // https://cloudinary.com/documentation/node_integration#overview
    const options = {
      quality: 'auto'
    }
    if (size) {
      // best fit respecting aspect ratio with max width/height
      options.width = size
      options.height = size
      options.crop = 'limit'
    }
    if (webpCompression) {
      // allow formating to webp lossy
      options.fetch_format = 'auto'
    }
    logger.log(`Cloudinary ${url}`)

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
      callback(new Error('Cloudinary optimization timed out'))
      logger.log(`Cloudinary timed out with:\n${url}\n${JSON.stringify(options, null, 2)}`)
    }, 20000)

    // upload image to Cloudinary with manipulation
    cloudinary.uploader.upload(url, options, (err, { format, url }) => {
      if (!err) {
        setTimeout(() => {
          download(url, (err, imageBody) => {
            if (err) {
              // error reading image ?
              logger.error(err)
            }
            callback(err, { format, url, imageBody })
          })
        }, 100)
      } else {
        callback(err)
      }
    })
  }
}
