"use client";

import { useState } from "react";
import type { Employee } from "./employee-api";

interface Props {
  employee: Employee;
  className?: string;
  textClassName?: string;
}

export default function EmployeeAvatar({
  employee,
  className = "h-10 w-10",
  textClassName = "text-sm",
}: Props) {
  const [failed, setFailed] = useState(false);

  const initials = (employee.name || "?")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (!employee.photo_url || failed) {
    return (
      <div
        className={`${className} ${textClassName} flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700`}
      >
        {initials}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={employee.photo_url}
      alt={employee.name}
      className={`${className} shrink-0 rounded-full object-cover`}
      onError={() => setFailed(true)}
    />
  );
}