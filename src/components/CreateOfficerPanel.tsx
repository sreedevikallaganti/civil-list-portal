'use client';

import { useState } from 'react';
import { X, Save, Loader2, User, Briefcase, Mail, Phone } from 'lucide-react';
import pb from '@/lib/pocketbase';

interface CreateOfficerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  officerType?: 'IAS' | 'IPS' | 'Other';
}

export default function CreateOfficerPanel({ isOpen, onClose, onSuccess, officerType = 'IAS' }: CreateOfficerPanelProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    officer_id: '',
    batch_year: '',
    cadre: '',
    state: '',
    current_position: '',
    designation: '',
    department: '',
    officer_category: '',
    previous_postings: '',
    date_of_birth: '',
    contact_number: '',
    email: '',
    address: '',
    website: '',
    status_flag: 'Active',
    notes: ''
  });

  const getCollectionName = () => {
    switch (officerType) {
      case 'IPS': return 'ips_officers';
      case 'Other': return 'other_contacts';
      default: return 'ias_officers';
    }
  };

  const getOfficerTypeLabel = () => {
    switch (officerType) {
      case 'IPS': return 'IPS';
      case 'Other': return 'Contact';
      default: return 'IAS';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.batch_year) {
      alert('Please fill in required fields (Name and Batch Year)');
      return;
    }

    try {
      setLoading(true);
      
      const collectionName = getCollectionName();
      
      await pb.collection(collectionName).create({
        ...formData,
        batch_year: parseInt(formData.batch_year) || 0,
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      });
      
      setLoading(false);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating officer:', error);
      setLoading(false);
      alert('Failed to create officer. Please check the fields.');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity" 
        onClick={onClose}
      />
      
      {/* Off-Canvas Panel - Slides from right */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              officerType === 'IPS' ? 'bg-indigo-600' : officerType === 'Other' ? 'bg-gray-600' : 'bg-blue-600'
            }`}>
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Create New {getOfficerTypeLabel()}</h2>
              <p className="text-xs text-gray-600 mt-0.5">Fill in all {officerType === 'Other' ? 'contact' : 'officer'} details</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Section: Basic Information */}
            <div className="md:col-span-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-200">Basic Information</h3>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
              <input 
                type="text" 
                value={formData.name} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                placeholder={officerType === 'Other' ? "e.g., John Doe" : "e.g., Dr. Pushpender Singh Poonia"} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Officer ID</label>
              <input 
                type="text" 
                value={formData.officer_id} 
                onChange={(e) => setFormData({ ...formData, officer_id: e.target.value })} 
                placeholder="e.g., AS-2024-001" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Batch Year <span className="text-red-500">*</span></label>
              <input 
                type="number" 
                value={formData.batch_year} 
                onChange={(e) => setFormData({ ...formData, batch_year: e.target.value })} 
                placeholder="e.g., 2018" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Cadre</label>
              <select 
                value={formData.cadre} 
                onChange={(e) => setFormData({ ...formData, cadre: e.target.value })} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Select Cadre</option>
                {['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha', 'Punjab', 'Haryana', 'Delhi', 'Central', 'Other'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">State</label>
              <select 
                value={formData.state} 
                onChange={(e) => setFormData({ ...formData, state: e.target.value })} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Select State</option>
                {['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha', 'Punjab', 'Haryana', 'Delhi', 'Other'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date of Birth</label>
              <input 
                type="date" 
                value={formData.date_of_birth} 
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Section: Career Information */}
            <div className="md:col-span-2 mt-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-200">Career Information</h3>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Current Position</label>
              <input 
                type="text" 
                value={formData.current_position} 
                onChange={(e) => setFormData({ ...formData, current_position: e.target.value })} 
                placeholder={officerType === 'Other' ? "e.g., Manager" : "e.g., District Magistrate"} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Designation</label>
              <input 
                type="text" 
                value={formData.designation} 
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })} 
                placeholder={officerType === 'Other' ? "e.g., Senior Manager" : "e.g., IAS Officer"} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Department</label>
              <input 
                type="text" 
                value={formData.department} 
                onChange={(e) => setFormData({ ...formData, department: e.target.value })} 
                placeholder="e.g., Home Department" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Officer Category</label>
              <input 
                type="text" 
                value={formData.officer_category} 
                onChange={(e) => setFormData({ ...formData, officer_category: e.target.value })} 
                placeholder="e.g., Senior Administrative Grade" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Previous Postings</label>
              <textarea 
                value={formData.previous_postings} 
                onChange={(e) => setFormData({ ...formData, previous_postings: e.target.value })} 
                rows={2}
                placeholder="List previous positions held..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Status</label>
              <select 
                value={formData.status_flag} 
                onChange={(e) => setFormData({ ...formData, status_flag: e.target.value })} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Active">Active</option>
                <option value="Retired">Retired</option>
                <option value="On Leave">On Leave</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>

            {/* Section: Contact Information */}
            <div className="md:col-span-2 mt-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-200">Contact Information</h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Contact Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="tel" 
                  value={formData.contact_number} 
                  onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })} 
                  placeholder="+91 98765 43210" 
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                  placeholder="officer@gov.in" 
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Address</label>
              <textarea 
                value={formData.address} 
                onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
                rows={2}
                placeholder="Official address..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Website / Profile URL</label>
              <input 
                type="url" 
                value={formData.website} 
                onChange={(e) => setFormData({ ...formData, website: e.target.value })} 
                placeholder="https://..." 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Section: Additional Information */}
            <div className="md:col-span-2 mt-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-200">Additional Information</h3>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes</label>
              <textarea 
                value={formData.notes} 
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })} 
                rows={2}
                placeholder="Any additional information..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50">
          <button 
            type="button"
            onClick={onClose} 
            className="px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 ${
              officerType === 'IPS' ? 'bg-indigo-600 hover:bg-indigo-700' : 
              officerType === 'Other' ? 'bg-gray-600 hover:bg-gray-700' : 
              'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Create {getOfficerTypeLabel()}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}