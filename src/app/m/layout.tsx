import type { Metadata, Viewport } from 'next';
import MobilePush from '@/components/mobile/MobilePush';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  title: 'Gostwrk Text',
  applicationName: 'Gostwrk Text',
  manifest: '/m/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Gostwrk Text',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/images/logo/gostwrk-auth-logo.png',
  },
};

export default function MobileTextLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-text flex flex-col bg-white min-[431px]:items-center min-[431px]:justify-center min-[431px]:bg-[#ececee] min-[431px]:py-6">
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white min-[431px]:h-[844px] min-[431px]:max-h-full min-[431px]:w-[390px] min-[431px]:flex-none min-[431px]:rounded-[28px] min-[431px]:shadow-lg">
        {children}
      </div>
      <MobilePush />
    </div>
  );
}
