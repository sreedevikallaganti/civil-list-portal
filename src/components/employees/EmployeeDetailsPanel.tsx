"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPBDate, type Employee } from "./employee-api";
import EmployeeAvatar from "./EmployeeAvatar";

interface Props {
  employee: Employee;
  onClose: () => void;
}

export default function EmployeeDetailsPanel({ employee, onClose }: Props) {
  const [show, setShow] = useState(false);

  // slide in after mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // slide out first, THEN unmount via parent
  const handleClose = useCallback(() => {
    setShow(false);
    window.setTimeout(onClose, 250);
  }, [onClose]);

  // close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          show ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      {/* drawer */}
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          show ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* header */}
        <div className="relative bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 pb-14 pt-6">
          <button
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">
            Employee details
          </p>
        </div>

        {/* identity block */}
        <div className="-mt-12 px-6">
          <EmployeeAvatar employee={employee} className="h-20 w-20 ring-4 ring-white" textClassName="text-2xl" />
          <h2 className="mt-3 text-xl font-bold text-gray-900">
            {employee.name || "Unnamed employee"}
          </h2>
          <p className="text-sm text-gray-500">{employee.designation || "—"}</p>
          {employee.department && (
            <span className="mt-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              {employee.department}
            </span>
          )}
        </div>

        {/* details */}
        <div className="mt-6 flex-1 overflow-y-auto border-t border-gray-100 px-6 py-5">
          <dl className="space-y-4">
            <Row label="Contact number" value={employee.contact_number}
              href={employee.contact_number ? `tel:${employee.contact_number}` : undefined} />
            <Row label="Email" value={employee.email}
              href={employee.email ? `mailto:${employee.email}` : undefined} />
            <Row label="Employee ID" value={employee.id} mono />
            <Row label="Created" value={formatPBDate(employee.created)} />
            <Row label="Last updated" value={formatPBDate(employee.updated)} />
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
            <a href={href} className="text-indigo-600 hover:underline">{value}</a>
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