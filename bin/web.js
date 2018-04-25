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

    app.post(baseUri + 'upload', function (req, res, next) {
      let storeId = parseInt(req.get('X-Store-ID'), 10)
      if (storeId > 100) {
        let authCallback = (err, authRes) => {
          if (!err) {
            if (authRes === true) {
              // authenticated
              upload(req, res, function (err) {
                if (err) {
                  logger.error(err)
                }
              })
            } else {
              // unauthorized
            }
          } else if (authRes) {
            // error response from Store API
          } else {
            // unexpected error
          }
        }

        // check authentication first
        auth(storeId, req.get('X-My-ID'), req.get('X-Access-Token'), authCallback)
      }
    })

    app.listen(port, () => {
      logger.log('Storage API running with Express on port ' + port)
    })
  }
})
