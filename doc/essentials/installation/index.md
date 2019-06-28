---
code: false
type: page
title: Installation
order: 100
---

# Installation

Clone the plugin repository in your `plugins/available` directory and then link it to the `plugins/enabled` directory.

```bash
git clone https://github.com/kuzzleio/kuzzle-plugin-s3 plugins/available/kuzzle-plugin-s3
ln -s ../available/kuzzle-plugin-s3 plugins/enabled/kuzzle-plugin-s3
```

Then go to your plugin directory and run the following command `npm install`.

You can now restart Kuzzle and check [http://localhost:7512](http://localhost:7512), you should see the plugin name under the key `serverInfo.kuzzle.plugins.s3`.

## Plugin configuration

In your `kuzzlerc` file, you can change the following configuration variable:

  - `bucketName`: AWS S3 bucket
  - `region`: AWS S3 region
  - `signedUrlTTL`: TTL in [ms](https://www.npmjs.com/package/ms) format before Presigned URL expire or the uploaded file is deleted
  - `redisPrefix`: Redis key prefix
  - `vault.accessKeyIdPath`: Path to AWS Access key id in Vault
  - `vault.secretAccessKeyPath`: Path to AWS secret access key in Vault

```js
{
  "plugins": {
    "s3": {
      "bucketName": "your-s3-bucket",
      "region": "eu-west-3",
      "signedUrlTTL": "20min",
      "redisPrefix": "s3Plugin/uploads",
      "vault": {
        "accessKeyIdPath": "aws.s3.accessKeyId",
        "secretAccessKeyPath": "aws.s3.secretAccessKey"
      }
    }
  }
}
```

## Credentials

This plugin needs AWS S3 credentials with the `PutObject` and `DeleteObject` permissions.  
 
Theses credentials can be set in the [Vault](/core/1/guides/essentials/secrets-vault/).  

By default the format is the following:
```js
{
  "aws": {
    "s3": {
      "accessKeyId": "accessKeyId",
      "secretAccessKey": "secretAccessKey"
    }
  }
}
```

You can change the path of the credentials used by the plugin by changing the `vault.accessKeyIdPath` and `vault.secretAccessKeyPath` values in the configuration.  

If you cannot use the Vault, it's also possible to set the AWS S3 credentials in the following environment variables:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`

Environment variable have precedence over the Vault.

## AWS S3 Bucket configuration

First you must configure your bucket to allow public access to uploaded files.  
Go to the `Permissions` tab in your bucket configuration and in `Bucket Policy` add the following statement:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AddPerm",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

Then you have to allow Cross Origin Request by editing the CORS Configuration:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<CORSRule>
    <AllowedOrigin>your-app-domain.com</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <MaxAgeSeconds>3000</MaxAgeSeconds>
    <AllowedHeader>Content-Type</AllowedHeader>
    <AllowedHeader>Authorization</AllowedHeader>
</CORSRule>
</CORSConfiguration>
```
