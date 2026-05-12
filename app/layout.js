import './globals.css';

export const metadata = {
  title: 'Etüt Takip · Randevu Sistemi',
  description: 'Dershane etüt randevu ve takip sistemi',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
