---
code: true
type: page
title: empty
---

# empty

Empties all objects from an S3 bucket while keeping the bucket itself intact. If the option `prefix` is used it will only empty what's match the prefix, default to match all

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
  "prefix": "<prefix>"
}
```

### Other Protocols

```js
{
  "controller": "s3",
  "action": "empty",
  "bucketName": "<bucketName>",
  "bucketRegion": "<bucketRegion>"
  "prefix": "<prefix>"
}
```

## Arguments

- `bucketName`: The name of the bucket to empty. 
- `bucketRegion`: The region where the bucket is located.
- `prefix`: The pattern to use to empty only file following the pattern

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

