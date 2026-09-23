// src/app/login/page.tsx
import { CalendarClock } from 'lucide-react';
import LoginForm from '@/components/auth/LoginForm';
import styles from '@/styles/Login.module.css';

export default function LoginPage() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {/* Left — brand panel */}
        <div className={styles.brandPanel}>
          <div className={styles.brandTop}>
            <div className={styles.avatar}>C</div>
          </div>

          <div className={styles.brandBody}>
            <span className={styles.kicker}>CIVILLIST</span>
            <h1 className={styles.headline}>Meetings, minuted.</h1>
            <p className={styles.subtext}>
              Every agenda, decision and follow-up kept exactly as it happened.
            </p>
          </div>

          <div className={styles.brandFooter}>
            <span className={styles.divider} />
            <span className={styles.dateLabel}>{today.toUpperCase()}</span>
          </div>
        </div>

        {/* Right — form panel */}
        <div className={styles.formPanel}>
          <div className={styles.formInner}>
            <div className={styles.logoRow}>
              <span className={styles.logoMark}>
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <p className={styles.logoName}>Civillist</p>
                <p className={styles.logoSub}>Meeting Management</p>
              </div>
            </div>

            <h2 className={styles.welcome}>Welcome back</h2>
            <p className={styles.welcomeSub}>
              Sign in to access your Civillist dashboard.
            </p>

            <LoginForm />

            <p className={styles.helpRow}>
              Need access?{' '}
              <a href="mailto:admin@civillist.com" className={styles.link}>
                Contact your administrator
              </a>
            </p>
          </div>
        </div>
      </div>

      <p className={styles.copyright}>
        © {new Date().getFullYear()} Civillist. All rights reserved.
      </p>
    </div>
  );
}