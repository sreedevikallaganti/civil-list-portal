'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  X, Calendar, Clock, MapPin, Trash2, 
  Check, ChevronDown, Search, ChevronRight,
  Mail, Loader2, Phone, Users, Globe,
  User, AlertCircle, Clock3, CheckCircle2, XCircle, RefreshCw, Flag, FileText
} from 'lucide-react';
import pb from '@/lib/pocketbase';

interface CreateMeetingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  meetingToEdit?: any;
}

interface Officer {
  id: string;
  name: string;
  designation?: string;
  type: 'IAS' | 'IPS' | 'Other';
  cadre?: string;
  state?: string;
  contact_number?: string;
  email?: string;
  department?: string;
  current_position?: string;
  batch_year?: string;
}

export default function CreateMeetingPanel({ isOpen, onClose, onSuccess, meetingToEdit }: CreateMeetingPanelProps) {
  const [loading, setLoading] = useState(false);
  const [officerLoading, setOfficerLoading] = useState(false);
  const [step, setStep] = useState(1);
  
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [officerSearch, setOfficerSearch] = useState('');
  const [showOfficerDropdown, setShowOfficerDropdown] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [selectedOfficerType, setSelectedOfficerType] = useState<'IAS' | 'IPS' | 'Other' | ''>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isEditMode = !!meetingToEdit;

  const [formData, setFormData] = useState({
    title: '', agenda: '', description: '', meeting_date: '', meeting_time: '',
    duration: '30', location: '', status: 'Scheduled',
    officer_type: '', officer_name: '', officer_id: '', designation: '',
    department: '', officer_category: '', contact_number: '', email: '',
    address: '', website: '', cadre: '', state: '', batch_year: '',
    current_position: '', previous_postings: '', 
    priority: '',           // ✅ No default - user must select
    meeting_type: '',       // ✅ No default - user must select
    meeting_place: '',      // ✅ No default - user must select
    attendees: '',
    notes: '', follow_up_date: '', 
    status_flag: '',        // ✅ No default - user must select
    send_invite: false, sync_gcal: false, created_by: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (meetingToEdit) {
        const rawDate = meetingToEdit.meeting_date || '';
        const formattedDate = rawDate ? rawDate.split(' ')[0] : '';
        const rawTime = meetingToEdit.meeting_time || '';
        const formattedTime = rawTime && rawTime.includes(':') ? rawTime.substring(0, 5) : '';
        const rawFollowUpDate = meetingToEdit.follow_up_date || '';
        const formattedFollowUpDate = rawFollowUpDate ? rawFollowUpDate.split(' ')[0] : '';

        setFormData({
          title: meetingToEdit.title || meetingToEdit.agenda || '',
          agenda: meetingToEdit.agenda || '',
          description: meetingToEdit.description || '',
          meeting_date: formattedDate,
          meeting_time: formattedTime,
          duration: String(meetingToEdit.duration || '30'),
          location: meetingToEdit.location || '',
          status: meetingToEdit.status || 'Scheduled',
          officer_type: meetingToEdit.officer_type || '',
          officer_name: meetingToEdit.officer_name || '',
          officer_id: meetingToEdit.officer_id || '',
          designation: meetingToEdit.designation || '',
          department: meetingToEdit.department || '',
          officer_category: meetingToEdit.officer_category || '',
          contact_number: meetingToEdit.contact_number || '',
          email: meetingToEdit.email || '',
          address: meetingToEdit.address || '',
          website: meetingToEdit.website || '',
          cadre: meetingToEdit.cadre || '',
          state: meetingToEdit.state || '',
          batch_year: meetingToEdit.batch_year || '',
          current_position: meetingToEdit.current_position || '',
          previous_postings: meetingToEdit.previous_postings || '',
          priority: meetingToEdit.priority || '',
          meeting_type: meetingToEdit.meeting_type || '',
          meeting_place: meetingToEdit.meeting_place || '',
          attendees: Array.isArray(meetingToEdit.attendees) ? meetingToEdit.attendees.join(', ') : meetingToEdit.attendees || '',
          notes: meetingToEdit.notes || '',
          follow_up_date: formattedFollowUpDate,
          status_flag: meetingToEdit.status_flag || '',
          send_invite: meetingToEdit.send_invite || false,
          sync_gcal: meetingToEdit.sync_gcal || false,
          created_by: meetingToEdit.created_by || ''
        });

        if (meetingToEdit.officer_type) {
          const type = meetingToEdit.officer_type as 'IAS' | 'IPS' | 'Other';
          setSelectedOfficerType(type);
          fetchOfficersByType(type);
          
          if (meetingToEdit.officer_name) {
            setSelectedOfficer({
              id: meetingToEdit.officer_id || '',
              name: meetingToEdit.officer_name,
              designation: meetingToEdit.designation,
              type: type,
              contact_number: meetingToEdit.contact_number,
              email: meetingToEdit.email,
              department: meetingToEdit.department,
              current_position: meetingToEdit.current_position,
              batch_year: meetingToEdit.batch_year,
              cadre: meetingToEdit.cadre,
              state: meetingToEdit.state,
            });
          }
        }
      } else {
        resetForm();
      }
      setStep(1);
    }
  }, [isOpen, meetingToEdit]);

  useEffect(() => {
    if (selectedOfficerType && isOpen && !meetingToEdit) {
      fetchOfficersByType(selectedOfficerType);
    }
  }, [selectedOfficerType, isOpen, meetingToEdit]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowOfficerDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchOfficersByType(type: 'IAS' | 'IPS' | 'Other') {
    try {
      setOfficerLoading(true);
      let officersData: any[] = [];
      
      if (type === 'IAS') {
        const response = await pb.collection('ias_officers').getFullList({ sort: 'name' });
        officersData = response.map((o: any) => ({
          id: o.id, 
          name: o.name || '',
          designation: o.designation || o.current_position || '',
          type: 'IAS' as const,
          cadre: o.cadre || '',
          state: o.state || '',
          contact_number: o.contact_number || o.phone || '',
          email: o.email || '',
          department: o.department || '',
          current_position: o.current_position || o.designation || '',
          batch_year: o.batch_year || '',
        }));
      } else if (type === 'IPS') {
        const response = await pb.collection('ips_officers').getFullList({ sort: 'name' });
        officersData = response.map((o: any) => ({
          id: o.id, 
          name: o.name || '',
          designation: o.designation || o.current_position || '',
          type: 'IPS' as const,
          cadre: o.cadre || '',
          state: o.state || '',
          contact_number: o.contact_number || o.phone || '',
          email: o.email || '',
          department: o.department || '',
          current_position: o.current_position || o.designation || '',
          batch_year: o.batch_year || '',
        }));
      } else if (type === 'Other') {
        const response = await pb.collection('other_contacts').getFullList({ sort: 'name' });
        officersData = response.map((o: any) => ({
          id: o.id, 
          name: o.name || '',
          designation: o.designation || o.occupation || '',
          type: 'Other' as const,
          contact_number: o.contact_number || o.phone || '',
          email: o.email || '',
          department: o.department || '',
          current_position: o.current_position || '',
          cadre: o.cadre || '',
          state: o.state || '',
          batch_year: o.batch_year || '',
        }));
      }
      
      console.log(`✅ Fetched ${officersData.length} ${type} officers with full details`);
      setOfficers(officersData);
    } catch (error) {
      console.error('Error fetching officers:', error);
    } finally {
      setOfficerLoading(false);
    }
  }

  const filteredOfficers = officers.filter(officer => {
    if (!officerSearch) return true;
    const query = officerSearch.toLowerCase();
    return (
      officer.name.toLowerCase().includes(query) ||
      officer.designation?.toLowerCase().includes(query) ||
      officer.cadre?.toLowerCase().includes(query) ||
      officer.department?.toLowerCase().includes(query)
    );
  });

  const handleSelectOfficer = (officer: Officer) => {
    console.log('📋 Selecting officer with full details:', officer);
    
    setSelectedOfficer(officer);
    setFormData(prev => ({
      ...prev,
      officer_name: officer.name || '',
      designation: officer.designation || '',
      officer_id: officer.id || '',
      officer_type: officer.type || '',
      contact_number: officer.contact_number || '',
      email: officer.email || '',
      department: officer.department || '',
      current_position: officer.current_position || '',
      batch_year: officer.batch_year || '',
      cadre: officer.cadre || '',
      state: officer.state || '',
    }));
    
    setOfficerSearch('');
    setShowOfficerDropdown(false);
  };

  const resetForm = () => {
    setFormData({
      title: '', agenda: '', description: '', meeting_date: '', meeting_time: '',
      duration: '30', location: '', status: 'Scheduled', officer_type: '',
      officer_name: '', officer_id: '', designation: '', department: '',
      officer_category: '', contact_number: '', email: '', address: '',
      website: '', cadre: '', state: '', batch_year: '', current_position: '',
      previous_postings: '', 
      priority: '',
      meeting_type: '',
      meeting_place: '',
      attendees: '', notes: '', follow_up_date: '',
      status_flag: '',
      send_invite: false, sync_gcal: false, created_by: ''
    });
    setSelectedOfficer(null);
    setSelectedOfficerType('');
    setOfficers([]);
    setOfficerSearch('');
    setShowOfficerDropdown(false);
    setStep(1);
  };

  const nextStep = () => {
    if (step === 1 && !formData.officer_name) {
      alert('Please select an officer to continue.');
      return;
    }
    if (step === 2 && (!formData.agenda || !formData.meeting_date || !formData.meeting_time)) {
      alert('Please fill in Agenda, Date, and Time.');
      return;
    }
    if (step === 3 && (!formData.meeting_type || !formData.meeting_place || !formData.priority || !formData.status_flag)) {
      alert('Please select all meeting settings (Type, Place, Priority, and Status Flag).');
      return;
    }
    setStep(step + 1);
  };

  const prevStep = () => setStep(step - 1);

  const handleSubmit = async () => {
    if (!formData.agenda || !formData.meeting_date || !formData.meeting_time) {
      alert('Please fill in all required fields (Agenda, Date, Time)');
      return;
    }

    try {
      setLoading(true);
      const formattedTime = formData.meeting_time ? `${formData.meeting_time}:00` : '00:00:00';
      const attendeesArray = formData.attendees ? formData.attendees.split(',').map(a => a.trim()).filter(a => a) : [];

      const meetingData = {
        title: formData.title || formData.agenda,
        agenda: formData.agenda,
        description: formData.description,
        meeting_date: formData.meeting_date,
        meeting_time: formattedTime,
        duration: parseFloat(formData.duration) || 30,
        location: formData.location,
        status: formData.status,
        officer_type: formData.officer_type,
        officer_name: formData.officer_name,
        officer_id: formData.officer_id,
        designation: formData.designation,
        department: formData.department,
        officer_category: formData.officer_category,
        contact_number: formData.contact_number,
        email: formData.email,
        address: formData.address,
        website: formData.website,
        cadre: formData.cadre,
        state: formData.state,
        batch_year: formData.batch_year,
        current_position: formData.current_position,
        previous_postings: formData.previous_postings,
        priority: formData.priority,
        meeting_type: formData.meeting_type,
        meeting_place: formData.meeting_place,
        attendees: attendeesArray,
        notes: formData.notes,
        follow_up_date: formData.follow_up_date,
        status_flag: formData.status_flag,
        send_invite: formData.send_invite,
        sync_gcal: formData.sync_gcal,
        created_by: formData.created_by
      };

      if (isEditMode && meetingToEdit) {
        await pb.collection('meetings').update(meetingToEdit.id, meetingData);
      } else {
        await pb.collection('meetings').create(meetingData);
      }
      
      setLoading(false);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving meeting:', error);
      setLoading(false);
      let errorMsg = 'Failed to save meeting.\n\n';
      if (error.response?.data?.data) {
        const errors = error.response.data.data;
        Object.keys(errors).forEach(key => {
          errorMsg += `• ${key}: ${errors[key].message}\n`;
        });
      }
      alert(errorMsg);
    }
  };

  const handleDelete = async () => {
    if (!meetingToEdit) return;
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    try {
      setLoading(true);
      await pb.collection('meetings').delete(meetingToEdit.id);
      setLoading(false);
      onSuccess();
      onClose();
    } catch (error) {
      setLoading(false);
      alert('Failed to delete meeting.');
    }
  };

  if (!isOpen) return null;

  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <User className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Step 1: Select Officer</h3>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Officer Type <span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          {[{ value: 'IAS', label: 'IAS Officer' }, { value: 'IPS', label: 'IPS Officer' }, { value: 'Other', label: 'Other Contacts' }].map((type) => (
            <button 
              key={type.value} 
              type="button" 
              onClick={() => { 
                setSelectedOfficerType(type.value as 'IAS' | 'IPS' | 'Other'); 
                setFormData(prev => ({ ...prev, officer_type: type.value }));
                setSelectedOfficer(null);
                setShowOfficerDropdown(true);
              }} 
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border-2 ${selectedOfficerType === type.value ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {selectedOfficerType && !selectedOfficer && (
        <div className="relative" ref={dropdownRef}>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Select Officer <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={officerSearch}
              onChange={(e) => {
                setOfficerSearch(e.target.value);
                setShowOfficerDropdown(true);
              }}
              onFocus={() => setShowOfficerDropdown(true)}
              placeholder={`Search ${selectedOfficerType} officers...`}
              className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-transform ${showOfficerDropdown ? 'rotate-180' : ''}`} />
          </div>

          {showOfficerDropdown && (
            <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
              {officerLoading ? (
                <div className="p-4 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading all officers...
                </div>
              ) : filteredOfficers.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">No officers found</div>
              ) : (
                filteredOfficers.map((officer) => (
                  <button
                    key={officer.id}
                    type="button"
                    onClick={() => handleSelectOfficer(officer)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${officer.type === 'IAS' ? 'bg-blue-600' : officer.type === 'IPS' ? 'bg-indigo-600' : 'bg-gray-600'}`}>
                        {officer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{officer.name}</p>
                        <p className="text-xs text-gray-500 truncate">{officer.designation || 'No designation'}</p>
                        {(officer.contact_number || officer.email) && (
                          <p className="text-xs text-gray-400 truncate">
                            {officer.contact_number}{officer.contact_number && officer.email ? ' • ' : ''}{officer.email}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {selectedOfficer && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${selectedOfficer.type === 'IAS' ? 'bg-blue-600' : selectedOfficer.type === 'IPS' ? 'bg-indigo-600' : 'bg-gray-600'}`}>
                {selectedOfficer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{selectedOfficer.name}</p>
                <p className="text-xs text-gray-600">{selectedOfficer.designation || selectedOfficer.current_position}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedOfficer(null);
                setOfficerSearch('');
                setShowOfficerDropdown(true);
              }}
              className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Change
            </button>
          </div>

          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800"><span className="font-semibold">All details auto-filled from database.</span> You can edit any field below if needed.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
              <input 
                type="text" 
                value={formData.officer_name} 
                onChange={(e) => setFormData({ ...formData, officer_name: e.target.value })} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Designation</label>
              <input 
                type="text" 
                value={formData.designation} 
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Number</label>
              <input 
                type="tel" 
                value={formData.contact_number} 
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
              <input 
                type="email" 
                value={formData.email} 
                onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Department</label>
              <input 
                type="text" 
                value={formData.department} 
                onChange={(e) => setFormData({ ...formData, department: e.target.value })} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Cadre</label>
              <input 
                type="text" 
                value={formData.cadre} 
                onChange={(e) => setFormData({ ...formData, cadre: e.target.value })} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">State</label>
              <input 
                type="text" 
                value={formData.state} 
                onChange={(e) => setFormData({ ...formData, state: e.target.value })} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Batch Year</label>
              <input 
                type="text" 
                value={formData.batch_year} 
                onChange={(e) => setFormData({ ...formData, batch_year: e.target.value })} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Current Position</label>
              <input 
                type="text" 
                value={formData.current_position} 
                onChange={(e) => setFormData({ ...formData, current_position: e.target.value })} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <FileText className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Step 2: Meeting Basics</h3>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Agenda / Title <span className="text-red-500">*</span></label>
        <input type="text" value={formData.agenda} onChange={(e) => setFormData({ ...formData, agenda: e.target.value, title: e.target.value })} placeholder="e.g., Quarterly Review with District Collector" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Date <span className="text-red-500">*</span></label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="date" value={formData.meeting_date} onChange={(e) => setFormData({ ...formData, meeting_date: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Time <span className="text-red-500">*</span></label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="time" value={formData.meeting_time} onChange={(e) => setFormData({ ...formData, meeting_time: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Duration (minutes)</label>
          <input type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Location / Venue</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="e.g., Conference Room A" className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <Clock3 className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Step 3: Meeting Settings</h3>
      </div>
      
      {/* Meeting Type - No default */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Meeting Type <span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          {['Internal', 'External'].map((type) => (
            <button 
              key={type} 
              type="button" 
              onClick={() => setFormData({ ...formData, meeting_type: type })} 
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border-2 ${
                formData.meeting_type === type 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Meeting Place - No default */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Meeting Place <span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          {['Offline', 'Online', 'Outside'].map((place) => (
            <button 
              key={place} 
              type="button" 
              onClick={() => setFormData({ ...formData, meeting_place: place })} 
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border-2 ${
                formData.meeting_place === place 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {place}
            </button>
          ))}
        </div>
      </div>

      {/* Priority - No default */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Priority <span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          {[
            { value: 'Low', bg: 'bg-gray-600', border: 'border-gray-600' }, 
            { value: 'Medium', bg: 'bg-blue-600', border: 'border-blue-600' }, 
            { value: 'High', bg: 'bg-red-600', border: 'border-red-600' }
          ].map((p) => (
            <button 
              key={p.value} 
              type="button" 
              onClick={() => setFormData({ ...formData, priority: p.value })} 
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border-2 ${
                formData.priority === p.value 
                  ? `${p.bg} text-white ${p.border} shadow-md` 
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {p.value}
            </button>
          ))}
        </div>
      </div>

      {/* Status Flag - No default */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Status Flag <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'Normal', bg: 'bg-green-600', border: 'border-green-600' }, 
            { value: 'Urgent', bg: 'bg-red-600', border: 'border-red-600' }, 
            { value: 'Pending', bg: 'bg-yellow-500', border: 'border-yellow-500' }, 
            { value: 'Follow-up', bg: 'bg-blue-600', border: 'border-blue-600' }, 
            { value: 'Completed', bg: 'bg-emerald-600', border: 'border-emerald-600' }, 
            { value: 'Cancelled', bg: 'bg-gray-600', border: 'border-gray-600' }
          ].map((flag) => (
            <button 
              key={flag.value} 
              type="button" 
              onClick={() => setFormData({ ...formData, status_flag: flag.value })} 
              className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 border-2 ${
                formData.status_flag === flag.value 
                  ? `${flag.bg} text-white ${flag.border} shadow-md` 
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {flag.value}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <Users className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Step 4: Additional Details</h3>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Attendees</label>
        <div className="relative">
          <Users className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <textarea value={formData.attendees} onChange={(e) => setFormData({ ...formData, attendees: e.target.value })} rows={2} placeholder="Enter names separated by commas..." className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
        <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} placeholder="Additional notes..." className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Follow-up Date</label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="date" value={formData.follow_up_date} onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
      </div>
      <div className="space-y-3 pt-2">
        <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
          <input type="checkbox" checked={formData.send_invite} onChange={(e) => setFormData({ ...formData, send_invite: e.target.checked })} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
          <Mail className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-gray-700">Send Email Invite</span>
        </label>
        <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
          <input type="checkbox" checked={formData.sync_gcal} onChange={(e) => setFormData({ ...formData, sync_gcal: e.target.checked })} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
          <Calendar className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-gray-700">Sync with Google Calendar</span>
        </label>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <CheckCircle2 className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Step 5: Review & Submit</h3>
      </div>
      <div className="bg-gray-50 rounded-xl p-5 space-y-4 border border-gray-200">
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Officer Details</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Name:</span> <span className="font-medium text-gray-900">{formData.officer_name || '-'}</span></div>
            <div><span className="text-gray-500">Designation:</span> <span className="font-medium text-gray-900">{formData.designation || '-'}</span></div>
            <div><span className="text-gray-500">Contact:</span> <span className="font-medium text-gray-900">{formData.contact_number || '-'}</span></div>
            <div><span className="text-gray-500">Email:</span> <span className="font-medium text-gray-900">{formData.email || '-'}</span></div>
            <div><span className="text-gray-500">Department:</span> <span className="font-medium text-gray-900">{formData.department || '-'}</span></div>
            <div><span className="text-gray-500">Cadre:</span> <span className="font-medium text-gray-900">{formData.cadre || '-'}</span></div>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Meeting Details</h4>
          <div className="space-y-2 text-sm">
            <div><span className="text-gray-500">Agenda:</span> <span className="font-medium text-gray-900">{formData.agenda || '-'}</span></div>
            <div className="flex gap-4">
              <div><span className="text-gray-500">Date:</span> <span className="font-medium text-gray-900">{formData.meeting_date || '-'}</span></div>
              <div><span className="text-gray-500">Time:</span> <span className="font-medium text-gray-900">{formData.meeting_time || '-'}</span></div>
              <div><span className="text-gray-500">Duration:</span> <span className="font-medium text-gray-900">{formData.duration} min</span></div>
            </div>
            <div><span className="text-gray-500">Location:</span> <span className="font-medium text-gray-900">{formData.location || '-'}</span></div>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Settings</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Type:</span> <span className="font-medium text-gray-900">{formData.meeting_type || '-'}</span></div>
            <div><span className="text-gray-500">Place:</span> <span className="font-medium text-gray-900">{formData.meeting_place || '-'}</span></div>
            <div><span className="text-gray-500">Priority:</span> <span className="font-medium text-gray-900">{formData.priority || '-'}</span></div>
            <div><span className="text-gray-500">Status:</span> <span className="font-medium text-gray-900">{formData.status_flag || '-'}</span></div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <p className="text-sm text-blue-800">Please review all details above. You can go back to any step to make changes before submitting.</p>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-white shadow-2xl z-50 flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div>
            <h2 className="text-xl font-bold text-white">{isEditMode ? 'Edit Meeting' : 'New Meeting'}</h2>
            <p className="text-sm text-blue-100 mt-0.5">Quick 5-step setup</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {step > s ? <Check className="w-4 h-4" /> : s}
                </div>
                {s < 5 && <div className={`flex-1 h-1 mx-2 rounded-full transition-all duration-300 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs font-medium text-gray-500 px-1">
            <span className={step === 1 ? 'text-blue-600' : ''}>Officer</span>
            <span className={step === 2 ? 'text-blue-600' : ''}>Basics</span>
            <span className={step === 3 ? 'text-blue-600' : ''}>Settings</span>
            <span className={step === 4 ? 'text-blue-600' : ''}>Details</span>
            <span className={step === 5 ? 'text-blue-600' : ''}>Review</span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div>
            {isEditMode && step === 5 && (
              <button onClick={handleDelete} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            {step > 1 && (
              <button onClick={prevStep} className="px-5 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors">Back</button>
            )}
            {step < 5 ? (
              <button onClick={nextStep} className="px-5 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                Next Step <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading} className="px-5 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-4 h-4" /> {isEditMode ? 'Update Meeting' : 'Create Meeting'}</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}