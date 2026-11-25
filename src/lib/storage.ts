import 'server-only';
import { admin } from '@/lib/supabase/admin';

/** Signed URL the browser can PUT a file to. Path must already be permission-checked by the caller. */
export async function signedUpload(bucket: 'public' | 'private', path: string) {
  const { data, error } = await admin().storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw error;
  return data as { signedUrl: string; token: string; path: string };
}

export async function signedDownload(path: string, seconds = 300, downloadName?: string) {
  const { data, error } = await admin().storage.from('private').createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
  if (error) throw error;
  return data.signedUrl as string;
}

export async function readPrivate(path: string): Promise<Uint8Array> {
  const { data, error } = await admin().storage.from('private').download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

export function publicUrl(path: string) {
  return admin().storage.from('public').getPublicUrl(path).data.publicUrl as string;
}
