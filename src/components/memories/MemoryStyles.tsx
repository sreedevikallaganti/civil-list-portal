/**
 * Animations for the memories features, using the same easing and timing as the dashboard.
 * Class names use a "mem-" prefix so they can't clash with the dashboard's own.
 * React de-duplicates this tag (href + precedence), so every component can include it.
 */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
.mem-root { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
@keyframes memFadeUp  { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes memFadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes memScaleIn { from { opacity: 0; transform: scale(0.94) translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes memPop     { 0% { opacity: 0; transform: scale(0.6); } 70% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
@keyframes memBar     { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes memBlob    { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(14px, -18px) scale(1.07); } }
@keyframes memKen     { from { transform: scale(1); } to { transform: scale(1.1) translate(-2%, -2%); } }
@keyframes memShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.mem-fade-up  { animation: memFadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
.mem-fade-in  { animation: memFadeIn 0.4s ease both; }
.mem-scale-in { animation: memScaleIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
.mem-pop      { animation: memPop 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
.mem-bar      { transform-origin: bottom; animation: memBar 0.8s cubic-bezier(0.22, 1, 0.36, 1) both; }
.mem-blob     { animation: memBlob 9s ease-in-out infinite; }
.mem-ken      { animation: memKen 18s ease-in-out infinite alternate; }
.mem-d1 { animation-delay: 0.3s; } .mem-d2 { animation-delay: 0.6s; } .mem-d3 { animation-delay: 0.9s; }
.mem-skeleton { background: linear-gradient(90deg, #f1effc 25%, #e5e1f5 40%, #f1effc 55%); background-size: 200% 100%; animation: memShimmer 1.6s linear infinite; }
.mem-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
.mem-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
@media (prefers-reduced-motion: reduce) {
  .mem-fade-up, .mem-fade-in, .mem-scale-in, .mem-pop, .mem-bar, .mem-blob, .mem-ken { animation: none !important; }
}
`;

export default function MemoryStyles() {
  return (
    <style href="civil-list-memories" precedence="default">
      {CSS}
    </style>
  );
}
