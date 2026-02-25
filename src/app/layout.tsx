import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'SplitPay — Split expenses with USDC',
    description:
        'Track shared expenses with your group and settle debts instantly using USDC on Arc.',
    keywords: ['expense splitting', 'USDC', 'payments', 'groups', 'Arc'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
                {children}
            </body>
        </html>
    );
}
