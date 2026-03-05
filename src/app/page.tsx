import { redirect } from 'next/navigation';

export default async function Home() {
  // Middleware handles the redirect, but this ensures it happens at the component level too
  redirect('/dashboard');
}