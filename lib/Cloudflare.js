'use strict'

// Dependencies
const axios = require('axios').default
const FormData = require('form-data')
const download = require('./RequestDownload')

// Cloudflare module
module.exports = (auth) => {

  // Setup axios client with api key
  const cloudflareClient = axios.create({
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${auth.accountId}`,
    headers: { Authorization: `Bearer ${auth.apiKey}` }
  })

  // Function to Compress image
  return function (imageFile, __callback = () => {}) {

    // API Payload
    let options = new FormData()
    options.append('file', imageFile)

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

    // Verify if responded in 30s
    const timer = setTimeout(() => {
      callback(new Error('Cloudflare optimization timed out'))
      logger.log(`Cloudflare timed out`)
    }, 30000)

    // Upload image to cloudflare
    cloudflareClient({
      method: 'POST',
      url: '/images/v1',
      headers: { ...options.getHeaders() },
      data: options
    }).then((response) => {
      const id = response.data.result.id
      const variants = response.data.result.variants
      const fetchedImages = []
      variants.forEach(vari => {
        if (vari.includes('normal') || vari.includes('zoom') || vari.includes('big') ||  vari.includes('w90')) {
          const labels = vari.split('/')
          const label = labels[labels.length - 1]
          download(vari, { 'Accept': 'image/webp,image/*,*/*;q=0.8' }, (err, imageBody) => {
            if (err) logger.error(err)
            fetchedImages.push({ imageBody, label })
            if (fetchedImages.length === 4) {
              callback(err, { convertedImages: fetchedImages })
              setTimeout(() => cloudflareClient.delete(`/images/v1/${id}`), 60000)
            }
          })
        }
      })
    }).catch((err) => callback(err))
  }
}
