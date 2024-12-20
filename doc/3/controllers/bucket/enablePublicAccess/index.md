---
code: true
type: page
title: enable-public-access
---

# delete

Disable public access block for a bucket (Minio buckets will be ignored for this call and receive a message to see minIO server config)

## Query Syntax

### HTTP

```http
URL: http://kuzzle:7512/bucket/public-access/<bucketName>/<bucketRegion>
Method: DELETE
```

### Other protocols 

```js
{
  "controller": "s3",
  "action": "enablePublicAccess",
  "bucketName": "bucket-name"
  "bucketRegion": "eu-west-3"
}
```

## Arguments

- `bucketName`: the name of the bucket to delete
- `bucketRegion`: the AWS region where the bucket is located

## Response

Returns an object with the following properties:

```js
{
  "status": 200,
  "error": null,
  "action": "enablePublicAccess",
  "controller": "s3/bucket",
  "result": { message: `Public access enabled for bucket "bucket-name".` };
}
```
