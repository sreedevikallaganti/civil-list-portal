'use client';

import { useState } from 'react';
import { 
  User, Bell, FileText, Users, Shield, Database,
  Save, Check, Lock, Clock, Layout, Download,
  Briefcase, Mail, Eye, AlertTriangle, Settings
} from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { id: 'general', label: 'General & Profile', icon: User },
    { id: 'protocols', label: 'Meeting Protocols', icon: FileText },
    { id: 'directory', label: 'Officer Directory', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security & Privacy', icon: Shield },
    { id: 'data', label: 'Data & Exports', icon: Database },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Manage your portal preferences and meeting protocols</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar Navigation */}
          <div className="w-full md:w-64 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left ${
                      activeTab === tab.id
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
              
              {/* ================= GENERAL & PROFILE ================= */}
              {activeTab === 'general' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">General & Profile</h2>
                    <p className="text-sm text-gray-500 mt-1">Update your personal information and portal preferences.</p>
                  </div>
                  
                  <div className="flex items-center gap-6 pb-6 border-b border-gray-100">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-sm">
                      A
                    </div>
                    <div>
                      <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                        Change Photo
                      </button>
                      <p className="text-xs text-gray-500 mt-2">JPG, PNG or GIF. Max 2MB.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
                      <input type="text" defaultValue="Admin User" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Official Email</label>
                      <input type="email" defaultValue="admin@acme.com" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Designation</label>
                      <input type="text" defaultValue="Managing Director" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Department</label>
                      <input type="text" defaultValue="Administration" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors">
                      {saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Changes</>}
                    </button>
                  </div>
                </div>
              )}

              {/* ================= MEETING PROTOCOLS ================= */}
              {activeTab === 'protocols' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Meeting Protocols</h2>
                    <p className="text-sm text-gray-500 mt-1">Configure default formats and rules for official meetings.</p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Minutes of Meeting (MoM) Template</label>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                        <option>Standard Government Format</option>
                        <option>Corporate Executive Format</option>
                        <option>Custom Template</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Default Meeting Duration</label>
                        <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                          <option>30 Minutes</option>
                          <option>1 Hour</option>
                          <option>1.5 Hours</option>
                          <option>2 Hours</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Buffer Time Between Meetings</label>
                        <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                          <option>5 Minutes</option>
                          <option>10 Minutes</option>
                          <option>15 Minutes</option>
                          <option>None</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <div>
                          <p className="font-medium text-gray-900">Auto-generate Meeting Agenda</p>
                          <p className="text-sm text-gray-500">Create a standard agenda structure automatically</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                      </label>

                      <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <div>
                          <p className="font-medium text-gray-900">Require Officer Designation</p>
                          <p className="text-sm text-gray-500">Mandate designation for all civil servant meetings</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                      </label>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors">
                      {saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Protocols</>}
                    </button>
                  </div>
                </div>
              )}

              {/* ================= OFFICER DIRECTORY ================= */}
              {activeTab === 'directory' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Officer Directory</h2>
                    <p className="text-sm text-gray-500 mt-1">Customize how the Civil List and officers are displayed.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Default Sort Order</label>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                        <option>Alphabetical (A-Z)</option>
                        <option>Batch Year (Newest First)</option>
                        <option>Cadre</option>
                        <option>State</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Items Per Page</label>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                        <option>25</option>
                        <option>50</option>
                        <option>100</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <div>
                        <p className="font-medium text-gray-900">Show Batch Year in List</p>
                        <p className="text-sm text-gray-500">Display the IAS/IPS batch year next to officer names</p>
                      </div>
                      <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                    </label>

                    <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <div>
                        <p className="font-medium text-gray-900">Show Cadre & State</p>
                        <p className="text-sm text-gray-500">Display cadre allocation and home state</p>
                      </div>
                      <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                    </label>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors">
                      {saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Directory Settings</>}
                    </button>
                  </div>
                </div>
              )}

              {/* ================= NOTIFICATIONS ================= */}
              {activeTab === 'notifications' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Notifications</h2>
                    <p className="text-sm text-gray-500 mt-1">Control how and when you receive meeting alerts.</p>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <div>
                        <p className="font-medium text-gray-900">Meeting Reminders</p>
                        <p className="text-sm text-gray-500">Get notified before scheduled meetings</p>
                      </div>
                      <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                    </label>

                    <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <div>
                        <p className="font-medium text-gray-900">Daily Agenda Email</p>
                        <p className="text-sm text-gray-500">Receive a summary of today's meetings at 8:00 AM</p>
                      </div>
                      <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                    </label>

                    <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <div>
                        <p className="font-medium text-gray-900">Status Change Alerts</p>
                        <p className="text-sm text-gray-500">Notify when a meeting is cancelled or rescheduled</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Default Reminder Time</label>
                    <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                      <option>15 minutes before</option>
                      <option>30 minutes before</option>
                      <option>1 hour before</option>
                      <option>1 day before</option>
                    </select>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors">
                      {saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Preferences</>}
                    </button>
                  </div>
                </div>
              )}

              {/* ================= SECURITY & PRIVACY ================= */}
              {activeTab === 'security' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Security & Privacy</h2>
                    <p className="text-sm text-gray-500 mt-1">Keep your portal and government data secure.</p>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <div>
                        <p className="font-medium text-gray-900">Two-Factor Authentication (2FA)</p>
                        <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                    </label>

                    <div className="p-4 border border-gray-200 rounded-lg">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Auto-logout Timer</label>
                      <p className="text-sm text-gray-500 mb-3">Automatically log out after a period of inactivity</p>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                        <option>15 minutes</option>
                        <option>30 minutes</option>
                        <option>1 hour</option>
                        <option>Never</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-red-600 mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Danger Zone
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button className="px-4 py-2 border border-red-200 text-red-600 font-medium rounded-lg hover:bg-red-50 transition-colors">
                        Change Password
                      </button>
                      <button className="px-4 py-2 border border-red-200 text-red-600 font-medium rounded-lg hover:bg-red-50 transition-colors">
                        Clear Cache
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= DATA & EXPORTS ================= */}
              {activeTab === 'data' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Data & Exports</h2>
                    <p className="text-sm text-gray-500 mt-1">Download reports and manage your portal data.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-6 border border-gray-200 rounded-xl hover:border-blue-300 transition-colors cursor-pointer group">
                      <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900">Meeting Reports</h3>
                      <p className="text-sm text-gray-500 mt-1">Export all meetings as CSV or PDF</p>
                      <button className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        <Download className="w-4 h-4" /> Download
                      </button>
                    </div>

                    <div className="p-6 border border-gray-200 rounded-xl hover:border-blue-300 transition-colors cursor-pointer group">
                      <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-100">
                        <Users className="w-5 h-5 text-indigo-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900">Civil List Directory</h3>
                      <p className="text-sm text-gray-500 mt-1">Export the complete officer database</p>
                      <button className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        <Download className="w-4 h-4" /> Download
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800">Data Retention Policy</p>
                      <p className="text-sm text-yellow-700 mt-1">Meeting records are kept for 5 years as per government guidelines. Contact admin to modify.</p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}