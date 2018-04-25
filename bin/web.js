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
    let { port, baseUri, awsAccess, doSpace } = JSON.parse(data)

    // new Express application
    let app = Express()

    app.listen(port, () => {
      logger.log('Storage API running with Express on port ' + port)
    })
  }
})
