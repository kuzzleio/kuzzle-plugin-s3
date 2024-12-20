---
code: true
type: page
title: setPolicy
---

# exists

Set a Policy for a bucket

## Query Syntax

### HTTP

```http
URL: http://kuzzle:7512/bucket/set-policy/<bucketRegion>/<bucketName>
Method: POST
```

### Other protocols 

```js
{
  "controller": "s3",
  "action": "setPolicy",
  "bucketName": "bucket-name",
  "bucketRegion": "eu-east-1"
  "body" : {
    "policy": {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "s3:ListBucket"
          ],
          "Resource": [
            "arn:aws:s3:::example-bucket"
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject"
          ],
          "Resource": [
            "arn:aws:s3:::bucket-name/*"
          ]
        }
      ]
    }
  }
}
```

## Arguments

- `bucketName`: the name of the bucket
- `bucketRegion`: the AWS region where the bucket is located 

## Response

Returns an object with the following properties:

```js
{
  "status": 200,
  "error": null,
  "action": "setPolicy",
  "controller": "s3/bucket",
  "result":  { "message": 'Policy applied to bucket "bucket-name".' }
}
```
