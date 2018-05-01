# storage-api
E-Com Plus Storage API (DO Spaces) Node.js Express App

# Technology stack
+ [NodeJS](https://nodejs.org/en/) 8.9.x
+ [Express 4](http://expressjs.com/) web framework

# Reference
https://www.digitalocean.com/community/tutorials/how-to-upload-a-file-to-object-storage-with-node-js
https://developers.digitalocean.com/documentation/spaces/
https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html

# Setting up
```bash
git clone https://github.com/ecomclub/storage-api
cd storage-api
cp config/config-sample.json config/config.json
nano config/config.json
```

Edit `config.json` placing correct values for your environment.

Setup AWS credentials with one of the following ways
[described here](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html).
In a CRON service, we recommend to set the
[environment variables](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html)
on service file.

After that, start app with node:

```bash
node ./main.js
```

# Web server
You need to use a web server such as NGINX or Apache HTTP,
proxy passing the requests to configured TCP port.
