import "./globals.css";

export const metadata = {
  title: "Laundry Day NYC — Pickup Scheduler",
  description: "Manhattan laundry pickup, simply.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Inline script reads localStorage dark-mode pref before render to
            avoid a flash of light theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try { if (localStorage.getItem('ldn-theme') === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
