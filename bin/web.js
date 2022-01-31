'use strict'

// log on files
const logger = require('./../lib/Logger')
// authentication with Store API
const auth = require('./../lib/Auth')
// AWS SDK API abstraction
const Aws = require('./../lib/Aws')
// Cloudflare API abstraxtion
const CloudFlare = require('./../lib/Cloudflare')
// download image from Kraken temporary CDN
const download = require('./../lib/Download')

// NodeJS filesystem module
const fs = require('fs')
// working with file and directory paths
const path = require('path')

// Express web framework
// https://www.npmjs.com/package/express
const Express = require('express')
// middleware to handle file uploads
const multer = require('multer')
// body parsing middleware
const bodyParser = require('body-parser')

// Redis to store buckets and Kraken async requests IDs
const redis = require('redis')

// read config file
fs.readFile(path.join(__dirname, '../config/config.json'), 'utf8', (err, data) => {
  if (err) {
    // can't read config file
    throw err
  } else {
    const {
      port,
      // hostname,
      baseUri,
      doSpace,
      cloudflareAuth,
      cdnHost,
      pictureSizes
    } = JSON.parse(data)

    const pictureOptims = (pictureSizes || [700, 350]).reduce((optims, size, i) => {
      const label = i === 0 ? 'big' : i === 1 ? 'normal' : 'small'
      optims.push(
        { size, label, webp: false },
        { size, label, webp: true }
      )
      return optims
    }, [])

    // S3 endpoint to DigitalOcean Spaces
    const spaces = doSpace.datacenters.map(locationConstraint => {
      const awsEndpoint = `${locationConstraint}.digitaloceanspaces.com`
      const client = new Aws({
        awsEndpoint,
        locationConstraint,
        ...doSpace
      })
      client.locationConstraint = locationConstraint
      client.awsEndpoint = awsEndpoint
      client.bucket = `${doSpace.name}-${locationConstraint}`
      client.host = `${client.bucket}.${locationConstraint}.cdn.digitaloceanspaces.com`
      return client
    })

    // run S3 method with all Spaces
    const runMethod = (method, params, storeId) => {
      if (storeId > 100) {
        ;['Key', 'Prefix'].forEach(param => {
          const val = params[param]
          if (typeof val === 'string' && val && !/^\d{3,}\//.test(val)) {
            params[param] = `${storeId}/${val}`
          }
        })
      }
      const run = ({ bucket, runMethod }) => {
        // force current Space bucket
        return runMethod(method, {
          ...params,
          Bucket: bucket
        })
      }
      if (method !== 'listObjects') {
        for (let i = 1; i < spaces.length; i++) {
          const space = spaces[i]
          run(space).catch(err => {
            err.locationConstraint = space.locationConstraint
            err.awsEndpoint = space.awsEndpoint
            err.bucket = space.bucket
            err.params = params
            logger.error(err)
          })
        }
      }
      return run(spaces[0])
    }

    // setup Cloudflare client
    const cloudflare = CloudFlare(cloudflareAuth)

    const sendError = (res, status, code, devMsg, usrMsg) => {
      if (!devMsg) {
        devMsg = 'Unknow error'
      }
      if (!usrMsg) {
        usrMsg = {
          en_us: 'Unexpected error, try again later',
          pt_br: 'Erro inesperado, tente novamente mais tarde'
        }
      }
      // send error response
      res.status(status).json({
        status: status,
        error_code: code,
        message: devMsg,
        user_message: usrMsg
      })
    }

    // new Express application
    const app = Express()
    app.use((req, res, next) => {
      // fix for CORS support
      if (req.method === 'OPTIONS') {
        res.status(204).end()
      } else {
        // process request
        next()
      }
    })
    // parse JSON request body
    app.use(bodyParser.json())

    // new database client
    const redisClient = redis.createClient()
    // Redis key pattern
    const genRedisKey = (key, tmp = false) => `stg${(tmp ? ':tmp' : '')}:${key}`

    const middlewares = [
      (req, res, next) => {
        // check store ID
        const storeId = parseInt(req.params.store, 10)
        if (storeId >= 100) {
          const authCallback = (err, authRes) => {
            if (!err) {
              if (authRes === true) {
                // authenticated
                // continue
                req.storeId = storeId
                next()
              } else {
                // unauthorized
                const devMsg = 'Unauthorized, invalid X-My-ID and X-Access-Token authentication headers'
                const usrMsg = {
                  en_us: 'No authorization for the requested resource',
                  pt_br: 'Sem autorização para o recurso solicitado'
                }
                sendError(res, 401, 103, devMsg, usrMsg)
              }
            } else if (authRes) {
              // error response from Store API
              sendError(res, 400, 104, err.message)
            } else {
              // unexpected error
              sendError(res, 500, 105)
            }
          }

          // check authentication
          const myId = req.get('X-My-ID')
          const accessToken = req.get('X-Access-Token')
          if (myId && accessToken) {
            auth(storeId, myId, accessToken, authCallback)
          } else {
            const devMsg = 'Undefined user ID (X-My-ID) or Access Token (X-Access-Token)'
            sendError(res, 403, 102, devMsg)
          }
        } else {
          const devMsg = 'Nonexistent or invalid Store ID'
          sendError(res, 403, 101, devMsg)
        }
      }
    ]

    // API routes for specific store
    const apiPath = '/:store' + baseUri
    const urls = {
      upload: apiPath + 'upload.json',
      s3: apiPath + 's3/:method.json',
      manipulationCallback: '/manipulation/callback.json'
    }
    // API middlewares
    app.use(apiPath, ...middlewares)

    app.get('/', (req, res) => {
      // public
      // expose API endpoints
      res.json({
        endpoints: urls,
        verbs: ['POST'],
        reference: [
          'https://github.com/ecomclub/storage-api/wiki',
          'https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html'
        ]
      })
    })

    app.get(apiPath, (req, res) => {
      // GET bucket name
      const { bucket, host } = spaces[0]
      res.json({
        bucket,
        host,
        baseUrl: `https://${host}/${req.storeId}/`
      })
    })

    // setup multer for file upload
    const localUpload = multer({
      storage: multer.memoryStorage(),
      limits: {
        // maximum 2mb
        fileSize: 2000000
      }
    })

    const baseS3Options = {
      ACL: 'public-read',
      CacheControl: 'public, max-age=31536000'
    }

    app.post(urls.upload, (req, res) => {
      const { storeId } = req
      const { bucket, host } = spaces[0]
      logger.log(`${storeId} Uploading...`)
      // unique object key
      let key = '@v3/'

      localUpload.single('file')(req, res, (err) => {
        if (err) {
          const usrMsg = {
            en_us: 'This file cannot be uploaded, make sure it is a valid image with up to 2mb',
            pt_br: 'O arquivo não pôde ser carregado, verifique se é uma imagem válida com até 2mb'
          }
          sendError(res, 400, 3001, err.message, usrMsg)
        } else {
          let dir = req.query.directory
          if (typeof dir === 'string' && dir.charAt(0) === '/') {
            // remove first char to not duplicate first bar
            // normalize, then remove empty paths
            dir = dir.substr(1).replace(/[^\w-/]/g, '').replace('//', '')
            if (dir.length) {
              key += dir.toLowerCase() + '/'
            }
          }
          // keep filename
          const filename = req.file.originalname.replace(/[^\w-.]/g, '').toLowerCase()
          key += `${Date.now()}-${filename}`
          const { mimetype } = req.file

          runMethod('putObject', {
            ...baseS3Options,
            ContentType: mimetype,
            Key: `${storeId}/${key}`,
            Body: req.file.buffer
          })
          // S3 Response
          .then(() => {
            logger.log(`${storeId} ${key} Uploaded to ${bucket}`)
            // zoom uploaded
            const mountUri = (key, baseUrl = cdnHost || host) => `https://${baseUrl}/${storeId}/${key}`
            const uri = mountUri(key)
            const picture = { zoom: { url: uri } }
            const pictureBytes = {}
            // resize/optimize image
            let i = -1
            let transformedImageBody = null

            const respond = () => {
              logger.log(`${storeId} ${key} ${bucket} All optimizations done`)
              res.json({ bucket, key, uri, picture })
            }

            const sizeMapping = {
              'normal': 'normal',
              'big': 'big',
              'zoom': 'zoom',
              'small': 'w90'
            }

            const callback = err => {
              if (!err) {
                // next image size
                i++
                if (i < pictureOptims.length) {
                  let newKey
                  const { label, size, webp } = pictureOptims[i]
                  newKey = `imgs/${label}/${key}`

                  const imageBuffer = i === 0 ? req.file.buffer : transformedImageBody
                  const imageBase64 = imageBuffer
                    ? `data:${mimetype};base64,${imageBuffer.toString('base64')}`
                    : null
                  // free memory
                  transformedImageBody = req.file = null

                  setTimeout(() => {
                      
                    // Retrieve url
                    let originUrl
                    if (picture[label] && webp) {
                      originUrl = picture[label].url
                    } else {
                      originUrl = uri
                    }

                    // Transform image updated to cloudflare
                    const transformImg = (isRetry = false) => {

                        cloudflare(imageBase64 || originUrl,  sizeMapping[label], (err, data) => {
                          if (!err && data) {
                            const { id, url, filename, imageBody } = data

                            return new Promise(resolve => {
                              
                              let contentType
                              contentType = `image/${filename.includes('.png') ? 'png' : filename.includes('.webp') ? 'webp' : 'jpeg'}`
                              if (imageBody || id) {
                                const s3Options = {
                                  ...baseS3Options,
                                  ContentType: contentType,
                                  Key: `${storeId}/${newKey}`
                                }
                                if (imageBody) {
                                  transformedImageBody = imageBody
                                  // PUT new image on S3 bucket
                                  return runMethod('putObject', { ...s3Options, Body: imageBody })
                                    .then(() => resolve(mountUri(newKey)))
                                    .catch((err) => {
                                      logger.error(err)
                                      resolve(url)
                                    })
                                }
                                // async handle with callback URL
                                redisClient.setex(genRedisKey(id, true), 600, JSON.stringify(s3Options))
                                return resolve(mountUri(newKey))
                              }
                              resolve(url)
                            
                            }).then(url => {
                              if (url && (!picture[label] || pictureBytes[label] > bytes)) {
                                picture[label] = { url, size }
                                pictureBytes[label] = bytes
                              }
                              callback()
                            })
                          }

                          if (
                            err &&
                            typeof err.message === 'string' &&
                            (err.message.indexOf('504 Gateway Timeout') > -1 || err.message.indexOf('503 Service Unavailable') > -1)
                          ) {
                            if (!isRetry) {
                              return setTimeout(() => transformImg(true), 1000)
                            } else {
                              return respond()
                            }
                          }
                          callback(err)
                        })

                    }

                    // Transofrm image
                    transformImg()

                  }, imageBase64 ? 50 : 300)
                } else {
                  setTimeout(() => {
                    // all done
                    respond()
                  }, 50)
                }

              } else if (uri && typeof err.message === 'string' && err.message.indexOf('cloud_name') > -1) {
                // image uploaded but not transformed
                respond()
                logger.error(err)
              } else {
                // respond with error
                const usrMsg = {
                  en_us: 'Error while handling image, the file may be protected or corrupted',
                  pt_br: 'Erro ao manipular a imagem, o arquivo pode estar protegido ou corrompido'
                }
                sendError(res, 415, uri, err.message, usrMsg)
              }
            }

            switch (mimetype) {
              case 'image/jpeg':
              case 'image/png':
                callback()
                break
              default:
                respond()
            }
          })
          // CDN Upload error
          .catch((err) => {
            const usrMsg = {
              en_us: 'This file cannot be uploaded to CDN',
              pt_br: 'O arquivo não pôde ser carregado para o CDN'
            }
            sendError(res, 400, 3002, err.message, usrMsg)
          })
        }
      })
    })

    app.use(urls.manipulationCallback, (req, res) => {
      if (req.body) {
        const { url, id } = req.body
        if (url) {
          download(url, (err, imageBody) => {
            if (!err) {
              // get s3 options set on redis by manipulation request id
              const redisKey = genRedisKey(id, true)
              redisClient.get(redisKey, (err, val) => {
                if (!err) {
                  // PUT new image on S3 bucket
                  runMethod('putObject', { ...JSON.parse(val), Body: imageBody })
                    .then(() => redisClient.del(redisKey))
                    .catch(logger.error)
                } else {
                  logger.error(err)
                }
              })
            }
          })
        } else {
          // TODO: treat possible errors here
          logger.log(req.body)
        }
      }
      res.send({})
    })

    app.post(urls.s3, (req, res) => {
      // setup method params
      let params = req.body
      if (params) {
        if (typeof params !== 'object' || Array.isArray(params)) {
          // invalid body
          const devMsg = 'Request body (method params) must be empty or a valid JSON object'
          sendError(res, 400, 3013, devMsg)
          return
        }
      } else {
        // empty
        params = {}
      }

      // run an AWS S3 method
      const method = req.params.method
      if (!/Object/.test(method)) {
        // forbidden
        const devMsg = 'You are able to call only object methods'
        sendError(res, 403, 3011, devMsg)
      } else if (typeof spaces[0].s3[method] !== 'function') {
        // not found
        const devMsg = 'Invalid method name, not found' +
          '\nAvailable AWS S3 methods:' +
          '\nhttps://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html'
        sendError(res, 404, 3012, devMsg)
      } else {
        // valid method
        runMethod(method, params, req.storeId)
          .then((data) => {
            // pass same data returned by AWS API
            res.json(data)
          })
          .catch((err) => {
            // pass AWS SDK error message
            sendError(res, 400, 3019, err.message)
          })
      }
    })

    app.listen(port, () => {
      logger.log('Storage API running with Express on port ' + port)
    })
  }
})
