import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

export function Footer() {
  return (
    <footer className="bg-[#F5FAF6] border-t border-[#E4EDE6]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left */}
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="text-[12px] text-[#9CA3AF]">© 2026 Nawa Studio</span>
        </div>

        {/* Right */}
        <nav className="flex items-center gap-5" aria-label="Liens footer">
          <Link
            href="/mentions-legales"
            className="text-[13px] text-[#4B5563] hover:text-[#111827] transition-colors"
          >
            Mentions légales
          </Link>
          <a
            href="https://linkedin.com/company/nawastudio"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-[#4B5563] hover:text-[#111827] transition-colors"
          >
            LinkedIn
          </a>
          <a
            href="mailto:contact@nawastudio.com"
            className="text-[13px] text-[#4B5563] hover:text-[#111827] transition-colors"
          >
            contact@nawastudio.com
          </a>
        </nav>
      </div>
    </footer>
  )
}
