'use strict'

// log on files
const logger = require('./../lib/Logger.js')
// authentication with Store API
const auth = require('./../lib/Auth.js')
// AWS SDK API abstraction
const Aws = require('./../lib/Aws.js')

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
      doSpace
    } = JSON.parse(data)

    // S3 endpoint to DigitalOcean Spaces
    let locationConstraint = doSpace.datacenter
    let awsEndpoint = locationConstraint + '.digitaloceanspaces.com'
    let {
      s3,
      createBucket
    } = Aws(awsEndpoint, locationConstraint, doSpace)

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
    // new database client
    const client = redis.createClient()

    // Redis key
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
        client.getAsync(Key(req.store))
          .then((val) => {
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
          })
          .catch(() => {
            // database error
            sendError(res, 500, 121)
          })
      }
    ]

    // API routes for specific store
    let apiPath = '/:store' + baseUri
    // API middlewares
    app.use(apiPath, ...middlewares)

    app.get(apiPath, (req, res) => {
      // GET bucket name
      let bucket = req.bucket
      res.json({
        bucket,
        host: bucket + '.' + awsEndpoint
      })
    })

    app.post(apiPath + 'upload', (req, res) => {
      let bucket = req.bucket
      // setup multer for file uploads
      let upload = multer({
        storage: multerS3({
          s3,
          bucket,
          acl: 'public-read',
          key: (req, file, cb) => {
            // unique key
            let key = '/'
            let dir = req.query.dir
            if (dir) {
              key += dir.replace(/[^\w-/]/g, '') + '/'
            }
            // keep filename
            key += Date.now().toString() + '-' + file.originalname.replace(/[^\w-.]/g, '')
            cb(null, key.toLowerCase())
          }
        })
      }).array('upload', 1)

      upload(req, res, (err) => {
        if (err) {
          logger.error(err)
        }
      })
    })

    app.get(adminBaseUri + 'setup/:store/', (req, res) => {
      // check store ID
      let storeId = parseInt(req.params.store, 10)
      if (storeId >= 100) {
        // check request origin IP
        let ip = app.get('X-Real-IP') || req.connection.remoteAddress
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
        res.status(406).end()
      }
    })

    app.listen(port, () => {
      logger.log('Storage API running with Express on port ' + port)
    })
  }
})
