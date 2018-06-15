'use strict'

// log on files
// const logger = require('./../lib/Logger.js')

// Kraken.io SDK client
const Kraken = require('kraken')
var client

module.exports = ({ api_key, api_secret }) => {
  // setup Kraken client with API credentials
  client = new Kraken({
    api_key,
    api_secret
  })

  return client
}
