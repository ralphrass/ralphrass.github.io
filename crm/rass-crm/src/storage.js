// Armazenamento dos arquivos anexados.
// Produção: bucket S3 (Railway Buckets, Cloudflare R2, AWS S3...).
// Desenvolvimento: pasta data/arquivos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = (...names) => names.map(n => process.env[n]).find(Boolean);

export async function createStorage(opts = {}) {
  const bucket = opts.bucket ?? env('S3_BUCKET', 'BUCKET');
  const endpoint = opts.endpoint ?? env('S3_ENDPOINT', 'ENDPOINT');
  const accessKeyId = opts.accessKeyId ?? env('S3_ACCESS_KEY_ID', 'ACCESS_KEY_ID');
  const secretAccessKey = opts.secretAccessKey ?? env('S3_SECRET_ACCESS_KEY', 'SECRET_ACCESS_KEY');

  if (bucket && accessKeyId && secretAccessKey) {
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const s3 = new S3Client({
      region: env('S3_REGION', 'REGION') || 'auto',
      endpoint: endpoint || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1',
      credentials: { accessKeyId, secretAccessKey },
    });
    return {
      kind: 's3',
      put: (key, body, type) => s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type || 'application/octet-stream' })),
      del: key => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
      signedUrl: (key, nome) => getSignedUrl(s3, new GetObjectCommand({
        Bucket: bucket, Key: key,
        ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(nome)}`,
      }), { expiresIn: 300 }),
    };
  }

  const dir = opts.dir ?? process.env.FILES_DIR ?? path.join(ROOT, 'data', 'arquivos');
  const full = key => {
    const p = path.resolve(dir, key);
    if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error('caminho inválido');
    return p;
  };
  return {
    kind: 'disco',
    async put(key, body) { const p = full(key); await fs.promises.mkdir(path.dirname(p), { recursive: true }); await fs.promises.writeFile(p, body); },
    async del(key) { await fs.promises.rm(full(key), { force: true }); },
    read: key => fs.promises.readFile(full(key)),
  };
}
