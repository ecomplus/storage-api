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
  return (imageFile, pictureOptims, webpCallback = () => {}) => new Promise((resolve, reject) => {
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
        const webpPromises = []
        for (let i = 0; i < pictureOptims.length; i++) {
          const { label, avif } = pictureOptims[i]
          const variantUrl = variants.find(url => url.endsWith(`/${label}`))
          const Accept = (avif ? 'image/avif' : 'image/webp') + ',image/*,*/*;q=0.8'

          const download = () => axios.get(variantUrl, {
            headers: { Accept },
            timeout: 7000,
            responseType: 'arraybuffer'
          }).then(({ data }) => ({ label, avif, imageBody: data }))

          if (avif) {
            try {
              // Proccess avif as async
              transformations.push(await download())
            } catch (err) {
              logger.error(err)
            }
          } else {
            webpPromises.push(new Promise(resolve => {
              download()
                .then(resolve)
                .catch(err => {
                  logger.error(err)
                  resolve(null)
                })
            }))
          }
        }

        // Resolve promise using avif transformations
        resolve({ transformations })

        // Verify if all promises finisehd
        if (webpPromises.length) {
          const transformations = await Promise.all(webpPromises)
          webpCallback({ transformations })
        }

        // Always delete all image from Cloudflare
        return setTimeout(() => {
          cloudflareClient.delete(`/images/v1/${id}`).catch(logger.error)
        }, 3000)
      })
      .catch(reject)
  })
}
