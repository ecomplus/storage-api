'use strict'

// log on files
const logger = require('./../lib/Logger.js')

// AWS SDK for S3
const AWS = require('aws-sdk')
var s3

function makeKey (length) {
  // generate random string
  let text = ''
  let possible = 'abcdefghijklmnopqrstuvwxyz'

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

let createBucket = (locationConstraint, bucket, tries = 0) => {
  if (!bucket) {
    // random bucket name
    bucket = 'ecom-' + makeKey(16)
  }

  // work with Promises
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
  return new Promise((resolve, reject) => {
    let params = {
      Bucket: bucket,
      ACL: 'public-read',
      CreateBucketConfiguration: {
        LocationConstraint: locationConstraint
      }
    }
    /* debug
    logger.log(s3)
    logger.log(params)
    */

    s3.createBucket(params, (err, data) => {
      if (err) {
        if (tries < 3) {
          // retry
          tries++
          setTimeout(() => {
            // try with new random bucket
            createBucket(locationConstraint, null, tries).then(resolve).catch(reject)
          }, 1500)
        } else {
          reject(err)
        }
      } else {
        /*
        data = {
          Location: "http://examplebucket.s3.amazonaws.com/"
        }
        */
        resolve({ bucket })
      }
    })
  })
}

module.exports = (awsEndpoint, locationConstraint, { accessKeyId, secretAccessKey }) => {
  // set S3 endpoint
  const spacesEndpoint = new AWS.Endpoint(awsEndpoint)
  s3 = new AWS.S3({
    endpoint: spacesEndpoint,
    credentials: new AWS.Credentials({
      accessKeyId,
      secretAccessKey
    })
  })
  // log S3 config options
  let debug = 'Seting up S3 client endpoint:' +
    '\n' + awsEndpoint +
    '\nRegion ' + locationConstraint
  logger.log(debug)

  return {
    s3,
    createBucket
  }
}
