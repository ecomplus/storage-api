'use strict'

// AWS SDK for S3
const aws = require('aws-sdk')

let createBucket = (s3, locationConstraint, bucket) => {
  if (!bucket) {
    // random bucket name
  }

  // work with Promises
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
  return new Promise((resolve, reject) => {
    let params = {
      Bucket: bucket,
      CreateBucketConfiguration: {
        LocationConstraint: locationConstraint
      }
    }
    s3.createBucket(params, (err, data) => {
      if (err) {
        reject(err)
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

module.exports = (awsEndpoint, locationConstraint) => {
  // set S3 endpoint
  let spacesEndpoint = new aws.Endpoint(awsEndpoint)
  let s3 = new aws.S3({
    endpoint: spacesEndpoint
  })

  return {
    s3,
    createBucket
  }
}
