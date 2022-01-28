'use strict'

// Dependencies
const axios = require('axios').default
const FormData = require('form-data')
const download = require('./Download')

// Cloudflare module
module.exports = (auth) => {

  // Setup axios client with api key
  const cloudinaryClient = axios.create({
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${auth.accountId}`,
    headers: { Authorization: `Bearer ${auth.apiKey}` }
  })

  // Function to Compress image
  return function (url, __callback) {

    // API Payload
    let options = new FormData()
    options.append('file', url)

    // Force timeout with 20s
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

    // Verify if responded in 20s
    const timer = setTimeout(() => {
      callback(new Error('Cloudflare optimization timed out'))
      logger.log(`Cloudflare timed out`)
    }, 20000)

    // Upload image to cloudflare
    cloudinaryClient({
      method: 'POST',
      url: '/images/v1',
      headers: { ...options.getHeaders() },
      data: options
    }).then((response) => {
      const id = response.data.result.id
      const variants = response.data.result.variants
      const normalImage = variants.find(v => v.includes('normal')) || variants[0]
      if (normalImage) {
        download(`${normalImage}`, (err, imageBody) => {
          if (err) logger.error(err)
          callback(err, {
            url: normalImage,
            imageBody,
            ...response.data.result
          })
          setTimeout(() => cloudinaryClient.delete(`/images/v1/${id}`), 60000)
        })
      }
    }).catch((err) => callback(err))
  }
}
