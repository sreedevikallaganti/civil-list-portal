// lib/appConfig.ts — organisation-wide settings in one place.
// Override any of them in .env.local (restart `npm run dev` afterwards):
//   NEXT_PUBLIC_HOME_CITY=hyderabad        key from lib/cities.ts — no "met before" popup here
//   NEXT_PUBLIC_APP_TIMEZONE=Asia/Kolkata  IANA zone meeting times are entered in

export const HOME_CITY = (process.env.NEXT_PUBLIC_HOME_CITY || 'hyderabad').trim().toLowerCase();

export const APP_TIMEZONE = (process.env.NEXT_PUBLIC_APP_TIMEZONE || process.env.APP_TIMEZONE || 'Asia/Kolkata').trim();
