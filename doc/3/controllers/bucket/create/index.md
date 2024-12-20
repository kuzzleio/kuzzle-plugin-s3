---
code: true
type: page
title: create
---

# create

Creates a S3 bucket

## Query Syntax

### HTTP

```http
URL: http://kuzzle:7512/bucket/create/<bucketName>/<bucketRegion>
Method: POST
Body:
```

```js
      {
        "options":{ <OptionsList> },
        "cors":{ <CORS> }
        "disableDotsInName": false
      }
```

### Other protocols 

```js
{
  "controller": "s3",
  "action": "create",
  "bucketName": "<bucketname>",
  "bucketRegion": "<bucketRegion>",
  "body": {
      "options": { <OptionsList> },
      "cors":{ <CORS> }
      "disableDotsInName": false 
  }
}
```

## Arguments

- `bucketName`: the name of the bucket, bucket will need to follow the [AWS Bucket Name Guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html).
- `bucketRegion`: the region where you want to create the bucket, see [AWS Documentation](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html) for available regions.
- `options` (optional): Specify options like a custom ACL, otherwise it will default to :

```js
      {
        ACL: 'public-read'
      }
```
- `cors` (optional): Specify a custom CORS policy to add to your bucket, otherwise it will default to :

```js
      {
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'POST', 'PUT'],
        AllowedOrigins: ['*'],
      }
```

- `disableDotsInName` (optional): changes the name checks on the `bucketName` variable to check for dots, which would prevent [S3 Transfer Acceleration](https://aws.amazon.com/fr/s3/transfer-acceleration/) from working.

## Response

Returns an object with the following properties:

```js
{
      "status": 200,
      "error": null,
      "action": "create",
      "controller": "s3/bucket",
      "result": {
        "bucketName: "<bucketname>",
        "bucketRegion":"<bucketregion>",
        "options": { <OptionsList> },
        "cors": { <CORS> }
      }
}
```
