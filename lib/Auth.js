'use strict'

// log on files
const logger = require('./Logger.js')
// Node raw HTTP module with https protocol
const https = require('https')

// use request queue to prevent rate limit
const requestsQueue = []
setInterval(() => {
  // run queue
  let request = requestsQueue.shift()
  if (request) {
    sendRequest(request)
  }
}, 500)

const sendRequest = ([ storeId, myId, accessToken, callback ]) => {
  // check authentication headers with Store API
  // https://ecomstore.docs.apiary.io/#introduction/overview/authentication
  https.get({
    hostname: 'api.e-com.plus',
    path: '/v1/(auth).json',
    headers: {
      'X-Store-ID': storeId,
      'X-My-ID': myId,
      'X-Access-Token': accessToken
    }
  }, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // OK
      callback(null, true)
    } else if (res.statusCode === 401) {
      // unauthorized
      callback(null, false)
    } else {
      // unexpected response
      let err = new Error('Unexpected response status ' + res.statusCode + ' from Store API')
      // pass error and response object
      callback(err, res)
    }
  }).on('error', (err) => {
    logger.error(err)
    // callback with error
    callback(err)
  })
}

module.exports = (...args) => {
  // add to requests queue
  requestsQueue.push(args)
  /* debug
  logger.log(JSON.stringify(args, null, 2))
  */
}
