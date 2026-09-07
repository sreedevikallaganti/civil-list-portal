// src/app/login/page.tsx
'use client';

import { CalendarCheck, FileText, Lock, ShieldCheck, Users } from 'lucide-react';
import LoginForm from '@/components/auth/LoginForm';

/* Features showcased on the branding panel */
const FEATURES = [
  {
    icon: CalendarCheck,
    title: 'Smart Scheduling',
    desc: 'Plan and track meetings across year, month, day and agenda views.',
  },
  {
    icon: Users,
    title: 'Officer Directory',
    desc: 'Manage officer profiles, departments and contact details.',
  },
  {
    icon: FileText,
    title: 'Meeting Reports',
    desc: 'Generate comprehensive reports for every recorded meeting.',
  },
  {
    icon: Lock,
    title: 'Restricted Access',
    desc: 'Portal data is visible only to authorized personnel.',
  },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-white">

      {/* ══════════ Left branding panel (hidden on mobile) ══════════ */}
      <aside className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative overflow-hidden flex-col justify-between bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-10 xl:p-14 text-white">

        {/* Decorative background (purely visual) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />
          {/* Subtle dot grid */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.25) 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
          {/* Large watermark icon */}
          <CalendarCheck
            className="absolute -bottom-10 -right-10 h-64 w-64 rotate-12 text-white/5"
            strokeWidth={1}
          />
        </div>

        {/* Brand */}
        <div className="relative animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">Civillist Portal</p>
              <p className="text-xs text-blue-100/80">Meeting Management System</p>
            </div>
          </div>
        </div>

        {/* Headline + features */}
        <div className="relative">
          <h2 className="animate-fade-up animate-fade-up-1 text-3xl font-bold leading-tight xl:text-4xl">
            Your meetings,
            <br />
            perfectly managed.
          </h2>
          <p className="animate-fade-up animate-fade-up-1 mt-4 max-w-md text-sm leading-relaxed text-blue-100/80 xl:text-base">
            Sign in to access the dashboard, schedule meetings and manage
            officers — all in one secure place.
          </p>

          <div className="mt-10 space-y-5 xl:mt-12">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className={`animate-fade-up animate-fade-up-${i + 2} flex items-start gap-4`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{feature.title}</p>
                    <p className="mt-0.5 text-xs text-blue-100/70">{feature.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel footer */}
        <div className="relative flex items-center justify-between text-xs text-blue-100/60">
          <p>© Civillist Portal</p>
          <p className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Restricted Access
          </p>
        </div>
      </aside>

      {/* ══════════ Right form panel ══════════ */}
      <main className="relative flex flex-1 flex-col justify-center overflow-hidden bg-white px-6 py-12 sm:px-10 lg:px-16 xl:px-20">

        {/* Subtle decorative blob */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-blue-50 blur-3xl"
        />

        <div className="animate-fade-up relative mx-auto w-full max-w-md lg:mx-0">

          {/* Mobile logo (shown only when the left panel is hidden) */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">Civillist Portal</p>
              <p className="text-[11px] text-gray-500">Meeting Management System</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Sign in with your authorized account to continue.
            </p>
          </div>

          {/* Form (auth logic unchanged) */}
          <LoginForm />

          {/* Footer note */}
          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-gray-400 lg:justify-start">
            <Lock className="h-3 w-3" />
            Access restricted to authorized personnel only.
          </p>
        </div>
      </main>
    </div>
  );
}