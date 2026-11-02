import { redirect } from 'next/navigation';

export default function TimezoneRedirect() {
  redirect('/settings/profile');
}
