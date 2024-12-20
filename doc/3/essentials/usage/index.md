---
code: false
type: page
order: 200
title: Usage
---

### **Plugin Usage Documentation**

#### **Overview**
The plugin allows users to request a URL to directly send a file to Amazon S3 (or other S3 providers). It also permits creating buckets and managing files in S3.

---

#### **Get a Presigned URL**

```json
// Kuzzle request
{
  "controller": "s3/upload",
  "action": "getUrl",
  "filename": "headcrab.png",
  "uploadDir": "xen",
  "bucketName": "my-bucket",
  "bucketRegion": "us-west-1"
}

// Kuzzle response
{
  "fileKey": "xen/<uuid>-headcrab.png",
  "uploadUrl": "https://s3.eu-west-3.amazonaws.com/...",
  "ttl": 1200000
}
```

---

#### **Upload the File to the Presigned URL**

Send a PUT request to the `uploadUrl` URL with the body set to the file's content and a `Content-Type` header corresponding to the file mime type.  

---

#### **Using the SDK JavaScript and Axios**

You can use the [SDK JavaScript](/sdk/js/6) to interact with the S3 plugin and [axios](https://github.com/axios/axios) to send the file to S3.

```javascript
// Get a Presigned URL
const file = document.getElementById('uploadInput').files[0];
const { result } = await kuzzle.query({
  controller: 's3/upload',
  action: 'getUploadUrl',
  uploadDir: 'xen',
  filename: file.name,
  bucketName: 'my-bucket',
  bucketRegion: 'us-west-1',
});

// Upload the file directly to S3
const axiosOptions = {
  headers: {
    'Content-Type': file.type
  }
};
await axios.put(result.uploadUrl, file, axiosOptions);
```
### **Bucket controller usage documentation**

#### **Overview**
The plugin allows users to manage S3-compatible buckets via the Kuzzle SDK. It supports creating, deleting, checking the existence of buckets, setting policies, and enabling public access.

---

#### **Create a Bucket**

```javascript
// Using the Kuzzle SDK to create a bucket
const response = await kuzzle.query({
  controller: 'bucketController',
  action: 'create',
  bucketName: 'my-bucket',
  bucketRegion: 'us-west-1',
  options: { ACL: 'public-read' },
  cors: {
    CORSRules: [
      {
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'POST', 'PUT'],
        AllowedOrigins: ['*']
      }
    ]
  },
  disableDotsInName: false
});

console.log(response.result);
// { name: 'my-bucket', region: 'us-west-1' }
```

---

#### **Delete a Bucket**

```javascript
// Using the Kuzzle SDK to delete an empty bucket
const response = await kuzzle.query({
  controller: 'bucketController',
  action: 'delete',
  bucketName: 'my-bucket',
  bucketRegion: 'us-west-1'
});

console.log(response.result);
// { message: 'Bucket "my-bucket" deleted.' }
```

---

#### **Check if a Bucket Exists**

```javascript
// Using the Kuzzle SDK to check if a bucket exists
const response = await kuzzle.query({
  controller: 'bucketController',
  action: 'exists',
  bucketName: 'my-bucket',
  bucketRegion: 'us-west-1'
});

console.log(response.result);
// { exists: true }
```

---

#### **Set a Bucket Policy**

```javascript
// Using the Kuzzle SDK to set a bucket policy
const response = await kuzzle.query({
  controller: 'bucketController',
  action: 'setPolicy',
  bucketName: 'my-bucket',
  bucketRegion: 'us-west-1',
  policy: {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::my-bucket/*'
      }
    ]
  }
});

console.log(response.result);
// { message: 'Policy applied to bucket "my-bucket".' }
```

---

#### **Enable Public Access**

```javascript
// Using the Kuzzle SDK to enable public access for a bucket
const response = await kuzzle.query({
  controller: 'bucketController',
  action: 'enablePublicAccess',
  bucketName: 'my-bucket',
  bucketRegion: 'us-west-1'
});

console.log(response.result);
// { message: 'Public access enabled for bucket "my-bucket".' }
```

#### **Notes**
- For MinIO buckets, public access must be configured differently. The response will include a message guiding additional actions.

---

#### **Error Handling**
All SDK queries may throw errors, such as:
- `BadRequestError`: For invalid inputs or conflicting operations.
- Errors from the S3 service for invalid configurations or network issues.

Ensure appropriate error handling in client applications.

