---
code: true
type: page
title: exists
---

# exists

Check if a S3 bucket exists.

## Query Syntax

### HTTP

```http
URL: http://kuzzle:7512/bucket/exists/<bucketRegion>/<bucketName>
Method: GET
```

### Other protocols 

```js
{
  "controller": "s3",
  "action": "exists",
  "bucketName": "bucket-name",
  "bucketRegion": "eu-east-1"
}
```

## Arguments

- `bucketName`: the name of the bucket to check
- `bucketRegion`: the AWS region where the bucket is located 

## Response

Returns an object with the following properties:

```js
{
  "status": 200,
  "error": null,
  "action": "exists",
  "controller": "s3/bucket",
  "result": { "exists": "true" }
}
```
