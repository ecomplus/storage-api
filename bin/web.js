'use strict'

// log on files
const logger = require('./../lib/Logger')
// authentication with Store API
const auth = require('./../lib/Auth')
// AWS SDK API abstraction
const Aws = require('./../lib/Aws')
// Kraken.io API abstraction
const Kraken = require('./../lib/Kraken')
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
      hostname,
      baseUri,
      adminBaseUri,
      doSpace,
      krakenAuth,
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
    const locationConstraint = doSpace.datacenter
    const awsEndpoint = locationConstraint + '.digitaloceanspaces.com'
    const awsConfig = {
      awsEndpoint,
      locationConstraint,
      ...doSpace
    }
    const {
      s3,
      createBucket,
      runMethod
    } = Aws(awsConfig)

    // setup Kraken client
    const kraken = Kraken(krakenAuth)

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
    const client = redis.createClient()
    // Redis key pattern
    const Key = (key, tmp = false) => `stg${(tmp ? ':tmp' : '')}:${key}`

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
                req.store = storeId
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
      },

      (req, res, next) => {
        // get bucket name from database
        client.get(Key(req.store), (err, val) => {
          if (!err) {
            if (val) {
              req.bucket = val
              next()
            } else {
              // not found
              const devMsg = 'No storage bucket found for this store ID'
              const usrMsg = {
                en_us: 'There is no file database configured for this store',
                pt_br: 'Não há banco de arquivos configurado para esta loja'
              }
              sendError(res, 404, 122, devMsg, usrMsg)
            }
          } else {
            // database error
            logger.error(err)
            sendError(res, 500, 121)
          }
        })
      }
    ]

    // API routes for specific store
    const apiPath = '/:store' + baseUri
    const urls = {
      upload: apiPath + 'upload.json',
      s3: apiPath + 's3/:method.json',
      krakenCallback: apiPath + 'kraken/callback.json'
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
      const bucket = req.bucket
      res.json({
        bucket,
        host: bucket + '.' + awsEndpoint
      })
    })

    app.post(urls.upload, (req, res) => {
      const bucket = req.bucket
      logger.log(`${bucket} Uploading...`)
      // unique object key
      let key = '@'
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
            key += 'v2-' + Date.now().toString() + '-' + filename
            mimetype = file.mimetype
            cb(null, key)
          }
        }),
        limits: {
          // maximum 2mb
          fileSize: 2000000
        }
      }).array('file', 1)

      upload(req, res, (err) => {
        logger.log(`${bucket} ${key} Uploaded to S3`)
        if (err) {
          // respond with error
          const usrMsg = {
            en_us: 'This file can not be uploaded',
            pt_br: 'Este arquivo não pode ser carregado'
          }
          sendError(res, 400, 3001, err.message, usrMsg)
        } else {
          // uploaded
          const mountUri = key => `https://${bucket}.${awsEndpoint}/${key}`
          const uri = mountUri(key)
          const picture = {
            zoom: { url: uri }
          }
          // resize/optimize image
          let i = -1
          let lastOptimizedUri

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

          const callback = (err, data) => {
            if (!err) {
              // next image size
              i++
              if (i < pictureOptims.length) {
                let newKey
                const { label, size, webp } = pictureOptims[i]
                const contentType = webp ? 'image/webp' : mimetype
                newKey = `imgs/${label}/${key}`
                if (webp) {
                  // converted to WebP
                  newKey += '.webp'
                }

                setTimeout(() => {
                  // image resize/optimization with Kraken.io
                  let callbackPath = urls.krakenCallback
                  for (const paramKey in req.params) {
                    if (req.params[paramKey]) {
                      callbackPath = callbackPath.replace(`:${paramKey}`, req.params[paramKey])
                    }
                  }
                  kraken(
                    `${(hostname || 'https://apx-storage.e-com.plus')}${callbackPath}`,
                    lastOptimizedUri || uri,
                    webp ? false : size,
                    webp,
                    {
                      bucket,
                      path: newKey,
                      headers: {
                        'Cache-Control': cacheControl,
                        'Content-Type': contentType
                      }
                    },

                    (err, data) => {
                      if (!err && data) {
                        return new Promise(resolve => {
                          const { id, url, imageBody } = data
                          if (url && !webp) {
                            lastOptimizedUri = url
                          }

                          if (imageBody || id) {
                            const s3Options = {
                              Bucket: bucket,
                              ACL: 'public-read',
                              ContentType: contentType,
                              CacheControl: cacheControl,
                              Key: newKey
                            }
                            if (imageBody) {
                              // PUT new image on S3 bucket
                              return runMethod('putObject', { ...s3Options, Body: imageBody })
                                .then(resolve)
                                .catch((err) => {
                                  logger.error(err)
                                  resolve(data)
                                })
                            }
                            // async handle with callback URL
                            client.setex(Key(id, true), 600, JSON.stringify(s3Options))
                            return resolve(true)
                          }
                          resolve(false)
                        })

                          .then(payload => {
                            if (payload !== false) {
                              // add to response pictures
                              picture[label] = { url: mountUri(newKey), size }
                            }
                            callback()
                          })
                      }
                      callback(err)
                    }
                  )
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

    app.use(urls.krakenCallback, (req, res) => {
      if (req.body) {
        const url = req.body.kraked_url
        if (url) {
          download(url, (err, imageBody) => {
            if (!err) {
              // get s3 options set on redis by Kreken request id
              const redisKey = Key(req.body.id, true)
              client.get(redisKey, (err, val) => {
                if (!err) {
                  // PUT new image on S3 bucket
                  runMethod('putObject', { ...JSON.parse(val), Body: imageBody })
                    .then(() => client.del(redisKey))
                    .catch(logger.error)
                } else {
                  logger.error(err)
                }
              })
            }
          })
        } else {
          // TODO: treat Kraken possible errors here
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
      } else if (typeof s3[method] !== 'function') {
        // not found
        const devMsg = 'Invalid method name, not found' +
          '\nAvailable AWS S3 methods:' +
          '\nhttps://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html'
        sendError(res, 404, 3012, devMsg)
      } else {
        // valid method
        // force store bucket
        params.Bucket = req.bucket

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

    app.get(adminBaseUri + 'setup/:store/', (req, res) => {
      // check store ID
      const storeId = parseInt(req.params.store, 10)
      if (storeId >= 100) {
        // check request origin IP
        const ip = req.get('X-Real-IP') || req.connection.remoteAddress
        if (ip) {
          switch (ip) {
            case '127.0.0.1':
            case '::1':
            case '::ffff:127.0.0.1':
              // localhost
              // setup storage for specific store
              createBucket(locationConstraint)
                .then(({ bucket }) => {
                  // save bucket name on databse
                  client.set(Key(storeId), bucket)
                  res.status(201).end()
                })
                .catch((err) => {
                  logger.error(err)
                  res.status(500).end(err.message)
                })
              break

            default:
              // remote
              // unauthorized
              res.status(401).end('Unauthorized client IP: ' + ip)
          }
        } else {
          // no reverse proxy ?
          res.status(407).end()
        }
      } else {
        res.status(406).end()
      }
    })

    app.listen(port, () => {
      logger.log('Storage API running with Express on port ' + port)
    })
  }
})
