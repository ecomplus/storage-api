'use strict'

// Node raw HTTP modules
const http = require('http')
const https = require('https')

module.exports = (url, callback, timeout = 10000) => {
  let httpClient
  if (url.startsWith('https')) {
    httpClient = https
  } else {
    httpClient = http
  }

  // GET image body
  httpClient.get(url, (res) => {
    if (res.statusCode !== 200) {
      // consume response data to free up memory
      res.resume()
      callback(new Error(`Unexpected get image response status ${res.statusCode}`))
    } else {
      const imageBody = []
      res.on('data', (chunk) => { imageBody.push(chunk) })
      res.on('end', () => {
        callback(null, Buffer.concat(imageBody))
      })
    }
  })

    // set request timeout pass errors to callback
    .setTimeout(timeout)
    .on('timeout', () => {
      callback(new Error('Timed out trying to get image body'))
    })
    .on('error', callback)
}
