'use strict'

// log on files
const logger = require('./../lib/Logger.js')
// AWS SDK for S3
const AWS = require('aws-sdk')

// control delay to prevent AWS API 503 error
const delayRequest = 8
const delayQueue = {}

const runMethod = (s3, method, params, isRetry = false) => {
  const bucket = params.Bucket
  if (!delayQueue[bucket] || delayQueue[bucket] < 1) {
    delayQueue[bucket] = 1
  }
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      setTimeout(() => {
        // rollback request queue delay
        if (isRetry === true) {
          delayQueue[bucket] -= 1000
        }
        delayQueue[bucket] -= delayRequest
      }, delayRequest - 1)

      // pass request to AWS S3 client and run request
      s3[method](params, (err, data) => {
        if (err) {
          if (err.statusCode === 503 || err.code === 'SlowDown') {
            if (isRetry !== true) {
              const currentDelay = delayQueue[bucket]
              if (currentDelay < 3000) {
                delayQueue[bucket] += 1000
                return setTimeout(() => {
                  runMethod(s3, method, params, true).then(resolve).catch(reject)
                }, currentDelay)
              }
            }
          }
          if (method === 'listObjects') {
            logger.error(err)
          }
          reject(err)
        } else {
          // success
          resolve(data)
        }

        // log request
        const log = 'AWS.' + method + '(' + bucket + ') => ' +
          'err: ' + Boolean(err).toString() + '; next: ' + delayQueue[bucket]
        logger.log(log)
      })
    }, delayQueue[bucket])

    // increase delay for next requests
    delayQueue[bucket] += delayRequest
  })
}

const listObjects = (s3, bucket, prefix, marker) => {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjects-property
  const params = {
    Bucket: bucket,
    // try list all keys, use API limit
    MaxKeys: 1000
  }
  if (prefix) {
    // keys that begin with the specified prefix
    // good to list 'directories' contents
    params.Prefix = prefix
  }
  if (marker) {
    // where you want Amazon S3 to start listing from
    // Amazon S3 starts listing after this specified key
    params.Marker = marker
  }

  return new Promise((resolve, reject) => {
    // run method and pass to callback
    runMethod('listObjects', params).then(resolve).catch(reject)
  })
}

const getBucketSize = (s3, bucket) => {
  return new Promise((resolve, reject) => {
    // list all bucket objects
    const objects = []

    const list = (nextMarker) => {
      const successCallback = (data) => {
        if (Array.isArray(data.Contents)) {
          // store objects
          data.Contents.forEach((object) => {
            objects.push(object)
          })

          if (data.IsTruncated && data.NextMarker) {
            // next page
            // start after last object
            list(data.NextMarker)
          } else {
            // count total bytes
            let size = 0
            for (let i = 0; i < objects.length; i++) {
              size += objects[i].Size
            }
            // pass size to callbak
            resolve({ size })
          }
        }
      }

      listObjects(bucket, null, nextMarker).then(successCallback).catch(reject)
    }
    // start listing
    list()
  })
}

module.exports = function ({ awsEndpoint, locationConstraint, accessKeyId, secretAccessKey }) {
  // set S3 endpoint
  const spacesEndpoint = new AWS.Endpoint(awsEndpoint)
  const s3 = new AWS.S3({
    endpoint: spacesEndpoint,
    credentials: new AWS.Credentials({
      accessKeyId,
      secretAccessKey
    })
  })
  // log S3 config options
  const debug = 'Seting up S3 client endpoint:' +
    '\n' + awsEndpoint +
    '\nRegion ' + locationConstraint
  logger.log(debug)

  this.runMethod = (method, params) => runMethod(s3, method, params)
  this.listObjects = (bucket, prefix, marker) => listObjects(s3, bucket, prefix, marker)
  this.getBucketSize = bucket => getBucketSize(s3, bucket)
  this.s3 = s3
}
