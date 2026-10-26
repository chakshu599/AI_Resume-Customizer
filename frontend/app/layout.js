import "./globals.css";
import "./auth.css";

export const metadata = {
  title: "Resumely — Career Studio",
  description: "Tailor your resume and cover letter to your next opportunity.",
};
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
