'use strict'

// Node raw HTTP modules
const axios = require('axios').default

// Downloader
module.exports = (url, headers, callback, timeout = 10000) => {
  // GET image body
  axios.get(url, { headers, timeout, responseType: 'arraybuffer' }).then(res => {
    if (res.status !== 200) {
      // consume response data to free up memory
      res.resume()
      callback(new Error(`Unexpected get image response status ${res.status}`))
    } else {
      // Res.data sample return
      // <Buffer 52 49 46 46 bc 30 00 00 57 45 42 50 56 50 38 20 b0 30 00 00 b0 c1 00 9d 01 2a 40 01 d6 00 3e 49 22 8d 45 a2 a2 21 11 99 ce 14 28 04 84 b2 b6 60 af 59 ... >
      callback(null, res.data)
    }
  }).catch((err) => {
    callback(err)
  })
}
