import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

export type StorageItem = { name: string; url: string; size: number; mtime: number; key?: string };

function getS3() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'eu-central-1';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region,
    endpoint: endpoint.startsWith('http') ? endpoint : `https://${endpoint}`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export function isS3Enabled(){ return !!getS3() && !!process.env.S3_BUCKET; }

export async function s3List(prefix: string) {
  const s3 = getS3(); const bucket = process.env.S3_BUCKET!; if(!s3) return [] as StorageItem[];
  const out: StorageItem[] = [];
  let ContinuationToken: string | undefined = undefined;
  do {
    const resp = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
    ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    for (const o of resp.Contents || []){
      const key = o.Key!; const name = key.replace(prefix, ''); if(!name) continue;
      out.push({ name, url: s3PublicUrl(key), size: Number(o.Size||0), mtime: Number(o.LastModified ? +o.LastModified : Date.now()), key });
    }
  } while(ContinuationToken);
  out.sort((a,b)=> b.mtime - a.mtime);
  return out;
}

export async function s3Put(key: string, body: Uint8Array, contentType?: string){
  const s3 = getS3(); const bucket = process.env.S3_BUCKET!; if(!s3) return null;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ACL: 'public-read' as any }));
  return { url: s3PublicUrl(key), key };
}

export async function s3Delete(key: string){
  const s3 = getS3(); const bucket = process.env.S3_BUCKET!; if(!s3) return;
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function s3Copy(oldKey: string, newKey: string){
  const s3 = getS3(); const bucket = process.env.S3_BUCKET!; if(!s3) return null;
  await s3.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `/${bucket}/${oldKey}`, Key: newKey, ACL: 'public-read' as any }));
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: newKey }));
  return { url: s3PublicUrl(newKey), key: newKey };
}

export function s3PublicUrl(key: string){
  const cdn = process.env.S3_PUBLIC_BASEURL; // optional: CDN/Domain
  if (cdn) return `${cdn.replace(/\/$/,'')}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
  const endpoint = (process.env.S3_ENDPOINT||'').replace(/^https?:\/\//,'');
  const bucket = process.env.S3_BUCKET!;
  return `https://${endpoint}/${bucket}/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
}
