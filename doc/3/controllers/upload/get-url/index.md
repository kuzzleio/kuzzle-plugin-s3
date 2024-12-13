---
code: true
type: page
title: getUploadUrl
---

# getUrl

Returns a Presigned URL to upload directly to S3.  
The URL expires after a configurable TTL. (Configurable in the [kuzzlerc file](/official-plugins/s3/3/essentials/installation#plugin-configuration))

---

## Query Syntax

### HTTP

```http
URL: http://kuzzle:7512/_plugin/s3/upload/get-url/<bucketRegion>/<bucketName>/<filename>?uploadDir="<uploadDir>"
Method: GET
```

### Other protocols

```js
{
  "controller": "s3/upload",
  "action": "getUploadUrl",
  "bucketName": "bucket-name"
  "bucketRegion": "bucket-region"
  "filename": "headcrab.png", 
  "uploadDir": "xen" 
}
```

---

## Arguments

- `filename`: Uploaded file name
- `uploadDir`: Upload directory (see [s3 file key](https://docs.aws.amazon.com/AmazonS3/latest/dev/UsingMetadata.html#object-keys))
- `bucketName` : Name of the bucket 
- `bucketRegion` : Region of the bucket 
- `publicUrl` (optionnal): boolean indicating that plugin should return public URL
---

## Response

Returns an object with the following properties:
 - `fileKey`: file key in S3 bucket
 - `uploadUrl`: presigned upload URL
 - `ttl`: TTL in ms for the URL validity and before the uploaded file deletion

```js
{
  "status": 200,
  "error": null,
  "controller": "s3/upload",
  "action": "getUploadUrl",
  "requestId": "<unique request identifier>",
  "result": {
    "fileKey": "xen/<uuid>-headcrab.png", 
    "uploadUrl": "https://s3.eu-west-3.amazonaws.com/...", 
    "ttl": 1200000 
  }
}
```

---

## Possible errors

- [Common errors](/core/1/api/essentials/errors#common-errors)
