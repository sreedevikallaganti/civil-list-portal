'use client';

import { useEffect, useState } from 'react';
import { 
  Search, ChevronLeft, ChevronRight, User, FileText, Shield, 
  Briefcase, MapPin, GraduationCap, Loader2, X, Mail, Phone, 
  Calendar, Database, Plus, Users, Building2, TrendingUp
} from 'lucide-react';
import pb from '@/lib/pocketbase';
import CreateOfficerPanel from '@/components/CreateOfficerPanel';

export default function OfficersPage() {
  const [officers, setOfficers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'IAS' | 'IPS' | 'Other'>('all');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelOfficerType, setPanelOfficerType] = useState<'IAS' | 'IPS' | 'Other'>('IAS');
  
  // Counts for each type
  const [iasCount, setIasCount] = useState(0);
  const [ipsCount, setIpsCount] = useState(0);
  const [otherCount, setOtherCount] = useState(0);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const perPage = 50;

  // Sidebar State
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedType]);

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, selectedType]);

  async function loadData(page: number) {
    try {
      setLoading(true);
      
      let officersData = [];
      
      if (selectedType === 'IAS') {
        const result = await pb.collection('ias_officers').getList(page, perPage, { sort: 'name' });
        officersData = result.items.map((o: any) => ({ ...o, type: 'IAS' }));
        setIasCount(result.totalItems);
        setTotalItems(result.totalItems);
        setTotalPages(Math.ceil(result.totalItems / perPage));
      } else if (selectedType === 'IPS') {
        const result = await pb.collection('ips_officers').getList(page, perPage, { sort: 'name' });
        officersData = result.items.map((o: any) => ({ ...o, type: 'IPS' }));
        setIpsCount(result.totalItems);
        setTotalItems(result.totalItems);
        setTotalPages(Math.ceil(result.totalItems / perPage));
      } else if (selectedType === 'Other') {
        const result = await pb.collection('other_contacts').getList(page, perPage, { sort: 'name' });
        officersData = result.items.map((o: any) => ({ ...o, type: 'Other' }));
        setOtherCount(result.totalItems);
        setTotalItems(result.totalItems);
        setTotalPages(Math.ceil(result.totalItems / perPage));
      } else {
        // Fetch all three
        const [iasResult, ipsResult, otherResult] = await Promise.all([
          pb.collection('ias_officers').getList(page, perPage, { sort: 'name' }),
          pb.collection('ips_officers').getList(page, perPage, { sort: 'name' }),
          pb.collection('other_contacts').getList(page, perPage, { sort: 'name' }),
        ]);
        
        const iasOfficers = iasResult.items.map((o: any) => ({ ...o, type: 'IAS' }));
        const ipsOfficers = ipsResult.items.map((o: any) => ({ ...o, type: 'IPS' }));
        const otherOfficers = otherResult.items.map((o: any) => ({ ...o, type: 'Other' }));
        
        officersData = [...iasOfficers, ...ipsOfficers, ...otherOfficers].sort((a, b) => 
          (a.name || '').localeCompare(b.name || '')
        );
        
        setIasCount(iasResult.totalItems);
        setIpsCount(ipsResult.totalItems);
        setOtherCount(otherResult.totalItems);
        
        const total = iasResult.totalItems + ipsResult.totalItems + otherResult.totalItems;
        setTotalItems(total);
        setTotalPages(Math.ceil(Math.max(iasResult.totalItems, ipsResult.totalItems, otherResult.totalItems) / perPage));
      }

      setOfficers(officersData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredOfficers = officers.filter(officer => {
    if (searchQuery === '') return true;
    const query = searchQuery.toLowerCase();
    return (
      (officer.name || '').toLowerCase().includes(query) ||
      (officer.officer_id || '').toLowerCase().includes(query) ||
      (officer.current_position || '').toLowerCase().includes(query) ||
      (officer.cadre || '').toLowerCase().includes(query)
    );
  });

  const handleNextPage = () => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); };
  const handlePrevPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1); };

  const formatLabel = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
      if (value.length === 0) return 'N/A';
      return value.join(', ');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const handleCardClick = (type: 'all' | 'IAS' | 'IPS' | 'Other') => {
    setSelectedType(type);
    setCurrentPage(1);
    setSearchQuery('');
  };

  const handleCreateNew = (type: 'IAS' | 'IPS' | 'Other') => {
    setPanelOfficerType(type);
    setIsPanelOpen(true);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {selectedType === 'all' ? 'Officers Directory' : 
             selectedType === 'IAS' ? 'IAS Officers' : 
             selectedType === 'IPS' ? 'IPS Officers' : 'Other Contacts'}
          </h1>
          <p className="text-gray-500 mt-1">
            Page {currentPage} of {totalPages} • Showing {filteredOfficers.length} of {totalItems} records
          </p>
        </div>
        
        <button 
          onClick={() => handleCreateNew(selectedType === 'all' ? 'IAS' : selectedType === 'Other' ? 'Other' : selectedType)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Create New Record
        </button>
      </div>

      {/* Three Clickable Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* All Officers Card */}
        <button
          onClick={() => handleCardClick('all')}
          className={`p-5 rounded-xl border-2 transition-all duration-200 text-left hover:shadow-md ${
            selectedType === 'all' 
              ? 'border-blue-600 bg-blue-50 shadow-md' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${selectedType === 'all' ? 'bg-blue-600' : 'bg-gray-100'}`}>
              <Users className={`w-5 h-5 ${selectedType === 'all' ? 'text-white' : 'text-gray-600'}`} />
            </div>
            <TrendingUp className={`w-4 h-4 ${selectedType === 'all' ? 'text-blue-600' : 'text-gray-400'}`} />
          </div>
          <h3 className={`text-lg font-bold ${selectedType === 'all' ? 'text-blue-900' : 'text-gray-900'}`}>
            All Officers
          </h3>
          <p className={`text-sm mt-1 ${selectedType === 'all' ? 'text-blue-700' : 'text-gray-500'}`}>
            {iasCount + ipsCount + otherCount} total records
          </p>
        </button>

        {/* IAS Officers Card */}
        <button
          onClick={() => handleCardClick('IAS')}
          className={`p-5 rounded-xl border-2 transition-all duration-200 text-left hover:shadow-md ${
            selectedType === 'IAS' 
              ? 'border-blue-600 bg-blue-50 shadow-md' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${selectedType === 'IAS' ? 'bg-blue-600' : 'bg-blue-100'}`}>
              <Briefcase className={`w-5 h-5 ${selectedType === 'IAS' ? 'text-white' : 'text-blue-600'}`} />
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              selectedType === 'IAS' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'
            }`}>
              IAS
            </span>
          </div>
          <h3 className={`text-lg font-bold ${selectedType === 'IAS' ? 'text-blue-900' : 'text-gray-900'}`}>
            IAS Officers
          </h3>
          <p className={`text-sm mt-1 ${selectedType === 'IAS' ? 'text-blue-700' : 'text-gray-500'}`}>
            {iasCount} records
          </p>
        </button>

        {/* IPS Officers Card */}
        <button
          onClick={() => handleCardClick('IPS')}
          className={`p-5 rounded-xl border-2 transition-all duration-200 text-left hover:shadow-md ${
            selectedType === 'IPS' 
              ? 'border-indigo-600 bg-indigo-50 shadow-md' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${selectedType === 'IPS' ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
              <Shield className={`w-5 h-5 ${selectedType === 'IPS' ? 'text-white' : 'text-indigo-600'}`} />
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              selectedType === 'IPS' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'
            }`}>
              IPS
            </span>
          </div>
          <h3 className={`text-lg font-bold ${selectedType === 'IPS' ? 'text-indigo-900' : 'text-gray-900'}`}>
            IPS Officers
          </h3>
          <p className={`text-sm mt-1 ${selectedType === 'IPS' ? 'text-indigo-700' : 'text-gray-500'}`}>
            {ipsCount} records
          </p>
        </button>

        {/* Other Contacts Card */}
        <button
          onClick={() => handleCardClick('Other')}
          className={`p-5 rounded-xl border-2 transition-all duration-200 text-left hover:shadow-md ${
            selectedType === 'Other' 
              ? 'border-gray-600 bg-gray-50 shadow-md' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${selectedType === 'Other' ? 'bg-gray-600' : 'bg-gray-100'}`}>
              <Users className={`w-5 h-5 ${selectedType === 'Other' ? 'text-white' : 'text-gray-600'}`} />
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              selectedType === 'Other' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}>
              Other
            </span>
          </div>
          <h3 className={`text-lg font-bold ${selectedType === 'Other' ? 'text-gray-900' : 'text-gray-900'}`}>
            Other Contacts
          </h3>
          <p className={`text-sm mt-1 ${selectedType === 'Other' ? 'text-gray-700' : 'text-gray-500'}`}>
            {otherCount} records
          </p>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={`Search ${selectedType === 'all' ? 'all officers' : selectedType === 'Other' ? 'contacts' : `${selectedType} officers`} by name, ID, position, or cadre...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Officer ID</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch Year</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cadre</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Position</th>
                {selectedType === 'all' && (
                  <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={selectedType === 'all' ? 7 : 6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                      <p className="text-gray-500">Loading officers...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredOfficers.length === 0 ? (
                <tr>
                  <td colSpan={selectedType === 'all' ? 7 : 6} className="px-6 py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-3">
                      <User className="w-8 h-8 text-gray-400" />
                      <p className="text-lg font-medium">No officers found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOfficers.map((officer) => (
                  <tr 
                    key={officer.id} 
                    onClick={() => setSelectedOfficer(officer)}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ${
                          officer.type === 'IAS' ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 
                          officer.type === 'IPS' ? 'bg-gradient-to-br from-indigo-500 to-indigo-600' :
                          'bg-gradient-to-br from-gray-500 to-gray-600'
                        }`}>
                          {(officer.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm group-hover:text-blue-700 transition-colors">{officer.name || 'N/A'}</p>
                          <p className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">View Profile →</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">{officer.officer_id || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{officer.batch_year || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{officer.cadre || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{officer.state || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800 font-medium max-w-xs truncate" title={officer.current_position}>
                      {officer.current_position || '-'}
                    </td>
                    {selectedType === 'all' && (
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-full ${
                          officer.type === 'IAS' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 
                          officer.type === 'IPS' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                          'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {officer.type === 'Other' ? 'Other' : officer.type}
                        </span>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing <span className="font-medium">{filteredOfficers.length > 0 ? ((currentPage - 1) * perPage) + 1 : 0}</span> to <span className="font-medium">{Math.min(currentPage * perPage, totalItems)}</span> of <span className="font-medium">{totalItems}</span> results
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrevPage} disabled={currentPage === 1 || loading} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button onClick={handleNextPage} disabled={currentPage === totalPages || loading} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Officer Details Sidebar */}
      {selectedOfficer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedOfficer(null)}
          />
          
          <div className="relative w-full max-w-md bg-white shadow-2xl h-full overflow-y-auto animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5 z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-sm ${
                    selectedOfficer.type === 'IAS' ? 'bg-gradient-to-br from-blue-500 to-blue-700' : 
                    selectedOfficer.type === 'IPS' ? 'bg-gradient-to-br from-indigo-500 to-indigo-700' :
                    'bg-gradient-to-br from-gray-500 to-gray-700'
                  }`}>
                    {(selectedOfficer.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 leading-tight">{selectedOfficer.name || 'Unknown'}</h2>
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full mt-1 ${
                      selectedOfficer.type === 'IAS' ? 'bg-blue-100 text-blue-700' : 
                      selectedOfficer.type === 'IPS' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {selectedOfficer.type === 'Other' ? 'Contact' : `${selectedOfficer.type} Officer`}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedOfficer(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              {selectedOfficer.officer_id && (
                <div className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded inline-block">
                  ID: {selectedOfficer.officer_id}
                </div>
              )}
            </div>

            <div className="p-5 space-y-5 flex-1">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Position', value: selectedOfficer.current_position, icon: Briefcase },
                  { label: 'Cadre', value: selectedOfficer.cadre, icon: Shield },
                  { label: 'State', value: selectedOfficer.state, icon: MapPin },
                  { label: 'Batch', value: selectedOfficer.batch_year, icon: GraduationCap },
                ].map((item, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-1.5 text-gray-500 mb-1">
                      <item.icon className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold uppercase">{item.label}</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2">{item.value || 'N/A'}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">All Fields</h3>
                </div>
                
                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {Object.entries(selectedOfficer).map(([key, value]) => {
                    const skipFields = ['collectionId', 'collectionName', 'expand', 'type'];
                    if (skipFields.includes(key)) return null;
                    
                    const formattedValue = formatValue(value);
                    if (formattedValue === 'N/A' && key !== 'id') return null;

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
                onClick={() => setSelectedOfficer(null)}
                className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Officer Panel */}
      <CreateOfficerPanel 
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSuccess={() => {
          loadData(currentPage);
          setIsPanelOpen(false);
        }}
        officerType={panelOfficerType}
      />
    </div>
  );
}