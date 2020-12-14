'use strict'

// log on files
const logger = require('./../lib/Logger')
// authentication with Store API
const auth = require('./../lib/Auth')
// AWS SDK API abstraction
const Aws = require('./../lib/Aws')
// Cloudinary API abstraction
const Cloudinary = require('./../lib/Cloudinary')
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
// extends file uploads to S3 object storage
const multerS3 = require('multer-s3')
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
      cloudinaryAuth,
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
          if (typeof val === 'string' && val && /^[\d]{3,}\//.test(val)) {
            params[param] = `${storeId}/${val}`
          }
        })
      }
      const run = ({ bucket, runMethod }) => {
        // force current Space bucket
        params.Bucket = bucket
        return runMethod(method, params)
      }
      for (let i = 1; i < spaces.length; i++) {
        const space = spaces[i]
        run(space).catch(err => {
          err.locationConstraint = space.locationConstraint
          err.awsEndpoint = space.awsEndpoint
          err.bucket = space.bucket
          logger.error(err)
        })
      }
      return run(spaces[0])
    }

    // setup Cloudinary client
    const cloudinary = Cloudinary(cloudinaryAuth)

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

    app.post(urls.upload, (req, res) => {
      const { storeId } = req
      const { s3, bucket, host } = spaces[0]
      logger.log(`${storeId} Uploading...`)
      // unique object key
      let key = '@v3/'
      let filename, mimetype
      // logger.log('upload')
      const cacheControl = 'public, max-age=31536000'

      // setup multer for file upload
      const upload = multer({
        storage: multerS3({
          s3,
          bucket,
          acl: 'public-read',
          contentType: multerS3.AUTO_CONTENT_TYPE,
          cacheControl,
          key: (req, file, cb) => {
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
            filename = file.originalname.replace(/[^\w-.]/g, '').toLowerCase()
            key += `${Date.now()}-${filename}`
            mimetype = file.mimetype
            cb(null, `${storeId}/${key}`)
          }
        }),
        limits: {
          // maximum 2mb
          fileSize: 2000000
        }
      }).array('file', 1)

      upload(req, res, (err) => {
        logger.log(`${storeId} ${key} Uploaded to ${bucket}`)
        if (err) {
          // respond with error
          const usrMsg = {
            en_us: 'This file can not be uploaded',
            pt_br: 'Este arquivo não pode ser carregado'
          }
          sendError(res, 400, 3001, err.message, usrMsg)
        } else {
          // uploaded
          const mountUri = key => `https://${host}/${storeId}/${key}`
          const uri = mountUri(key)
          const picture = {
            zoom: { url: uri }
          }
          const pictureBytes = {}
          // resize/optimize image
          let i = -1

          const respond = () => {
            logger.log(`${bucket} ${key} All optimizations done`)
            res.json({
              bucket,
              key,
              // return complete object URL
              uri,
              picture
            })
          }

          const callback = err => {
            if (!err) {
              // next image size
              i++
              if (i < pictureOptims.length) {
                let newKey
                const { label, size, webp } = pictureOptims[i]
                newKey = `imgs/${label}/${key}`

                setTimeout(() => {
                  // image resize/optimization with Cloudinary
                  let fixSize, originUrl
                  if (picture[label] && webp) {
                    fixSize = false
                    originUrl = picture[label].url
                  } else {
                    fixSize = true
                    originUrl = uri
                  }

                  cloudinary(originUrl, fixSize && size, webp, (err, data) => {
                    if (!err && data) {
                      const { id, format, url, bytes, imageBody } = data

                      return new Promise(resolve => {
                        let contentType
                        if (webp) {
                          // fix filepath extension and content type header
                          if (format) {
                            if (!newKey.endsWith(format)) {
                              // converted to best optim format
                              newKey += `.${format}`
                            }
                            contentType = format === 'jpg' ? 'image/jpeg' : `image/${format}`
                          } else {
                            // converted to WebP
                            newKey += '.webp'
                            contentType = 'image/webp'
                          }
                        } else {
                          contentType = mimetype
                        }

                        if (imageBody || id) {
                          const s3Options = {
                            ACL: 'public-read',
                            ContentType: contentType,
                            CacheControl: cacheControl,
                            Key: `${storeId}/${newKey}`
                          }
                          if (imageBody) {
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
                      })

                        .then(url => {
                          if (url && (!picture[label] || pictureBytes[label] > bytes)) {
                            // add to response pictures
                            picture[label] = { url, size }
                            pictureBytes[label] = bytes
                          }
                          callback()
                        })
                    }
                    callback(err)
                  })
                }, 200)
              } else {
                setTimeout(() => {
                  // all done
                  respond()
                }, 100)
              }
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
        runMethod(method, params)
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
