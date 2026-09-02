'use client';

import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import pb from '@/lib/pocketbase';

interface CreateContactPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  contactToEdit?: any;
}

export default function CreateContactPanel({ isOpen, onClose, onSuccess, contactToEdit }: CreateContactPanelProps) {
  const [loading, setLoading] = useState(false);
  const isEditMode = !!contactToEdit;

  const [formData, setFormData] = useState({
    name: '',
    category: 'Vendor',
    designation: '',
    organization: '',
    contact_number: '',
    email: '',
    date_of_birth: '',
    address: '',
    website: '',
    photo_url: '',
    remarks: '',
    appointment_date: '',
    twitter_x: '',
    linkedin: '',
    instagram: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (contactToEdit) {
        setFormData({
          name: contactToEdit.name || '',
          category: contactToEdit.category || 'Vendor',
          designation: contactToEdit.designation || '',
          organization: contactToEdit.organization || '',
          contact_number: contactToEdit.contact_number || '',
          email: contactToEdit.email || '',
          date_of_birth: contactToEdit.date_of_birth || '',
          address: contactToEdit.address || '',
          website: contactToEdit.website || '',
          photo_url: contactToEdit.photo_url || '',
          remarks: contactToEdit.remarks || '',
          appointment_date: contactToEdit.appointment_date || '',
          twitter_x: contactToEdit.twitter_x || '',
          linkedin: contactToEdit.linkedin || '',
          instagram: contactToEdit.instagram || ''
        });
      } else {
        setFormData({
          name: '',
          category: 'Vendor',
          designation: '',
          organization: '',
          contact_number: '',
          email: '',
          date_of_birth: '',
          address: '',
          website: '',
          photo_url: '',
          remarks: '',
          appointment_date: '',
          twitter_x: '',
          linkedin: '',
          instagram: ''
        });
      }
    }
  }, [contactToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      alert('Please fill in the required Name field');
      return;
    }

    try {
      setLoading(true);
      
      if (isEditMode && contactToEdit) {
        await pb.collection('other_contacts').update(contactToEdit.id, formData);
      } else {
        await pb.collection('other_contacts').create(formData);
      }
      
      setLoading(false);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving contact:', error);
      setLoading(false);
      alert('Failed to save contact. Please check the fields.');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />
      
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-teal-50 to-emerald-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{isEditMode ? 'Edit Contact' : 'Create New Contact'}</h2>
            <p className="text-xs text-gray-600 mt-0.5">Fill in all contact details</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="md:col-span-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-200">Basic Information</h3>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
              <input 
                type="text" 
                value={formData.name} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                placeholder="e.g., Ramesh Reddy" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Category</label>
              <select 
                value={formData.category} 
                onChange={(e) => setFormData({ ...formData, category: e.target.value })} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="Vendor">Vendor</option>
                <option value="Engineering">Engineering</option>
                <option value="Administration">Administration</option>
                <option value="Civil Surgeon">Civil Surgeon</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date of Birth</label>
              <input 
                type="date" 
                value={formData.date_of_birth} 
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2 mt-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-200">Professional Information</h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Designation</label>
              <input 
                type="text" 
                value={formData.designation} 
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })} 
                placeholder="e.g., Lead Developer" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Organization</label>
              <input 
                type="text" 
                value={formData.organization} 
                onChange={(e) => setFormData({ ...formData, organization: e.target.value })} 
                placeholder="e.g., ABC Corp" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Appointment Date</label>
              <input 
                type="date" 
                value={formData.appointment_date} 
                onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })} 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2 mt-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-200">Contact Information</h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Contact Number</label>
              <input 
                type="tel" 
                value={formData.contact_number} 
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })} 
                placeholder="+91 98765 43210" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email</label>
              <input 
                type="email" 
                value={formData.email} 
                onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                placeholder="example@email.com" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Address</label>
              <textarea 
                value={formData.address} 
                onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
                rows={2}
                placeholder="Full address..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Website</label>
              <input 
                type="url" 
                value={formData.website} 
                onChange={(e) => setFormData({ ...formData, website: e.target.value })} 
                placeholder="https://..." 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2 mt-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-200">Social Media</h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Twitter/X</label>
              <input 
                type="text" 
                value={formData.twitter_x} 
                onChange={(e) => setFormData({ ...formData, twitter_x: e.target.value })} 
                placeholder="username" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">LinkedIn</label>
              <input 
                type="url" 
                value={formData.linkedin} 
                onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })} 
                placeholder="https://linkedin.com/in/..." 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Instagram</label>
              <input 
                type="text" 
                value={formData.instagram} 
                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })} 
                placeholder="username" 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2 mt-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-200">Additional Information</h3>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Photo URL</label>
              <input 
                type="url" 
                value={formData.photo_url} 
                onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })} 
                placeholder="https://..." 
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Remarks</label>
              <textarea 
                value={formData.remarks} 
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} 
                rows={3}
                placeholder="Any additional notes..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
            </div>
          </div>
        </form>

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
            className="px-5 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEditMode ? 'Update Contact' : 'Create Contact'}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}