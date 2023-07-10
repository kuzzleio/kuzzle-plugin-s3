---
code: true
type: page
title: create
---

# delete

Deletes an existing empty S3 bucket

## Query Syntax

### HTTP

```http
URL: http://kuzzle:7512/_plugin/s3/bucket/delete/<bucketName>/<bucketRegion>
Method: DELETE
```

### Other protocols 

```js
{
  "controller": "s3",
  "action": "delete",
  "bucketName": "mybucket"
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
  "result": {
    "result": "ok"
  }
}
```
