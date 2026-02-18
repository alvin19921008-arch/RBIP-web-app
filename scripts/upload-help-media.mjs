import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { put } from '@vercel/blob'

const token =
  process.env.BLOB_READ_WRITE_TOKEN ||
  process.env.VERCEL_BLOB_READ_WRITE_TOKEN ||
  process.env.VERCEL_BLOB_RW_TOKEN

const mediaPlan = [
  {
    envKey: 'NEXT_PUBLIC_HELP_MEDIA_STEP2_PCA_COVER_GIF_URL',
    localPath: 'Video/step 2 PCA cover.gif',
    blobPath: 'help/step-2-pca-cover.gif',
  },
  {
    envKey: 'NEXT_PUBLIC_HELP_MEDIA_SUMMARY_INFO_GIF_URL',
    localPath: 'Video/Summary info_Gif.gif',
    blobPath: 'help/summary-info.gif',
  },
  {
    envKey: 'NEXT_PUBLIC_HELP_MEDIA_STAFF_POOL_GIF_URL',
    localPath: 'Video/staffpool.gif',
    blobPath: 'help/staff-pool.gif',
  },
  {
    envKey: 'NEXT_PUBLIC_HELP_MEDIA_CONTEXTUAL_MENU_GIF_URL',
    localPath: 'Video/Contexual menu.gif',
    blobPath: 'help/contextual-menu.gif',
  },
]

if (!token) {
  console.error('Missing Blob token.')
  console.error('Set BLOB_READ_WRITE_TOKEN (recommended) and run again.')
  console.error(
    'Example: export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_xxx" && npm run blob:upload-help-media'
  )
  process.exit(1)
}

const uploads = []

for (const item of mediaPlan) {
  const absolutePath = path.resolve(process.cwd(), item.localPath)
  const fileContent = await readFile(absolutePath)
  const result = await put(item.blobPath, fileContent, {
    access: 'public',
    token,
    addRandomSuffix: false,
  })
  uploads.push({ envKey: item.envKey, url: result.url, localPath: item.localPath })
  console.log(`Uploaded ${item.localPath} -> ${result.url}`)
}

console.log('\nPaste these env vars into .env.local and Vercel project settings:\n')
for (const upload of uploads) {
  console.log(`${upload.envKey}=${upload.url}`)
}
