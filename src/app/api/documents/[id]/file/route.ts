import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDocumentFor, NotFoundError } from '@/lib/authz';
import { readDocumentBytes } from '@/lib/documents';

/**
 * Serves a privately stored upload.
 *
 * Files live outside ./public and are only reachable through this handler,
 * which re-checks ownership (or an explicit household share) on every request.
 * Revoking a share therefore cuts off the document too.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse('Not signed in', { status: 401 });

  const { id } = await params;
  let doc;
  try {
    doc = getDocumentFor(user.id, id);
  } catch (err) {
    // Same response whether it is missing or simply not theirs.
    if (err instanceof NotFoundError) return new NextResponse('Not found', { status: 404 });
    throw err;
  }

  let bytes: Buffer;
  try {
    bytes = await readDocumentBytes(doc);
  } catch {
    return new NextResponse('The stored file is missing from disk.', { status: 410 });
  }

  const inline = doc.mime.startsWith('image/') || doc.mime === 'application/pdf';
  const safeName = doc.filename.replace(/[^\w.\- ]/g, '_');

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': doc.mime,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      // Never cached by a shared cache, never stored by the browser.
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      // Nothing in a user-supplied file should be able to execute or phone home.
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
