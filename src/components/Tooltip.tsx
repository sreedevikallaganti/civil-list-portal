'use client';

/* Tooltip — styled hover / focus tooltip.
   • Rendered in a portal with fixed positioning, so scroll areas (overflow) never clip it.
   • Shows above the element; flips below when there's no room; stays inside the window.
   • Small delay so it doesn't flash while the mouse passes over a list; hides on scroll.
   • Keyboard accessible: shows on focus, linked with aria-describedby.

   <Tooltip content="Full text">…</Tooltip>
   <Tooltip content={<RichCard />} wide>…</Tooltip> */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PREF_KEYS, readPref } from '@/lib/preferences';

type Props = {
  content: ReactNode;
  children: ReactNode;
  /** wider box for rich content (cards) */
  wide?: boolean;
  /** ms before showing */
  delay?: number;
  /** classes for the wrapper span (e.g. "block min-w-0 truncate") */
  className?: string;
  disabled?: boolean;
};

const GAP = 8;
const MARGIN = 8;

export default function Tooltip({ content, children, wide, delay = 250, className = '', disabled }: Props) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);

  const show = () => {
    if (disabled || content == null || content === '' || readPref(PREF_KEYS.tooltips) === 'off') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);

  // place it once its size is known
  useLayoutEffect(() => {
    if (!open || !anchor.current || !box.current) return;
    const a = anchor.current.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    const below = a.top - GAP - b.height < MARGIN;
    const top = below ? a.bottom + GAP : a.top - GAP - b.height;
    const left = Math.min(Math.max(a.left + a.width / 2 - b.width / 2, MARGIN), window.innerWidth - b.width - MARGIN);
    setPos({ top, left, below });
  }, [open]);

  // any scroll moves the anchor → just close
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, hide]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <>
      <span
        ref={anchor}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={open ? id : undefined}
        data-tooltip-owner="" // GlobalTooltips leaves everything inside to this component
        className={className}
      >
        {children}
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={box}
          id={id}
          role="tooltip"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
          className={`pointer-events-none fixed z-[100] rounded-xl bg-slate-900/95 text-white shadow-xl shadow-slate-900/20 ring-1 ring-white/10 backdrop-blur-sm transition-opacity duration-150 ${
            wide ? 'w-72 p-3' : 'max-w-xs px-2.5 py-1.5'
          } text-xs leading-relaxed ${pos ? 'opacity-100' : 'opacity-0'}`}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
