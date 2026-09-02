'use client';

import { useState } from 'react';
import { X, Calendar, Clock, MapPin, Users, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import pb from '@/lib/pocketbase';

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateMeetingModal({ isOpen, onClose, onSuccess }: CreateMeetingModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    date: '',
    time: '',
    duration: '60',
    location: '',
    description: '',
    attendees: '',
    status: 'Scheduled',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      // Validate required fields
      if (!formData.title.trim()) {
        throw new Error('Meeting title is required');
      }
      if (!formData.date) {
        throw new Error('Meeting date is required');
      }
      if (!formData.time) {
        throw new Error('Meeting time is required');
      }

      // Prepare data for PocketBase - match your collection field names exactly
      const meetingData: any = {
        title: formData.title.trim(),
        name: formData.title.trim(), // Some collections use 'name' instead of 'title'
        date: formData.date,
        time: formData.time,
        duration: parseInt(formData.duration) || 60,
        status: formData.status,
      };

      // Add optional fields only if they have values
      if (formData.location.trim()) {
        meetingData.location = formData.location.trim();
        meetingData.venue = formData.location.trim();
        meetingData.room = formData.location.trim();
      }
      
      if (formData.description.trim()) {
        meetingData.description = formData.description.trim();
        meetingData.notes = formData.description.trim();
        meetingData.agenda = formData.description.trim();
      }

      // Handle attendees - convert comma-separated string to array
      if (formData.attendees.trim()) {
        const attendeeList = formData.attendees
          .split(',')
          .map(a => a.trim())
          .filter(a => a.length > 0);
        
        if (attendeeList.length > 0) {
          meetingData.attendees = attendeeList;
          meetingData.participants = attendeeList;
        }
      }

      console.log('📤 Creating meeting with data:', meetingData);

      // Create meeting in PocketBase
      const record = await pb.collection('meetings').create(meetingData);
      
      console.log('✅ Meeting created successfully:', record);

      setSuccess(true);
      
      // Reset form and close after brief delay
      setTimeout(() => {
        setFormData({
          title: '',
          date: '',
          time: '',
          duration: '60',
          location: '',
          description: '',
          attendees: '',
          status: 'Scheduled',
        });
        setSuccess(false);
        onSuccess(); // Trigger dashboard refresh
        onClose();
      }, 1200);
      
    } catch (err: any) {
      console.error('❌ Error creating meeting:', err);
      setError(err.message || 'Failed to create meeting. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Create New Meeting</h2>
            <p className="text-sm text-gray-500 mt-0.5">Schedule a new meeting</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Title / Agenda <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g., IOCL Project discussion"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                required
              />
            </div>
          </div>

          {/* Date and Time Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  name="time"
                  value={formData.time}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
            </div>
          </div>

          {/* Duration and Status Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duration (minutes)
              </label>
              <select
                name="duration"
                value={formData.duration}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
              >
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="e.g., Conference Room A, Delhi"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>

          {/* Attendees */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Attendees
            </label>
            <div className="relative">
              <Users className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <textarea
                name="attendees"
                value={formData.attendees}
                onChange={handleChange}
                placeholder="Enter names separated by commas (e.g., John Doe, Jane Smith)"
                rows={2}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Separate multiple attendees with commas</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description / Notes
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Add meeting agenda, notes, or additional details..."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-600">Meeting created successfully!</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  Create Meeting
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}