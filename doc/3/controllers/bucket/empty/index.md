---
code: true
type: page
title: empty
---

# empty

Empties all objects from an S3 bucket while keeping the bucket itself intact.

## Query Syntax

### HTTP

```http
URL: http://kuzzle:7512/bucket/empty/<bucketName>/<bucketRegion>
Method: POST
Body:
```

```js
{
  "controller": "s3",
  "action": "empty",
  "bucketName": "<bucketName>",
  "bucketRegion": "<bucketRegion>"
}
```

### Other Protocols

```js
{
  "controller": "s3",
  "action": "empty",
  "bucketName": "<bucketName>",
  "bucketRegion": "<bucketRegion>"
}
```

## Arguments

- `bucketName`: The name of the bucket to empty. 
- `bucketRegion`: The region where the bucket is located.

## Response

Returns an object with the following properties:

```js
{
  "status": 200,
  "error": null,
  "action": "empty",
  "controller": "s3/bucket",
  "result": {
    "message": "Bucket \"<bucketName>\" has been emptied."
  }
}
```

