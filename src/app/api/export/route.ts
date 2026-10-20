import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { assertSameOrigin, getSessionUser } from '@/lib/auth';
import { verifyPassword } from '@/lib/crypto';
import {
  exportCsv,
  exportDocumentsArchive,
  exportFilename,
  exportJson,
  type CsvKind,
} from '@/lib/exportdata';
import { LIMITS, rateLimit } from '@/lib/rate-limit';

/**
 * Exports are POST-only so they carry the same origin check as every other
 * mutating request, and so an export that includes redemption codes can require
 * the password to be re-entered in the same submission.
 */
export async function POST(req: Request) {
  await assertSameOrigin();
  const user = await getSessionUser();
  if (!user) return new NextResponse('Not signed in', { status: 401 });

  const fd = await req.formData();
  const kind = String(fd.get('kind') ?? 'json');
  const includeCodes = fd.get('includeCodes') === 'on';

  if (includeCodes) {
    const limit = rateLimit(
      `export-codes:${user.id}`,
      LIMITS.passwordChange.limit,
      LIMITS.passwordChange.windowMs,
    );
    if (!limit.ok)
      return new NextResponse('Too many attempts. Try again shortly.', { status: 429 });

    const password = String(fd.get('password') ?? '');
    const row = db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .get();
    if (!row || !password || !verifyPassword(password, row.hash)) {
      return NextResponse.redirect(new URL('/app/settings/data?error=password', req.url), 303);
    }
  }

  const headers = (filename: string, type: string) => ({
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
  });

  if (kind === 'archive') {
    const buf = await exportDocumentsArchive(user.id, includeCodes);
    return new NextResponse(new Uint8Array(buf), {
      headers: headers(exportFilename('full-export', 'tar.gz'), 'application/gzip'),
    });
  }

  if (kind.startsWith('csv-')) {
    const which = kind.slice(4) as CsvKind;
    const allowed: CsvKind[] = ['benefits', 'refunds', 'recovery', 'balance-events'];
    if (!allowed.includes(which)) return new NextResponse('Unknown export', { status: 400 });
    return new NextResponse(exportCsv(user.id, which), {
      headers: headers(exportFilename(which, 'csv'), 'text/csv; charset=utf-8'),
    });
  }

  const json = JSON.stringify(exportJson(user.id, { includeCodes }), null, 2);
  return new NextResponse(json, {
    headers: headers(exportFilename('export', 'json'), 'application/json; charset=utf-8'),
  });
}
