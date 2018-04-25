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
        key: (req, file, cb) => {
          // original file extension
          let ext = file.originalname.split('.').pop()
          // unique key
          let key = req.store + '-' + Date.now().toString()
          cb(null, key + '.' + ext)
        }
      })
    }).array('upload', 1)

    // new Express application
    let app = Express()

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

    app.use((req, res, next) => {
      // check store ID
      let storeId = parseInt(req.get('X-Store-ID'), 10)
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
              sendError(res, 401, 102, devMsg, usrMsg)
            }
          } else if (authRes) {
            // error response from Store API
            sendError(res, authRes.statusCode, 103, err.message)
          } else {
            // unexpected error
            sendError(res, 500, 104)
          }
        }
        // check authentication
        auth(storeId, req.get('X-My-ID'), req.get('X-Access-Token'), authCallback)
      } else {
        let devMsg = 'Nonexistent or invalid X-Store-ID header'
        sendError(res, 403, 101, devMsg)
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
