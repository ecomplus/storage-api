'use strict'

// log on files
const logger = require('./../lib/Logger.js')
// authentication with Store API
const auth = require('./../lib/Auth.js')
// AWS SDK API abstraction
const Aws = require('./../lib/Aws.js')
// Kraken.io API abstraction
const Kraken = require('./../lib/Kraken.js')

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

// Redis to store buckets
const redis = require('redis')

// read config file
fs.readFile(path.join(__dirname, '../config/config.json'), 'utf8', (err, data) => {
  if (err) {
    // can't read config file
    throw err
  } else {
    let {
      port,
      baseUri,
      adminBaseUri,
      doSpace,
      krakenAuth
    } = JSON.parse(data)

    // S3 endpoint to DigitalOcean Spaces
    let locationConstraint = doSpace.datacenter
    let awsEndpoint = locationConstraint + '.digitaloceanspaces.com'
    let {
      s3,
      createBucket,
      runMethod
    } = Aws(awsEndpoint, locationConstraint, doSpace)

    // setup Kraken client
    let kraken = Kraken(krakenAuth)

    let sendError = (res, status, code, devMsg, usrMsg) => {
      if (!devMsg) {
        devMsg = 'Unknow error'
      }
      if (!usrMsg) {
        usrMsg = {
          'en_us': 'Unexpected error, try again later',
          'pt_br': 'Erro inesperado, tente novamente mais tarde'
        }
      }
      // send error response
      res.status(status).json({
        'status': status,
        'error_code': code,
        'message': devMsg,
        'user_message': usrMsg
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
    let Key = (storeId) => 'stg:' + storeId

    let middlewares = [
      (req, res, next) => {
        // check store ID
        let storeId = parseInt(req.params.store, 10)
        if (storeId >= 100) {
          let authCallback = (err, authRes) => {
            if (!err) {
              if (authRes === true) {
                // authenticated
                // continue
                req.store = storeId
                next()
              } else {
                // unauthorized
                let devMsg = 'Unauthorized, invalid X-My-ID and X-Access-Token authentication headers'
                let usrMsg = {
                  'en_us': 'No authorization for the requested resource',
                  'pt_br': 'Sem autorização para o recurso solicitado'
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
          let myId = req.get('X-My-ID')
          let accessToken = req.get('X-Access-Token')
          if (myId && accessToken) {
            auth(storeId, myId, accessToken, authCallback)
          } else {
            let devMsg = 'Undefined user ID (X-My-ID) or Access Token (X-Access-Token)'
            sendError(res, 403, 102, devMsg)
          }
        } else {
          let devMsg = 'Nonexistent or invalid Store ID'
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
              let devMsg = 'No storage bucket found for this store ID'
              let usrMsg = {
                'en_us': 'There is no file database configured for this store',
                'pt_br': 'Não há banco de arquivos configurado para esta loja'
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
    let apiPath = '/:store' + baseUri
    let urls = {
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
        verbs: [ 'POST' ],
        reference: [
          'https://github.com/ecomclub/storage-api/wiki',
          'https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html'
        ]
      })
    })

    app.get(apiPath, (req, res) => {
      // GET bucket name
      let bucket = req.bucket
      res.json({
        bucket,
        host: bucket + '.' + awsEndpoint
      })
    })

    app.post(urls.upload, (req, res) => {
      let bucket = req.bucket
      // unique object key
      let key = '@'
      let filename, mimetype
      // logger.log('upload')
      let cacheControl = 'public, max-age=31536000'

      // setup multer for file upload
      let upload = multer({
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
            key += Date.now().toString() + '-' + filename
            mimetype = file.mimetype
            cb(null, key)
          }
        }),
        limits: {
          // maximum 3mb
          fileSize: 3000000
        }
      }).array('file', 1)

      upload(req, res, (err) => {
        if (err) {
          // respond with error
          let usrMsg = {
            'en_us': 'This file can not be uploaded',
            'pt_br': 'Este arquivo não pode ser carregado'
          }
          sendError(res, 400, 3001, err.message, usrMsg)
        } else {
          // uploaded
          let uri = 'https://' + bucket + '.' + awsEndpoint + '/' + key
          var respond = function () {
            res.json({
              bucket,
              key,
              // return complete object URL
              uri
            })
          }

          switch (mimetype) {
            case 'image/jpeg':
            case 'image/png':
            case 'image/webp':
            case 'image/gif':
            case 'image/bmp':
              // optimize image
              // URL of image to be optimized
              let imageUrl = uri
              let widths = [ 700, 400, 100 ]
              let i = 0
              if (!filename.endsWith('.webp')) {
                // will be converted to WebP
                key += '.webp'
              }

              let callback = function (err, data) {
                if (!err) {
                  let { url, imageBody } = data
                  if (imageBody) {
                    let newKey
                    if (i > 0) {
                      newKey = 'imgs/' + widths[i - 1] + 'px/' + key
                    } else {
                      newKey = key
                    }
                    // debug
                    // logger.log(newKey)
                    // PUT new image on S3 bucket
                    runMethod('putObject', {
                      Bucket: bucket,
                      ACL: 'public-read',
                      Body: imageBody,
                      ContentType: 'image/webp',
                      CacheControl: cacheControl,
                      Key: newKey
                    }).catch((err) => {
                      logger.error(err)
                    })
                  }

                  if (i < widths.length) {
                    if (url) {
                      imageUrl = url
                    }
                    setTimeout(() => {
                      // next image size
                      kraken(imageUrl, widths[i], callback)
                      i++
                    }, 200)
                  } else {
                    setTimeout(() => {
                      // all done
                      respond()
                    }, 100)
                  }
                } else {
                  // respond with error
                  let usrMsg = {
                    'en_us': 'Error while handling image, the file may be protected or corrupted',
                    'pt_br': 'Erro ao manipular a imagem, o arquivo pode estar protegido ou corrompido'
                  }
                  sendError(res, 415, uri, err.message, usrMsg)
                }
              }

              setTimeout(() => {
                // first image without resize
                kraken(imageUrl, null, callback)
              }, 200)
              break

            default:
              respond()
          }
        }
      })
    })

    app.post(urls.s3, (req, res) => {
      // setup method params
      let params = req.body
      if (params) {
        if (typeof params !== 'object' || Array.isArray(params)) {
          // invalid body
          let devMsg = 'Request body (method params) must be empty or a valid JSON object'
          sendError(res, 400, 3013, devMsg)
          return
        }
      } else {
        // empty
        params = {}
      }

      // run an AWS S3 method
      let method = req.params.method
      if (!/Object/.test(method)) {
        // forbidden
        let devMsg = 'You are able to call only object methods'
        sendError(res, 403, 3011, devMsg)
      } else if (typeof s3[method] !== 'function') {
        // not found
        let devMsg = 'Invalid method name, not found' +
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
      let storeId = parseInt(req.params.store, 10)
      if (storeId >= 100) {
        // check request origin IP
        let ip = req.get('X-Real-IP') || req.connection.remoteAddress
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
