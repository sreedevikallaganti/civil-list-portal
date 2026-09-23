"use client";

import { useState } from "react";
import { avatarFileUrl, type PBUser } from "./user-api";

interface Props {
  user: PBUser;
  className?: string;
  textClassName?: string;
}

export default function UserAvatar({
  user,
  className = "h-10 w-10",
  textClassName = "text-sm",
}: Props) {
  const [failed, setFailed] = useState(false);
  const url = avatarFileUrl(user);

  const initials = (user.name || user.email || "?")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (!url || failed) {
    return (
      <div
        className={`${className} ${textClassName} flex shrink-0 items-center justify-center rounded-full bg-violet-100 font-semibold text-violet-700`}
      >
        {initials}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={user.name || "User"}
      className={`${className} shrink-0 rounded-full object-cover`}
      onError={() => setFailed(true)}
    />
  );
}