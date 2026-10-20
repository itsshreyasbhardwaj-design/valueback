import type { Metadata } from 'next';
import { RecoverForm } from './form';

export const metadata: Metadata = { title: 'Recover your account' };

export default function RecoverPage() {
  return <RecoverForm />;
}
