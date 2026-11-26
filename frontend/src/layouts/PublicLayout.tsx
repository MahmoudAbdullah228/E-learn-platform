import { Menu, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { PathlyLogo } from '@/components/common/PathlyLogo';
import { PublicToastProvider } from '@/components/public';
import { cn } from '@/lib/cn';

const CURRENT_YEAR = new Date().getFullYear();

export function PublicLayout() {
  const user = useAppSelector((state) => state.auth.user);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dashboardPath = user?.roles.includes('admin')
    ? '/admin/dashboard'
    : user?.roles.includes('instructor')
      ? '/instructor/dashboard'
      : '/app/dashboard';

  return (
    <PublicToastProvider>
      <div className="min-h-screen flex flex-col bg-canvas text-ink">
      {/* Top Navbar — 04-design-system.md nav-bar */}
      <header className="sticky top-0 z-30 bg-surface border-b border-hairline">
        <div className="mx-auto max-w-[1200px] px-md md:px-xxl h-16 flex items-center justify-between gap-md">
          <PathlyLogo />

          <nav className="hidden md:flex items-center gap-xl text-[14px]">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  'font-medium transition-colors',
                  isActive ? 'text-primary font-semibold' : 'text-ink hover:text-primary',
                )
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/courses"
              className={({ isActive }) =>
                cn(
                  'font-medium transition-colors',
                  isActive ? 'text-primary font-semibold' : 'text-ink hover:text-primary',
                )
              }
            >
              Explore Courses
            </NavLink>
            <Link
              to="/courses"
              aria-label="Search courses"
              className="text-ink-muted hover:text-primary transition-colors p-xs rounded-md"
            >
              <Search className="h-4 w-4" />
            </Link>
          </nav>

          <div className="flex items-center gap-sm md:gap-md">
            {(!user || !user.roles.includes('instructor')) && (
              <Link
                to="/instructor/apply"
                className="hidden sm:inline-block text-[14px] font-medium text-ink hover:text-primary transition-colors"
              >
                Become an Instructor
              </Link>
            )}
            {user ? (
              <Link
                to={dashboardPath}
                className="inline-flex items-center justify-center bg-primary hover:bg-primary-light text-on-primary text-[14px] font-semibold leading-none rounded-sm px-md md:px-xl py-sm shadow-button transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden sm:inline-block text-[14px] font-semibold text-ink hover:text-primary transition-colors"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center bg-primary hover:bg-primary-light text-on-primary text-[14px] font-semibold leading-none rounded-sm px-md md:px-xl py-sm shadow-button transition-colors"
                >
                  Sign Up
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="md:hidden p-xs rounded-md text-ink hover:text-primary hover:bg-surface-muted transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            aria-label="Mobile navigation"
            className="md:hidden bg-surface border-t border-hairline px-md py-md flex flex-col gap-xs text-[14px]"
          >
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="py-xs font-medium text-ink hover:text-primary"
            >
              Home
            </Link>
            <Link
              to="/courses"
              onClick={() => setMobileMenuOpen(false)}
              className="py-xs font-medium text-ink hover:text-primary"
            >
              Explore Courses
            </Link>
            {(!user || !user.roles.includes('instructor')) && (
              <Link
                to="/instructor/apply"
                onClick={() => setMobileMenuOpen(false)}
                className="py-xs font-medium text-ink hover:text-primary"
              >
                Become an Instructor
              </Link>
            )}
            {!user && (
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="py-xs font-semibold text-primary"
              >
                Log In
              </Link>
            )}
          </nav>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer — 04-design-system.md footer */}
      <footer className="bg-surface border-t border-hairline">
        <div className="mx-auto max-w-[1200px] px-md md:px-xxl py-section">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-xl">
            <div className="space-y-sm">
              <PathlyLogo />
              <p className="text-[14px] text-ink-secondary leading-relaxed">
                A calm, focused Egyptian e-learning marketplace connecting learners and expert instructors.
              </p>
            </div>

            <div>
              <h3 className="text-[14px] font-semibold text-ink mb-sm">Discovery</h3>
              <ul className="space-y-xs text-[14px] text-ink-secondary">
                <li>
                  <Link to="/courses" className="hover:text-primary transition-colors">
                    Explore Courses
                  </Link>
                </li>
                <li>
                  <Link to="/courses?pricing=free" className="hover:text-primary transition-colors">
                    Free Courses
                  </Link>
                </li>
                <li>
                  <Link to="/courses?pricing=paid" className="hover:text-primary transition-colors">
                    Paid Courses
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-[14px] font-semibold text-ink mb-sm">Instructor</h3>
              <ul className="space-y-xs text-[14px] text-ink-secondary">
                <li>
                  <Link to="/instructor/apply" className="hover:text-primary transition-colors">
                    Become an Instructor
                  </Link>
                </li>
                <li>
                  <Link to="/instructor/dashboard" className="hover:text-primary transition-colors">
                    Instructor Studio
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-[14px] font-semibold text-ink mb-sm">Account</h3>
              <ul className="space-y-xs text-[14px] text-ink-secondary">
                <li>
                  <Link to="/login" className="hover:text-primary transition-colors">
                    Log In
                  </Link>
                </li>
                <li>
                  <Link to="/register" className="hover:text-primary transition-colors">
                    Create Account
                  </Link>
                </li>
                <li>
                  <Link to="/app/dashboard" className="hover:text-primary transition-colors">
                    Student Dashboard
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-xxxl pt-lg border-t border-hairline text-center text-[13px] text-ink-muted">
            © {CURRENT_YEAR} Pathly. All rights reserved.
          </div>
        </div>
      </footer>
      </div>
    </PublicToastProvider>
  );
}
