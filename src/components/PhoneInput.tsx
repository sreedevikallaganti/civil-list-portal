'use client';

/* PhoneInput — country code picker + national number, used by every form.
   • value / onChange carry the saved string: "+91 98765 43210", "+971 50 123 4567", or '' when empty.
   • Only digits can be typed, and never more than the chosen country allows.
   • Pasting a full international number ("+44 20 7946 0958", "0044…") switches the country automatically.
   • Old values without a code ("9876543210") open as India.
   `className` styles the outer box so it matches each form's other inputs. */

import { useMemo, useState } from 'react';
import {
  COMMON_COUNTRY_COUNT,
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  cleanNational,
  examplePhone,
  joinPhone,
  splitPhone,
  type CountryCode,
} from '@/lib/validation';

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  invalid?: boolean;
  defaultCountry?: CountryCode;
  'aria-describedby'?: string;
};

export default function PhoneInput({ value, onChange, id, className = '', invalid, defaultCountry = DEFAULT_COUNTRY, ...rest }: Props) {
  const [state, setState] = useState(() => splitPhone(value, defaultCountry));
  // follow the parent when it sets a different value (e.g. picking an officer pre-fills the phone)
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== joinPhone(state.country, state.national)) setState(splitPhone(value, state.country));
  }

  const { country, national } = state;
  const option = COUNTRY_OPTIONS.find((o) => o.code === country);
  const placeholder = useMemo(() => examplePhone(country), [country]);

  const emit = (c: CountryCode, n: string) => {
    setState({ country: c, national: n });
    const next = joinPhone(c, n);
    setLastValue(next);
    onChange(next);
  };

  const onNumber = (raw: string) => {
    // a full international number was typed / pasted → take its country too
    if (/^\s*(\+|00)/.test(raw)) {
      const parsed = splitPhone(raw, country);
      emit(parsed.country, cleanNational(parsed.national, parsed.country));
      return;
    }
    emit(country, cleanNational(raw, country));
  };

  return (
    <div
      className={`flex items-center gap-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/15 ${
        invalid ? '!border-rose-400' : ''
      } ${className}`}
    >
      <label className="relative flex shrink-0 items-center" title={option ? `${option.name} ${option.dial}` : undefined}>
        <span className="sr-only">Country code</span>
        <span aria-hidden className="pointer-events-none whitespace-nowrap text-[0.95em] font-semibold text-slate-700">
          {country} {option?.dial}
        </span>
        <span aria-hidden className="pointer-events-none ml-1 text-[0.7em] text-slate-400">▾</span>
        {/* the real <select> sits invisibly on top: native, searchable by typing, accessible */}
        <select
          value={country}
          onChange={(e) => emit(e.target.value as CountryCode, cleanNational(national, e.target.value as CountryCode))}
          aria-label="Country code"
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <optgroup label="Common">
            {COUNTRY_OPTIONS.slice(0, COMMON_COUNTRY_COUNT).map((o) => (
              <option key={o.code} value={o.code}>{o.name} ({o.dial})</option>
            ))}
          </optgroup>
          <optgroup label="All countries">
            {COUNTRY_OPTIONS.slice(COMMON_COUNTRY_COUNT).map((o) => (
              <option key={o.code} value={o.code}>{o.name} ({o.dial})</option>
            ))}
          </optgroup>
        </select>
      </label>
      <span aria-hidden className="h-5 w-px shrink-0 bg-slate-200" />
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={national}
        onChange={(e) => onNumber(e.target.value)}
        placeholder={placeholder ? `e.g. ${placeholder}` : 'Phone number'}
        aria-invalid={invalid || undefined}
        aria-describedby={rest['aria-describedby']}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-slate-400 focus:ring-0"
      />
    </div>
  );
}
