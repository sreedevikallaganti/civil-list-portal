interface SectionCardProps {
  title: string;
  subtitle?: string;
  action?: string;
  children: React.ReactNode;
}

export default function SectionCard({ title, subtitle, action, children }: SectionCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
          {action && (
            <button className="text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors">
              {action} →
            </button>
          )}
        </div>
      </div>
      <div className="p-2">
        {children}
      </div>
    </div>
  );
}