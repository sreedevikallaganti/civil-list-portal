'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { showToast } from '@/components/Toaster';
import { 
  Search, Plus, User, Phone, Edit2, Trash2, X, Briefcase, 
  Building2, Mail, Loader2, Database, Users, TrendingUp,
  ChevronLeft, ChevronRight, Shield, Heart, AlertTriangle
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import CreateContactPanel from '@/components/CreateContactPanel';

export default function OtherContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Personal' | 'Professional' | 'Emergency' | 'Other'>('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const perPage = 20;

  // Category counts
  const [categoryCounts, setCategoryCounts] = useState({
    all: 0,
    Personal: 0,
    Professional: 0,
    Emergency: 0,
    Other: 0
  });

  const COLLECTION_NAME = 'other_contacts';

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory]);

  useEffect(() => {
    loadContacts(currentPage);
  }, [currentPage, selectedCategory]);

  async function loadContacts(page: number) {
    try {
      setLoading(true);
      
      // other_contacts has no `created` field — sorting by it returns 400 and the list never refreshes
      const response = await pb.collection(COLLECTION_NAME).getList(page, perPage, {
        sort: 'name',
        ...(selectedCategory !== 'all' && { filter: `category = "${selectedCategory}"` }),
      });
      
      const data = Array.isArray(response.items) ? response.items : [];
      
      setContacts(data);
      setTotalItems(response.totalItems);
      setTotalPages(Math.ceil(response.totalItems / perPage));
      
      // Fetch category counts
      await fetchCategoryCounts();
      
    } catch (error: any) {
      console.error('❌ Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategoryCounts() {
    try {
      const [all, personal, professional, emergency, other] = await Promise.all([
        pb.collection(COLLECTION_NAME).getList(1, 1),
        pb.collection(COLLECTION_NAME).getList(1, 1, { filter: 'category = "Personal"' }),
        pb.collection(COLLECTION_NAME).getList(1, 1, { filter: 'category = "Professional"' }),
        pb.collection(COLLECTION_NAME).getList(1, 1, { filter: 'category = "Emergency"' }),
        pb.collection(COLLECTION_NAME).getList(1, 1, { filter: 'category = "Other"' }),
      ]);

      setCategoryCounts({
        all: all.totalItems,
        Personal: personal.totalItems,
        Professional: professional.totalItems,
        Emergency: emergency.totalItems,
        Other: other.totalItems
      });
    } catch (error) {
      console.error('Error fetching category counts:', error);
    }
  }

  const handleEdit = (contact: any) => {
    setEditingContact(contact);
    setIsPanelOpen(true);
    setSelectedContact(null);
  };

  /* two-click delete: the first click asks, a second click within 4 s deletes */
  const armedDeleteRef = useRef<{ id: string; at: number } | null>(null);
  const handleDelete = async (contact: any) => {
    const armed = armedDeleteRef.current;
    if (!armed || armed.id !== contact.id || Date.now() - armed.at > 4000) {
      armedDeleteRef.current = { id: contact.id, at: Date.now() };
      showToast(`Click delete again to remove ${contact.name}`, 'error');
      return;
    }
    armedDeleteRef.current = null;
    try {
      await pb.collection(COLLECTION_NAME).delete(contact.id);
      loadContacts(currentPage);
      if (selectedContact?.id === contact.id) setSelectedContact(null);
      showToast(`${contact.name} deleted`, 'success');
    } catch (error: any) {
      console.error('Delete error:', error);
      showToast('Failed to delete contact', 'error');
    }
  };

  const filteredContacts = useMemo(() => {
    if (!Array.isArray(contacts)) return [];
    if (searchQuery.trim() === '') return contacts;
    
    const query = searchQuery.toLowerCase();
    return contacts.filter(contact => {
      return (
        (contact.name || '').toLowerCase().includes(query) ||
        (contact.contact_number || '').toLowerCase().includes(query) ||
        (contact.designation || '').toLowerCase().includes(query) ||
        (contact.organization || '').toLowerCase().includes(query) ||
        (contact.category || '').toLowerCase().includes(query) ||
        (contact.email || '').toLowerCase().includes(query)
      );
    });
  }, [contacts, searchQuery]);

  const handleNextPage = () => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); };
  const handlePrevPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1); };

  const formatLabel = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length === 0 ? 'N/A' : value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-gray-500 font-medium">Loading contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {selectedCategory === 'all' ? 'Other Contacts' : 
             selectedCategory === 'Personal' ? 'Personal Contacts' :
             selectedCategory === 'Professional' ? 'Professional Contacts' :
             selectedCategory === 'Emergency' ? 'Emergency Contacts' : 'Other Contacts'}
          </h1>
          <p className="text-gray-500 mt-1">
            Page {currentPage} of {totalPages} • Showing {filteredContacts.length} of {totalItems} records
          </p>
        </div>
        <button 
          onClick={() => {
            setEditingContact(null);
            setIsPanelOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Create New Record
        </button>
      </div>

      {/* Category Cards - 5 cards in a row */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* All Contacts */}
        <button
          onClick={() => setSelectedCategory('all')}
          className={`p-5 rounded-xl border-2 transition-all duration-200 text-left ${
            selectedCategory === 'all' 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${selectedCategory === 'all' ? 'bg-gray-600' : 'bg-gray-100'}`}>
              <Users className={`w-5 h-5 ${selectedCategory === 'all' ? 'text-white' : 'text-gray-600'}`} />
            </div>
            <TrendingUp className="w-4 h-4 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">All Contacts</h3>
          <p className="text-sm text-gray-500 mt-1">{categoryCounts.all} total records</p>
        </button>

        {/* Personal */}
        <button
          onClick={() => setSelectedCategory('Personal')}
          className={`p-5 rounded-xl border-2 transition-all duration-200 text-left ${
            selectedCategory === 'Personal' 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${selectedCategory === 'Personal' ? 'bg-blue-600' : 'bg-blue-100'}`}>
              <Heart className={`w-5 h-5 ${selectedCategory === 'Personal' ? 'text-white' : 'text-blue-600'}`} />
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              selectedCategory === 'Personal' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'
            }`}>
              Personal
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Personal</h3>
          <p className="text-sm text-gray-500 mt-1">{categoryCounts.Personal} records</p>
        </button>

        {/* Professional */}
        <button
          onClick={() => setSelectedCategory('Professional')}
          className={`p-5 rounded-xl border-2 transition-all duration-200 text-left ${
            selectedCategory === 'Professional' 
              ? 'border-indigo-500 bg-indigo-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${selectedCategory === 'Professional' ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
              <Briefcase className={`w-5 h-5 ${selectedCategory === 'Professional' ? 'text-white' : 'text-indigo-600'}`} />
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              selectedCategory === 'Professional' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'
            }`}>
              Professional
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Professional</h3>
          <p className="text-sm text-gray-500 mt-1">{categoryCounts.Professional} records</p>
        </button>

        {/* Emergency */}
        <button
          onClick={() => setSelectedCategory('Emergency')}
          className={`p-5 rounded-xl border-2 transition-all duration-200 text-left ${
            selectedCategory === 'Emergency' 
              ? 'border-red-500 bg-red-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${selectedCategory === 'Emergency' ? 'bg-red-600' : 'bg-red-100'}`}>
              <AlertTriangle className={`w-5 h-5 ${selectedCategory === 'Emergency' ? 'text-white' : 'text-red-600'}`} />
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              selectedCategory === 'Emergency' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'
            }`}>
              Emergency
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Emergency</h3>
          <p className="text-sm text-gray-500 mt-1">{categoryCounts.Emergency} records</p>
        </button>

        {/* Other (Now with Blue Theme) */}
        <button
          onClick={() => setSelectedCategory('Other')}
          className={`p-5 rounded-xl border-2 transition-all duration-200 text-left ${
            selectedCategory === 'Other' 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${selectedCategory === 'Other' ? 'bg-blue-600' : 'bg-gray-100'}`}>
              <Users className={`w-5 h-5 ${selectedCategory === 'Other' ? 'text-white' : 'text-gray-600'}`} />
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              selectedCategory === 'Other' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}>
              Other
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Other</h3>
          <p className="text-sm text-gray-500 mt-1">{categoryCounts.Other} records</p>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={`Search ${selectedCategory === 'all' ? 'all contacts' : selectedCategory.toLowerCase()} contacts by name, phone, email, designation, or organization...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Designation</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Organization</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Contact</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                      <p className="text-gray-500">Loading contacts...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-3">
                      <User className="w-8 h-8 text-gray-400" />
                      <p className="text-lg font-medium">No contacts found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => {
                  const getCategoryStyle = (cat: string) => {
                    switch(cat) {
                      case 'Personal': return 'bg-blue-100 text-blue-700 border-blue-200';
                      case 'Professional': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
                      case 'Emergency': return 'bg-red-100 text-red-700 border-red-200';
                      default: return 'bg-gray-100 text-gray-700 border-gray-200';
                    }
                  };
                  
                  const getAvatarColor = (cat: string) => {
                    switch(cat) {
                      case 'Personal': return 'bg-blue-500';
                      case 'Professional': return 'bg-indigo-500';
                      case 'Emergency': return 'bg-red-500';
                      default: return 'bg-gray-500';
                    }
                  };

                  return (
                    <tr 
                      key={contact.id} 
                      onClick={() => setSelectedContact(contact)}
                      className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {contact.photo_url ? (
                            <img 
                              src={`${pb.baseUrl}/api/files/${COLLECTION_NAME}/${contact.id}/${contact.photo_url}`} 
                              alt={contact.name} 
                              className="w-10 h-10 rounded-full object-cover border-2 border-gray-200" 
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${getAvatarColor(contact.category || 'Other')}`}>
                              {(contact.name || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm group-hover:text-blue-700 transition-colors">
                              {contact.name || 'N/A'}
                            </h3>
                            {contact.email && (
                              <p className="text-xs text-gray-500">{contact.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full border ${getCategoryStyle(contact.category || 'Other')}`}>
                          {contact.category || 'Other'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-800 font-medium">
                        {contact.designation || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {contact.organization || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {contact.contact_number || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEdit(contact); }}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(contact); }}
                            className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalItems > perPage && (
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing <span className="font-medium">{filteredContacts.length > 0 ? ((currentPage - 1) * perPage) + 1 : 0}</span> to <span className="font-medium">{Math.min(currentPage * perPage, totalItems)}</span> of <span className="font-medium">{totalItems}</span> results
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handlePrevPage} 
                disabled={currentPage === 1} 
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <button 
                onClick={handleNextPage} 
                disabled={currentPage === totalPages} 
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Contact Details Sidebar */}
      {selectedContact && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity" onClick={() => setSelectedContact(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5 z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {selectedContact.photo_url ? (
                    <img 
                      src={`${pb.baseUrl}/api/files/${COLLECTION_NAME}/${selectedContact.id}/${selectedContact.photo_url}`} 
                      alt={selectedContact.name} 
                      className="w-12 h-12 rounded-xl object-cover border-2 border-gray-200" 
                    />
                  ) : (
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-sm ${
                      selectedContact.category === 'Personal' ? 'bg-blue-500' :
                      selectedContact.category === 'Professional' ? 'bg-indigo-500' :
                      selectedContact.category === 'Emergency' ? 'bg-red-500' :
                      'bg-gray-500'
                    }`}>
                      {(selectedContact.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 leading-tight">{selectedContact.name || 'Unknown'}</h2>
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full mt-1 ${
                      selectedContact.category === 'Personal' ? 'bg-blue-100 text-blue-700' :
                      selectedContact.category === 'Professional' ? 'bg-indigo-100 text-indigo-700' :
                      selectedContact.category === 'Emergency' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {selectedContact.category || 'Contact'}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedContact(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5 flex-1 overflow-y-auto">
              {/* Quick Actions */}
              <div className="flex gap-3">
                <button onClick={() => handleEdit(selectedContact)} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm">
                  <Edit2 className="w-4 h-4" /> Edit
                </button>
                <button onClick={() => handleDelete(selectedContact)} className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors border border-red-200">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* Contact Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                {selectedContact.contact_number && (
                  <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-1.5 text-gray-500 mb-1">
                      <Phone className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold uppercase">Phone</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900">{selectedContact.contact_number}</p>
                  </div>
                )}
                {selectedContact.email && (
                  <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-1.5 text-gray-500 mb-1">
                      <Mail className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold uppercase">Email</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900 truncate">{selectedContact.email}</p>
                  </div>
                )}
                {selectedContact.organization && (
                  <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-1.5 text-gray-500 mb-1">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold uppercase">Organization</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2">{selectedContact.organization}</p>
                  </div>
                )}
                {selectedContact.designation && (
                  <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-1.5 text-gray-500 mb-1">
                      <Briefcase className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold uppercase">Designation</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2">{selectedContact.designation}</p>
                  </div>
                )}
              </div>

              {/* All Fields */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">All Details</h3>
                </div>
                
                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {Object.entries(selectedContact).map(([key, value]) => {
                    const skipFields = ['collectionId', 'collectionName', 'expand', 'id', 'photo_url'];
                    if (skipFields.includes(key)) return null;
                    
                    const formattedValue = formatValue(value);
                    if (formattedValue === 'N/A') return null;

                    return (
                      <div key={key} className="p-3 flex gap-3 hover:bg-white transition-colors">
                        <div className="w-1/3 flex-shrink-0">
                          <p className="text-[10px] font-bold text-gray-500 uppercase leading-tight">
                            {formatLabel(key)}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs text-gray-900 break-words ${
                            typeof value === 'object' || Array.isArray(value) 
                              ? 'font-mono bg-gray-100 p-1.5 rounded text-[10px]' 
                              : ''
                          }`}>
                            {formattedValue}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
              <button 
                onClick={() => setSelectedContact(null)}
                className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create/Edit Contact Panel */}
      <CreateContactPanel 
        isOpen={isPanelOpen}
        onClose={() => {
          setIsPanelOpen(false);
          setEditingContact(null);
        }}
        onSuccess={() => {
          loadContacts(currentPage);
          setIsPanelOpen(false);
          setEditingContact(null);
        }}
        contactToEdit={editingContact}
      />
    </div>
  );
}