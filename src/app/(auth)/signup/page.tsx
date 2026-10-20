import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { SignUpForm } from './form';

export const metadata: Metadata = { title: 'Create your account' };

export default async function SignUpPage() {
  if (await getSessionUser()) redirect('/app');
  return <SignUpForm />;
}
