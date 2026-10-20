import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SignInForm } from './form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  if (await getSessionUser()) redirect('/app');
  return <SignInForm />;
}
