---
code: true
type: page
title: getFilesKeys
---

# getFilesKeys

List the files keys uploaded to an S3 Bucket. Can be filtered on directories using filter.

---

## Query Syntax

### HTTP

```http
URL: http://kuzzle:7512/file/list-keys/<bucketRegion>/<bucketName>?prefix=<optional prefix>
Method: GET
```

### Other protocols

```js
{
  "controller": "s3/file",
  "action": "getFilesKeys",
  "bucketName": "bucket-name",
  "bucketRegion": "bucket-region",
  "prefix": "optional/path/prefix/"
}
```

---

## Arguments

- `bucketName` : bucketName
- `bucketRegion` : bucketRegion

---

## Response

Returns an array of file key objects object with the same info as the one returned by the [listObjectsV2 aws js](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjectsV2-propertycontaining) call but the Key value changed to show the absolute path to the file.

```js
 {
  "status": 200,
  "error": null,
  "action": "getFilesKeys",
  "controller": "s3/file",
  "requestId": "<unique request identifier>",
  "result": {
    "filesKeys": [
        {
          "Key": 'https://s3.eu-west-3.amazonaws.com/half-life/xen/0-headcrab.png',
          "LastModified": '2019-12-13T23:18:10.593Z',
          "ETag": '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
          "Size": 9163,
          "StorageClass": 'STANDARD',
          "Owner": {
            "DisplayName": '',
            "ID": ''
          }
        },
        {
          "Key": 'https://s3.eu-west-3.amazonaws.com/half-life/xen/0-Nihilanth.png',
          "LastModified": '2019-12-17T14:06:02.532Z',
          "ETag": '"911c0908dfc8fb66068bd8bb3fd6a142-1"',
          "Size": 20913,
          "StorageClass": 'STANDARD',
          "Owner": {
            "DisplayName": '',
            "ID": ''
          }
        }
      ]
  }
}
```

---

## Possible errors

- [Common errors](/core/1/api/essentials/errors#common-errors)
