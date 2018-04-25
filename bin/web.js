'use strict'

// log on files
const logger = require('./../lib/Logger.js')
// authentication with Store API
const auth = require('./../lib/Auth.js')

// NodeJS filesystem module
const fs = require('fs')

// Express web framework
// https://www.npmjs.com/package/express
const Express = require('express')
// middleware to handle file uploads
const multer = require('multer')

// AWS SDK for S3
const aws = require('aws-sdk')
// extends file uploads to S3 object storage
const multerS3 = require('multer-s3')

// process.cwd() can change
// keep initial absolute path
let root = process.cwd()
// read config file
fs.readFile(root + '/config/config.json', 'utf8', (err, data) => {
  if (err) {
    // can't read config file
    throw err
  } else {
    let { port, baseUri, doSpace } = JSON.parse(data)

    // set S3 endpoint to DigitalOcean Spaces
    const spacesEndpoint = new aws.Endpoint(doSpace.datacenter + '.digitaloceanspaces.com')
    const s3 = new aws.S3({
      endpoint: spacesEndpoint
    })
    // setup multer for file uploads
    const upload = multer({
      storage: multerS3({
        s3: s3,
        bucket: doSpace.name,
        acl: 'public-read',
        key: function (request, file, cb) {
          cb(null, file.originalname)
        }
      })
    }).array('upload', 1)

    // new Express application
    let app = Express()

    app.use((req, res, next) => {
      // check store ID
      let storeId = parseInt(req.get('X-Store-ID'), 10)
      if (storeId > 100) {
        let authCallback = (err, authRes) => {
          if (!err) {
            if (authRes === true) {
              // authenticated
              // continue
              req.store = storeId
              next()
            } else {
              // unauthorized
              res.status(401).end()
            }
          } else if (authRes) {
            // error response from Store API
            res.status(authRes.statusCode).end()
          } else {
            // unexpected error
            res.status(500).end()
          }
        }
        // check authentication
        auth(storeId, req.get('X-My-ID'), req.get('X-Access-Token'), authCallback)
      } else {
        res.status(403).end()
      }
    })

    app.post(baseUri + 'upload', (req, res) => {
      upload(req, res, function (err) {
        if (err) {
          logger.error(err)
        }
      })
    })

    app.listen(port, () => {
      logger.log('Storage API running with Express on port ' + port)
    })
  }
})
