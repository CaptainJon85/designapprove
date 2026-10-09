require('../../scripts/load-env');
const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand
} = require('@aws-sdk/client-s3');

let client;
let bucketReady;

function s3(){
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    const err = new Error('Object storage is not configured.');
    err.status = 503;
    throw err;
  }
  if (!client) {
    const options = {
      region: process.env.S3_REGION || 'us-east-1',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY
      }
    };
    if (process.env.S3_ENDPOINT) options.endpoint = process.env.S3_ENDPOINT;
    client = new S3Client(options);
  }
  return client;
}

function bucket(){
  return process.env.S3_BUCKET;
}

async function ensureBucket(){
  if (bucketReady) return;
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
  } catch (err) {
    const missing = err && (err.$metadata && err.$metadata.httpStatusCode === 404 || err.name === 'NotFound' || err.Code === 'NoSuchBucket');
    if (!missing) throw err;
    await s3().send(new CreateBucketCommand({ Bucket: bucket() }));
  }
  bucketReady = true;
}

function extensionFor(mime){
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/svg+xml') return 'svg';
  if (type === 'image/x-icon' || type === 'image/vnd.microsoft.icon') return 'ico';
  return 'bin';
}

async function put(body, mime){
  await ensureBucket();
  const key = 'media/' + crypto.randomBytes(16).toString('hex') + '.' + extensionFor(mime);
  await s3().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: String(mime || 'application/octet-stream').split(';')[0]
  }));
  return key;
}

async function get(key){
  await ensureBucket();
  try {
    const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const body = Buffer.from(await result.Body.transformToByteArray());
    return { body, contentType: result.ContentType || 'application/octet-stream' };
  } catch (err) {
    const missing = err && (err.$metadata && err.$metadata.httpStatusCode === 404 || err.name === 'NoSuchKey');
    if (missing) return null;
    throw err;
  }
}

module.exports = { put, get, ensureBucket };
