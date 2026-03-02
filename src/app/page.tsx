import { redirect } from 'next/navigation';

/**
 * Root route — redirect to login.
 * Authenticated users are sent to /dashboard by AuthProvider.
 */
export default function RootPage() {
    redirect('/login');
}
