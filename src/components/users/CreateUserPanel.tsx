"use client";

import { useCallback, useEffect, useState } from "react";
import { createUser, type PBUser } from "./user-api";

interface Props {
  onSaved: (user: PBUser) => void;
  onClose: () => void;
}

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  passwordConfirm: "",
  department: "",
  permissions: "",
};

export default function CreateUserPanel({ onSaved, onClose }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return;
    setShow(false);
    window.setTimeout(onClose, 250);
  }, [onClose, saving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  function setField(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        passwordConfirm: form.passwordConfirm,
        department: form.department.trim(),
        permissions: form.permissions.trim(),
      });
      onSaved(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

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
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New User</h2>
            <p className="text-xs text-gray-500">Create a portal login</p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {(
              [
                { key: "name", label: "Full name", required: true, placeholder: "e.g. Jane Doe", type: "text" },
                { key: "email", label: "Email (login)", required: true, placeholder: "e.g. jane@example.com", type: "email" },
                { key: "password", label: "Password", required: true, placeholder: "Min. 8 characters", type: "password" },
                { key: "passwordConfirm", label: "Confirm password", required: true, placeholder: "Repeat password", type: "password" },
                { key: "department", label: "Department", placeholder: "e.g. Civil", type: "text" },
                { key: "permissions", label: "Permissions", placeholder: "e.g. admin, viewer", type: "text" },
              ] as const
            ).map((f) => (
              <div key={f.key}>
                <label htmlFor={`usr-${f.key}`} className="mb-1 block text-sm font-medium text-gray-700">
                  {f.label}{f.required && <span className="text-red-500"> *</span>}
                </label>
                <input
                  id={`usr-${f.key}`}
                  type={f.type}
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  autoComplete={f.key.startsWith("password") ? "new-password" : "off"}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                />
              </div>
            ))}
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create User"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}