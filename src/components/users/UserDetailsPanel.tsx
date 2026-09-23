"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPBDate, type PBUser } from "./user-api";
import UserAvatar from "./UserAvatar";

interface Props {
  user: PBUser;
  onClose: () => void;
}

export default function UserDetailsPanel({ user, onClose }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = useCallback(() => {
    setShow(false);
    window.setTimeout(onClose, 250);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          show ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          show ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* header */}
        <div className="relative bg-gradient-to-r from-violet-600 to-indigo-600 px-6 pb-14 pt-6">
          <button
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="text-xs font-medium uppercase tracking-wider text-violet-200">
            User details
          </p>
        </div>

        {/* identity */}
        <div className="-mt-12 px-6">
          <UserAvatar user={user} className="h-20 w-20 ring-4 ring-white" textClassName="text-2xl" />
          <div className="mt-3 flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">
              {user.name || "Unnamed user"}
            </h2>
            {user.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Verified
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                Not verified
              </span>
            )}
          </div>
          {user.department && (
            <span className="mt-2 inline-block rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
              {user.department}
            </span>
          )}
        </div>

        {/* details */}
        <div className="mt-6 flex-1 overflow-y-auto border-t border-gray-100 px-6 py-5">
          <dl className="space-y-4">
            <Row
              label="Email"
              value={user.emailVisibility ? user.email : "(hidden)"}
              href={user.emailVisibility && user.email ? `mailto:${user.email}` : undefined}
            />
            <Row label="Department" value={user.department} />
            <Row label="Permissions" value={user.permissions} />
            <Row label="User ID" value={user.id} mono />
            <Row label="Created" value={formatPBDate(user.created)} />
            <Row label="Last updated" value={formatPBDate(user.updated)} />
          </dl>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, href, mono }: { label: string; value?: string; href?: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-800">
        {value ? (
          href ? (
            <a href={href} className="text-violet-600 hover:underline">{value}</a>
          ) : (
            <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
          )
        ) : (
          "—"
        )}
      </dd>
    </div>
  );
}