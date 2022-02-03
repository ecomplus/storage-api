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
        const promises = []
        for (let i = 0; i < pictureOptims.length; i++) {
          const { label, avif } = pictureOptims[i]
          const variantUrl = variants.find(url => url.endsWith(`/${label}`))
          const Accept = (avif ? 'image/avif' : 'image/webp') + ',image/*,*/*;q=0.8'
          try {
            
            // Proccess avif as async
            if (avif) {
              
              const { data } = await axios.get(variantUrl, {
                headers: { Accept },
                timeout: 7000,
                responseType: 'arraybuffer'
              })
              transformations.push({ label, avif, imageBody: data })
            
            } else {
                
              // May thrown internal server error if download fails
              promises.push(
                axios.get(variantUrl, {
                  headers: { Accept },
                  timeout: 7000,
                  responseType: 'arraybuffer'
                }).catch()
              )
            
            }

            
          } catch (err) {
            logger.error(err)
          }
        }

        // Resolve promise using avif transformations
        resolve({ transformations })

        // Verify if all promises finisehd
        if (promises.length) {

          const responses = await Promise.all(promises)
          const additionalTransformations = pictureOptims.filter(p => p.avif === false).map((optin, i) => {
            const { data } = responses[i]
            return { label, avif, imageBody: response.data }
          })
          webpCallback(additionalTransformations)
        }

        // Always delete all image from Cloudflare
        return setTimeout(() => {
          cloudflareClient.delete(`/images/v1/${id}`).catch(logger.error)
        }, 20000)
      })
      .catch(reject)
  })
}
