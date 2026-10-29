import { cn } from '@ilm/ui';
import { EmailIcon, ICON_SIZE, PhoneIcon } from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';

import { CONTAINER, LINK, Logo } from './shared';

import { CONTACT, FOOTER_LINKS } from '@/components/marketing/marketing-content';

export function SiteFooter() {
  return (
    <footer className="p-2 sm:p-4">
      <div className="marketing-ink rounded-tile bg-background">
        <div className={cn(CONTAINER, 'pt-16')}>
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Logo />
              <p className="mt-6 max-w-xs text-sm text-muted-foreground">
                School management for Pakistan — admissions, fees, attendance, exams and accounts in
                one record.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-3">
                  <EmailIcon className={ICON_SIZE.inline} aria-hidden />
                  <a href={`mailto:${CONTACT.email}`} className={LINK}>
                    {CONTACT.email}
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <PhoneIcon className={ICON_SIZE.inline} aria-hidden />
                  {CONTACT.phone}
                </li>
                <li className="ps-7">{CONTACT.hours}</li>
              </ul>
            </div>

            <nav
              aria-label="Footer"
              className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-8"
            >
              {FOOTER_LINKS.map((column) => (
                <div key={column.heading}>
                  <p className="text-sm font-semibold">{column.heading}</p>
                  <ul className="mt-4 space-y-3">
                    {column.links.map((link) => (
                      <li key={link.href}>
                        <a href={link.href} className={LINK}>
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/10 py-6 text-sm text-muted-foreground">
            <p>
              © {BRAND.name} · {CONTACT.city}
            </p>
            <a href="#top" className={LINK}>
              Back to top
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
