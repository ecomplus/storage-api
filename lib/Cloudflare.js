'use strict'

const logger = require('./../lib/Logger.js')
const axios = require('axios').default
const FormData = require('form-data')

// Cloudflare module
module.exports = (auth) => {
  // Setup axios client with api key
  const cloudflareClient = axios.create({
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${auth.accountId}`,
    headers: { Authorization: `Bearer ${auth.apiKey}` },
    timeout: 20000
  })

  // Function to Compress image
  return (imageFile, pictureOptims) => new Promise((resolve, reject) => {
    const fData = new FormData()
    fData.append('file', imageFile.buffer, { filename: imageFile.filename })

    // Upload image to cloudflare
    cloudflareClient({
      method: 'POST',
      url: '/images/v1',
      headers: { ...fData.getHeaders() },
      data: fData
    })
      .then(async ({ data }) => {
        // Retrieve upload data
        const id = data.result.id
        const { variants } = data.result

        // Download each picture optim variant
        const transformations = []
        for (let i = 0; i < pictureOptims.length; i++) {
          const { label, webp } = pictureOptims[i]
          const variantUrl = variants.find(url => url.endsWith(`/${label}`))
          const Accept = (webp ? 'image/webp' : 'image/png,image/jpeg') + ',image/*,*/*;q=0.8'
          try {
            const { data } = await axios.get(variantUrl, {
              headers: { Accept },
              timeout: 7000,
              responseType: 'arraybuffer'
            })
            transformations.push({
              label,
              webp,
              imageBody: data
            })
          } catch (err) {
            logger.error(err)
          }
        }
        resolve({ transformations })

        // Always delete all image from Cloudflare
        return setTimeout(() => {
          cloudflareClient.delete(`/images/v1/${id}`).then(({ data }) => {
            logger.log(data)
          }).catch(logger.error)
        }, 60000)
      })
      .catch(reject)
  })
}
