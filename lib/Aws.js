'use strict'

// AWS SDK for S3
const aws = require('aws-sdk')

module.exports = (awsEndpoint, locationConstraint) => {
  // set S3 endpoint
  let spacesEndpoint = new aws.Endpoint(awsEndpoint)
  let s3 = new aws.S3({
    endpoint: spacesEndpoint
  })

  return {
    s3
  }
}
