'use strict'

// log on files
const logger = require('./../lib/Logger')
// authentication with Store API
const auth = require('./../lib/Auth')
// AWS SDK API abstraction
const Aws = require('./../lib/Aws')
// Cloudflare API abstraxtion
const CloudFlare = require('./../lib/Cloudflare')

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
      optims.push({ size, label, avif: false })
      optims.push({ size, label, avif: true })
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
      s3: apiPath + 's3/:method.json'
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
      limits: { fileSize: 2000000 }
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

      // Validate file
      localUpload.single('file')(req, res, (err) => {
        if (err) {
          sendError(res, 400, 3001, err.message, {
            en_us: 'This file cannot be uploaded, make sure it is a valid image with up to 2mb',
            pt_br: 'O arquivo não pôde ser carregado, verifique se é uma imagem válida com até 2mb'
          })
        } else {
          // Retrieve local image data
          let dir = req.query.directory
          if (typeof dir === 'string' && dir.charAt(0) === '/') {
            dir = dir.substr(1).replace(/[^\w-/]/g, '').replace('//', '')
            if (dir.length) {
              key += dir.toLowerCase() + '/'
            }
          }

          // Keep filename
          const filename = req.file.originalname.replace(/[^\w-.]/g, '').toLowerCase()
          key += `${Date.now()}-${filename}`
          const { mimetype } = req.file

          runMethod('putObject', {
            ...baseS3Options,
            ContentType: mimetype,
            Key: `${storeId}/${key}`,
            Body: req.file.buffer
          })
            .then(() => {
              logger.log(`${storeId} ${key} Uploaded to ${bucket}`)
              // zoom uploaded
              const mountUri = (key, baseUrl = cdnHost || host) => `https://${baseUrl}/${storeId}/${key}`
              const uri = mountUri(key)
              const picture = { zoom: { url: uri } }
              const extra = {}

              const respond = () => {
                logger.log(`${storeId} ${key} ${bucket} ${Object.keys(picture).length} uploads done`)
                res.json({
                  bucket,
                  key,
                  // return complete object URL
                  uri,
                  picture,
                  extra
                })
              }

              // Upload to cloudiflare Images
              cloudflare(req.file, pictureOptims)
                .then(async ({ transformations }) => {
                  for (let i = 0; i < pictureOptims.length; i++) {
                    const { label, size, avif } = pictureOptims[i]
                    const transformation = transformations.find(transformation => {
                      return (
                        transformation.label === label &&
                        transformation.avif === avif
                      )
                    })

                    // Normal webp transformations
                    if (transformation) {
                      const { imageBody } = transformation
                      let newKey = `imgs/${label}/${key}`
                      let contentType
                      if (avif) {
                        // converted to Avif
                        newKey += '.avif'
                        contentType = 'image/avif'
                      } else {
                        // converted to Webp
                        newKey += '.webp'
                        contentType = 'image/webp'
                      }

                      // PUT new image on S3 buckets
                      try {
                        await runMethod('putObject', {
                          ...baseS3Options,
                          ContentType: contentType,
                          Key: `${storeId}/${newKey}`,
                          Body: imageBody
                        })
                        // add to response pictures
                        if (!picture[label]) {
                          picture[label] = {
                            url: mountUri(newKey),
                            size
                          }
                        }
                      } catch (err) {
                        logger.error(err)
                      }
                    }
                  }

                  return setTimeout(() => {
                    // all done
                    respond()
                  }, 50)
                })

                .catch(err => {
                  logger.error(err)
                  // return image without all transformations
                  return respond()
                })
            })

            .catch(err => {
              const usrMsg = {
                en_us: 'This file cannot be uploaded to CDN',
                pt_br: 'O arquivo não pôde ser carregado para o CDN'
              }
              sendError(res, 400, 3002, err.message, usrMsg)
            })
        }
      })
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
      console.log('App is running')
      logger.log('Storage API running with Express on port ' + port)
    })
  }
})
