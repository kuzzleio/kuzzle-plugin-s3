---
code: true
type: page
title: delete
---

# delete

Deletes an existing empty S3 bucket

## Query Syntax

### HTTP

```http
URL: http://kuzzle:7512/bucket/delete/<bucketName>/<bucketRegion>
Method: DELETE
```

### Other protocols 

```js
{
  "controller": "s3",
  "action": "delete",
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
  "action": "delete",
  "controller": "s3/bucket",
  "result": { message: `Bucket "bucket-name" deleted.` }
}
```
