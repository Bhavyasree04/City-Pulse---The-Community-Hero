import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, doc, updateDoc } from 'firebase/firestore';
import { 
  Building2, ShieldAlert, CheckCircle, BarChart3, Users, 
  MapPin, Calendar, Clock, AlertTriangle, Eye, ArrowRight,
  Filter, Search, Check, X, ClipboardCheck, Briefcase, 
  Wrench, Upload, Camera, FileText, Loader2, RefreshCw, ChevronRight, Phone
} from 'lucide-react';
import { UserProfile, Complaint, ComplaintStatus } from '../types';
import MapComponent from './MapComponent';

interface AuthorityDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export default function AuthorityDashboard({ user, onLogout }: AuthorityDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'new-complaints' | 'assign' | 'repairs' | 'resolved'>('overview');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  // Filters state
  const [filterId, setFilterId] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [filterArea, setFilterArea] = useState('All');

  // Authority actions state
  const [rejectionReason, setRejectionReason] = useState('');
  const [assignedDepartment, setAssignedDepartment] = useState('Roads & Highways Department');
  const [assignedWorkers, setAssignedWorkers] = useState('');
  const [assignedWorkersPhone, setAssignedWorkersPhone] = useState('');
  const [expectedCompletionDate, setExpectedCompletionDate] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionImages, setCompletionImages] = useState<string[]>([]);
  
  // Repair updates
  const [repairNote, setRepairNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'complaints'));
      const querySnapshot = await getDocs(q);
      const list: Complaint[] = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Complaint);
      });
      setComplaints(list);
    } catch (err) {
      console.error('Error fetching complaints:', err);
      handleFirestoreError(err, OperationType.LIST, 'complaints');
    } finally {
      setLoading(false);
    }
  };

  // Convert uploaded files to base64 images
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setIsUploading(true);
    const files = Array.from(e.target.files);

    const promises = files.map((file) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file as Blob);
      });
    });

    Promise.all(promises)
      .then((base64Strings) => {
        setCompletionImages((prev) => [...prev, ...base64Strings]);
      })
      .catch((err) => console.error('Error reading files:', err))
      .finally(() => setIsUploading(false));
  };

  const removeImage = (index: number) => {
    setCompletionImages((prev) => prev.filter((_, i) => i !== index));
  };

  // 1. APPROVE COMPLAINT (Forward to worker assignment)
  const handleApproveComplaint = async (complaintId: string) => {
    setActionError('');
    setActionSuccess('');
    try {
      const docRef = doc(db, 'complaints', complaintId);
      await updateDoc(docRef, {
        status: 'Authority Verified',
        authorityApprovalDate: new Date().toISOString(),
      });
      setActionSuccess('Complaint approved successfully! Now allocate department resources.');
      fetchComplaints();
      setTimeout(() => {
        setActiveSubTab('assign');
        setActionSuccess('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setActionError('Failed to approve complaint.');
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaintId}`);
    }
  };

  // 2. REJECT COMPLAINT with reason
  const handleRejectComplaint = async (complaintId: string) => {
    setActionError('');
    setActionSuccess('');
    if (!rejectionReason.trim()) {
      setActionError('Please specify a formal rejection reason.');
      return;
    }

    try {
      const docRef = doc(db, 'complaints', complaintId);
      await updateDoc(docRef, {
        status: 'Rejected',
        rejectionReason,
      });
      setActionSuccess('Complaint marked as rejected. Citizen has been notified.');
      setRejectionReason('');
      setSelectedComplaint(null);
      fetchComplaints();
    } catch (err) {
      console.error(err);
      setActionError('Failed to record rejection.');
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaintId}`);
    }
  };

  // 3. ASSIGN DEPARTMENT & WORKERS
  const handleAssignWorkers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;
    setActionError('');
    setActionSuccess('');

    if (!assignedWorkers.trim() || !expectedCompletionDate) {
      setActionError('Please designate a repair crew and expected target completion date.');
      return;
    }

    try {
      const docRef = doc(db, 'complaints', selectedComplaint.id);
      await updateDoc(docRef, {
        status: 'Repair In Progress',
        assignedDepartment,
        assignedWorkers,
        assignedWorkersPhone: assignedWorkersPhone || '',
        expectedCompletionDate,
        repairStatusUpdates: [
          {
            date: new Date().toISOString().split('T')[0],
            note: `Municipal crew dispatched and scheduled to begin repair works. Contact: ${assignedWorkersPhone || 'N/A'}.`,
            status: 'Work Crew Assigned'
          }
        ]
      });

      setActionSuccess('Resource dispatch complete! Repair crew scheduled.');
      setAssignedWorkers('');
      setAssignedWorkersPhone('');
      setExpectedCompletionDate('');
      setSelectedComplaint(null);
      fetchComplaints();
      setTimeout(() => {
        setActiveSubTab('repairs');
        setActionSuccess('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setActionError('Failed to allocate resources.');
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${selectedComplaint.id}`);
    }
  };

  // 4. ADD REPAIR WORK UPDATE
  const handleAddRepairUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint || !repairNote.trim()) return;
    setActionError('');
    setActionSuccess('');

    try {
      const currentUpdates = selectedComplaint.repairStatusUpdates || [];
      const updatedList = [
        ...currentUpdates,
        {
          date: new Date().toISOString().split('T')[0],
          note: repairNote,
          status: 'Repair Progress Logged'
        }
      ];

      const docRef = doc(db, 'complaints', selectedComplaint.id);
      await updateDoc(docRef, {
        repairStatusUpdates: updatedList
      });

      setActionSuccess('On-site progress update recorded.');
      setRepairNote('');
      fetchComplaints();
      // Update selected reference locally
      setSelectedComplaint({
        ...selectedComplaint,
        repairStatusUpdates: updatedList
      });
    } catch (err) {
      console.error(err);
      setActionError('Failed to record repair log.');
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${selectedComplaint.id}`);
    }
  };

  // 5. RESOLVE COMPLAINT
  const handleResolveComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;
    setActionError('');
    setActionSuccess('');

    if (!completionNotes.trim()) {
      setActionError('Please provide administrative sign-off completion notes.');
      return;
    }

    try {
      const docRef = doc(db, 'complaints', selectedComplaint.id);
      await updateDoc(docRef, {
        status: 'Resolved',
        completionNotes,
        completionImages,
        resolvedAt: new Date().toISOString()
      });

      setActionSuccess('Civic issue marked as Resolved! Citizen and volunteers notified.');
      setCompletionNotes('');
      setCompletionImages([]);
      setSelectedComplaint(null);
      fetchComplaints();
      setTimeout(() => {
        setActiveSubTab('overview');
        setActionSuccess('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setActionError('Failed to mark complaint as Resolved.');
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${selectedComplaint.id}`);
    }
  };

  // FILTER JURISDICTION CHECK (Only show complaints matching administrative location)
  // Let's filter complaints where the Address contains the authority's District/City
  const matchedComplaintsByJurisdiction = complaints.filter(c => {
    if (!user.district) return true;
    const districtLower = user.district.toLowerCase();
    const areaLower = user.area ? user.area.toLowerCase() : '';
    const addressLower = c.address.toLowerCase();
    const landmarkLower = c.landmark ? c.landmark.toLowerCase() : '';

    return addressLower.includes(districtLower) || landmarkLower.includes(districtLower) || addressLower.includes(areaLower);
  });

  // Apply visual search/filter tools
  const filteredList = matchedComplaintsByJurisdiction.filter(item => {
    const idMatch = filterId === '' || item.id.toLowerCase().includes(filterId.toLowerCase());
    const catMatch = filterCategory === 'All' || item.issueType === filterCategory;
    const statMatch = filterStatus === 'All' || item.status === filterStatus;
    const sevMatch = filterSeverity === 'All' || item.severity === filterSeverity;
    const areaMatch = filterArea === 'All' || item.address.toLowerCase().includes(filterArea.toLowerCase());

    return idMatch && catMatch && statMatch && sevMatch && areaMatch;
  });

  // METRICS CALCULATIONS
  const totalInWard = matchedComplaintsByJurisdiction.length;
  const pendingCount = matchedComplaintsByJurisdiction.filter(c => c.status === 'Reported').length;
  const underVerificationCount = matchedComplaintsByJurisdiction.filter(c => c.status === 'Volunteer Verification In Progress').length;
  const repairCount = matchedComplaintsByJurisdiction.filter(c => c.status === 'Repair In Progress' || c.status === 'Authority Verified').length;
  const resolvedCount = matchedComplaintsByJurisdiction.filter(c => c.status === 'Resolved').length;
  const criticalCount = matchedComplaintsByJurisdiction.filter(c => c.severity === 'Critical' && c.status !== 'Resolved' && c.status !== 'Rejected').length;

  const getStatusStyle = (status: ComplaintStatus) => {
    switch (status) {
      case 'Reported': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Volunteer Verification In Progress': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Authority Verified': return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Repair In Progress': return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'Resolved': return 'bg-emerald-50 text-emerald-800 border-emerald-100';
      case 'Rejected': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  };

  const getSeverityStyle = (sev: 'Low' | 'Medium' | 'Critical') => {
    switch (sev) {
      case 'Critical': return 'bg-rose-50 text-rose-700 border-rose-100 font-bold';
      case 'Medium': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Low': return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  // Group unique categories/areas for filter lists
  const uniqueCategories = Array.from(new Set(matchedComplaintsByJurisdiction.map(c => c.issueType)));
  const uniqueAreas = Array.from(new Set(matchedComplaintsByJurisdiction.map(c => c.landmark || 'Others')));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navigation Header */}
      <nav className="bg-slate-900 text-white py-3.5 px-6 shadow-md sticky top-0 z-[1100] border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-extrabold tracking-tight flex items-center gap-1.5">
                COMMUNITY HERO
                <span className="text-[9px] font-bold bg-indigo-500 text-white px-1 rounded uppercase">BOARD</span>
              </h1>
              <p className="text-[9px] text-slate-400 font-mono tracking-wider uppercase">Municipal Authority Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold text-slate-100">{user.fullName}</p>
              <p className="text-[10px] text-indigo-400 font-semibold uppercase">{user.district} Ward Division</p>
            </div>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 border border-slate-700 hover:border-rose-400 hover:bg-rose-950/30 text-slate-300 hover:text-rose-400 rounded-lg transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Ward Status Bar Header */}
      <div className="bg-white border-b border-slate-200 py-3 px-6 shadow-sm text-left text-xs font-medium text-gray-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-800">
            <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Assigned Jurisdiction: <strong>{user.country} → {user.state} → {user.district} → {user.area || 'All Sectors'}</strong></span>
          </div>
          <button 
            onClick={fetchComplaints}
            className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-slate-100 cursor-pointer w-fit"
          >
            <RefreshCw className="w-3 h-3 text-gray-500" /> Refresh DB Registry
          </button>
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto px-4 py-6 flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Sidebar Menu Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-left p-2 space-y-1">
            <button
              onClick={() => { setActiveSubTab('overview'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeSubTab === 'overview'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4" />
                Administrative Summary
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveSubTab('new-complaints'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeSubTab === 'new-complaints'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ClipboardCheck className="w-4 h-4" />
                Review Volunteer Reports ({underVerificationCount + pendingCount})
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveSubTab('assign'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeSubTab === 'assign'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Briefcase className="w-4 h-4" />
                Assign Resource Teams ({matchedComplaintsByJurisdiction.filter(c=>c.status === 'Authority Verified').length})
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveSubTab('repairs'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeSubTab === 'repairs'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Wrench className="w-4 h-4" />
                Repairs In Progress ({matchedComplaintsByJurisdiction.filter(c=>c.status === 'Repair In Progress').length})
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Console Workspace Right */}
        <div className="lg:col-span-3 space-y-6">

          {actionSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl font-bold flex items-center gap-2 text-left">
              <CheckCircle className="w-5 h-5 text-emerald-600 animate-bounce" />
              {actionSuccess}
            </div>
          )}

          {actionError && (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-xl font-bold text-left">
              {actionError}
            </div>
          )}

          {/* TAB 1: ADMINISTRATIVE OVERVIEW */}
          {activeSubTab === 'overview' && !selectedComplaint && (
            <div className="space-y-6 text-left">
              
              {/* Analytics HUD Cards Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Filed</span>
                  <span className="text-2xl font-black text-gray-900 block mt-1">{totalInWard}</span>
                  <span className="text-[10px] text-gray-400 block mt-1">Under Ward jurisdiction</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block">New Complaints</span>
                  <span className="text-2xl font-black text-blue-600 block mt-1">{pendingCount}</span>
                  <span className="text-[10px] text-blue-400 block mt-1">Awaiting verification</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">In Verification</span>
                  <span className="text-2xl font-black text-amber-600 block mt-1">{underVerificationCount}</span>
                  <span className="text-[10px] text-amber-400 block mt-1">Volunteer assigned</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider block">Repairs Active</span>
                  <span className="text-2xl font-black text-orange-600 block mt-1">{repairCount}</span>
                  <span className="text-[10px] text-orange-400 block mt-1">Workers allocated</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block">Resolved Cases</span>
                  <span className="text-2xl font-black text-emerald-600 block mt-1">{resolvedCount}</span>
                  <span className="text-[10px] text-emerald-400 block mt-1">Archived resolutions</span>
                </div>

                <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 shadow-sm">
                  <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500 fill-current animate-pulse" /> Critical
                  </span>
                  <span className="text-2xl font-black text-rose-700 block mt-1">{criticalCount}</span>
                  <span className="text-[10px] text-rose-500 block mt-1">Immediate dispatch target</span>
                </div>
              </div>

              {/* Graphical representation (Custom premium SVG bars) */}
              <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Complaint Status Distribution</h4>
                  <p className="text-[11px] text-gray-400">Relative allocation ratios across pipeline segments.</p>
                </div>

                <div className="space-y-3 pt-2">
                  {[
                    { label: 'New Filed', count: pendingCount, color: 'bg-blue-500' },
                    { label: 'Under Verification', count: underVerificationCount, color: 'bg-amber-500' },
                    { label: 'Repairs Active', count: repairCount, color: 'bg-orange-500' },
                    { label: 'Resolved Cases', count: resolvedCount, color: 'bg-emerald-500' },
                  ].map((bar, idx) => {
                    const percentage = totalInWard > 0 ? (bar.count / totalInWard) * 100 : 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-gray-700">
                          <span>{bar.label}</span>
                          <span>{bar.count} ({percentage.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className={`${bar.color} h-full rounded-full transition-all duration-1000`} 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SEARCH & FILTER MODULE */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span>Advanced Directory Filtering Controls</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Complaint ID / Search</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Search IDs, citizens..." 
                        value={filterId} 
                        onChange={(e)=>setFilterId(e.target.value)}
                        className="w-full text-xs bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 pl-8 outline-none focus:border-slate-800 focus:bg-white text-gray-800"
                      />
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Severity Category</label>
                    <select
                      value={filterSeverity}
                      onChange={(e)=>setFilterSeverity(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-slate-800 focus:bg-white text-gray-800"
                    >
                      <option value="All">All Severities</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pipeline Status</label>
                    <select
                      value={filterStatus}
                      onChange={(e)=>setFilterStatus(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-slate-800 focus:bg-white text-gray-800"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Reported">Reported (New)</option>
                      <option value="Volunteer Verification In Progress">Under Verification</option>
                      <option value="Authority Verified">Authority Verified</option>
                      <option value="Repair In Progress">Repair In Progress</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Issue Category</label>
                    <select
                      value={filterCategory}
                      onChange={(e)=>setFilterCategory(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-slate-800 focus:bg-white text-gray-800"
                    >
                      <option value="All">All Categories</option>
                      {uniqueCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* DATA TABLE */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Jurisdiction Master Directory</h4>
                  <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-mono font-bold">Showing {filteredList.length} records</span>
                </div>

                {loading ? (
                  <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
                    <span className="text-xs">Loading case data tables...</span>
                  </div>
                ) : filteredList.length === 0 ? (
                  <div className="py-20 text-center text-xs text-gray-400">No matching civic complaint records found under your search parameters.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-600 border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-gray-150 text-slate-700 uppercase text-[9px] font-black">
                          <th className="px-6 py-3">Case ID</th>
                          <th className="px-6 py-3">Issue Category</th>
                          <th className="px-6 py-3">Jurisdiction Area</th>
                          <th className="px-6 py-3">Severity</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3">Date Filed</th>
                          <th className="px-6 py-3 text-right">Audit Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredList.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-mono text-gray-900 font-bold">COMP-2026-{(item as any).id?.slice(-6) || 'XXXXXX'}</td>
                            <td className="px-6 py-4 font-semibold text-slate-800">{item.issueType}</td>
                            <td className="px-6 py-4 truncate max-w-[200px]">{item.landmark || item.address}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded border text-[10px] ${getSeverityStyle(item.severity)}`}>
                                {item.severity}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded border text-[9px] uppercase font-bold tracking-wider ${getStatusStyle(item.status)}`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-400 font-mono text-[10px]">{item.date}</td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => setSelectedComplaint(item)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5 ml-auto cursor-pointer"
                              >
                                Examine <Eye className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EXPANDED DETAILED CASE EXAMINER AND ACTION DESK */}
          {selectedComplaint && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-left space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <button
                  onClick={() => setSelectedComplaint(null)}
                  className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to Summary
                </button>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${getStatusStyle(selectedComplaint.status)}`}>
                    Status: {selectedComplaint.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Details Left */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selectedComplaint.issueType}</h2>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">Reference ID: COMP-2026-{(selectedComplaint as any).id?.slice(-6) || 'XXXXXX'}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                    <h4 className="text-xs font-bold text-gray-700">Detailed Citizen Description</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">"{selectedComplaint.description}"</p>
                  </div>

                  {selectedComplaint.landmark && (
                    <div className="text-xs flex gap-1.5">
                      <strong className="text-gray-700 shrink-0 font-bold">Reported Landmark:</strong>
                      <span className="text-gray-600">{selectedComplaint.landmark}</span>
                    </div>
                  )}

                  <div className="text-xs flex gap-1.5">
                    <strong className="text-gray-700 shrink-0 font-bold">Official Address:</strong>
                    <span className="text-gray-600">{selectedComplaint.address}</span>
                  </div>

                  {/* Citizen coordinates map (Non-draggable) */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-700 mb-2">Issue Geographical Coordinates</h4>
                    <MapComponent 
                      lat={selectedComplaint.coordinates.lat} 
                      lng={selectedComplaint.coordinates.lng} 
                      address={selectedComplaint.address} 
                      onChange={() => {}} 
                      draggable={false} 
                    />
                  </div>
                </div>

                {/* Audit Actions Forms Right */}
                <div className="space-y-4">
                  
                  {/* Citizen photo uploads */}
                  {selectedComplaint.images && selectedComplaint.images.length > 0 && (
                    <div className="p-4 border border-gray-100 rounded-xl">
                      <h4 className="text-xs font-bold text-gray-700 mb-2">Citizen Uploaded Evidence</h4>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {selectedComplaint.images.map((img, idx) => (
                          <img 
                            key={idx} 
                            src={img} 
                            alt={`citizen-evidence-${idx}`} 
                            referrerPolicy="no-referrer"
                            className="w-20 h-20 object-cover rounded-lg border border-gray-100 shadow-sm shrink-0" 
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Volunteer verification reporting notes */}
                  {selectedComplaint.volunteerNotes && (
                    <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl space-y-2">
                      <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Volunteer Physical Verification Log
                      </h4>
                      <div className="text-xs text-slate-700">
                        <p><strong>Inspected by Volunteer:</strong> {selectedComplaint.assignedVolunteerName || 'Authorized Alliance'}</p>
                        <p><strong>Physical Audit Verdict:</strong> <span className={`font-bold ${selectedComplaint.isGenuine ? 'text-emerald-700' : 'text-rose-700'}`}>{selectedComplaint.isGenuine ? 'Verified Genuine' : 'Spam/Duplicate'}</span></p>
                        <p className="mt-2 text-slate-800 italic">" {selectedComplaint.volunteerNotes} "</p>
                      </div>

                      {selectedComplaint.volunteerImages && selectedComplaint.volunteerImages.length > 0 && (
                        <div className="pt-2">
                          <h5 className="text-[10px] font-bold text-gray-500 mb-1">On-Site Inspector Photos:</h5>
                          <div className="flex gap-1.5 overflow-x-auto">
                            {selectedComplaint.volunteerImages.map((img, idx) => (
                              <img key={idx} src={img} alt="volunteer" className="w-16 h-16 object-cover rounded border" referrerPolicy="no-referrer" />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assigned Repair Crew Details and Contact */}
                  {selectedComplaint.assignedWorkers && (
                    <div className="p-4 bg-sky-50/50 border border-sky-100 rounded-xl space-y-2">
                      <h4 className="text-xs font-bold text-sky-800 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5" />
                        Assigned Repair Crew & Worker Details
                      </h4>
                      <div className="text-xs text-slate-700 space-y-1">
                        <p><strong>Department:</strong> {selectedComplaint.assignedDepartment || 'N/A'}</p>
                        <p><strong>Crew Name / Primary Worker:</strong> {selectedComplaint.assignedWorkers}</p>
                        {selectedComplaint.assignedWorkersPhone && (
                          <p><strong>Contact Info:</strong> {selectedComplaint.assignedWorkersPhone}</p>
                        )}
                        <p><strong>Target Completion Date:</strong> {selectedComplaint.expectedCompletionDate || 'N/A'}</p>
                      </div>
                      {selectedComplaint.assignedWorkersPhone && (
                        <div className="pt-2">
                          <a
                            href={`tel:${selectedComplaint.assignedWorkersPhone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                          >
                            <Phone className="w-3 h-3 animate-bounce" /> Contact Repairer
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 1. STAGE: COMPLAINT IS NEWLY FILED OR AWAITING APPROVAL */}
                  {(selectedComplaint.status === 'Reported' || selectedComplaint.status === 'Volunteer Verification In Progress') && (
                    <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                      <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Administrative Triage & Board Audit</h3>
                      <p className="text-[11px] text-gray-400">Examine details, check volunteer audit logs, and choose to approve or reject the complaint.</p>
                      
                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => handleApproveComplaint(selectedComplaint.id)}
                          className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 uppercase"
                        >
                          <Check className="w-4 h-4" /> Approve Complaint
                        </button>
                      </div>

                      <div className="border-t border-gray-100 pt-4 space-y-2">
                        <label className="text-[10px] font-bold text-gray-600">Rejection Justification Note</label>
                        <textarea
                          rows={2}
                          placeholder="Provide details if rejecting, e.g. This is a duplicate of COMP-2026-00125. Issue already resolved by parks dept..."
                          value={rejectionReason}
                          onChange={(e)=>setRejectionReason(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleRejectComplaint(selectedComplaint.id)}
                          className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition-all cursor-pointer uppercase text-center"
                        >
                          Reject with Reason
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. STAGE: APPROVED, AWAITING DEPARTMENT ALLOCATION */}
                  {selectedComplaint.status === 'Authority Verified' && (
                    <form onSubmit={handleAssignWorkers} className="border border-slate-100 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                      <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Resource Allocation & Work Order dispatch</h3>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">Designated Municipal Department *</label>
                        <select
                          value={assignedDepartment}
                          onChange={(e)=>setAssignedDepartment(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                        >
                          <option value="Roads & Highways Department">Roads & Highways Department</option>
                          <option value="Electricity & Power Board">Electricity & Power Board</option>
                          <option value="Water Supply & Sewerage Board">Water Supply & Sewerage Board</option>
                          <option value="Sanitation & Waste Management">Sanitation & Waste Management</option>
                          <option value="Traffic Police Division">Traffic Police Division</option>
                          <option value="Horticulture & Parks division">Horticulture & Parks division</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">Designate Repair Crew/Workers *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Ward 4 Asphalt Crew (S. Deshmukh + 3 workers)"
                          value={assignedWorkers}
                          onChange={(e)=>setAssignedWorkers(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">Repair Crew Contact Number (Mobile/Phone) *</label>
                        <input
                          type="tel"
                          required
                          placeholder="e.g. +91 98765 43210"
                          value={assignedWorkersPhone}
                          onChange={(e)=>setAssignedWorkersPhone(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">Target Completion Date *</label>
                        <input
                          type="date"
                          required
                          value={expectedCompletionDate}
                          onChange={(e)=>setExpectedCompletionDate(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer uppercase flex items-center justify-center gap-1"
                      >
                        <Wrench className="w-4 h-4" /> Dispatch Crew & Begin repair
                      </button>
                    </form>
                  )}

                  {/* 3. STAGE: REPAIR IN PROGRESS */}
                  {selectedComplaint.status === 'Repair In Progress' && (
                    <div className="space-y-4">
                      
                      {/* Live repair status tracker */}
                      <form onSubmit={handleAddRepairUpdate} className="border border-slate-100 rounded-2xl p-5 bg-slate-50/50 space-y-3">
                        <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Log Repairs On-Site Progress</h3>
                        
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-700">Progress Update Note</label>
                          <textarea
                            rows={2}
                            required
                            placeholder="e.g. Surface scraping complete, laying hot-mix asphalt layers currently..."
                            value={repairNote}
                            onChange={(e)=>setRepairNote(e.target.value)}
                            className="w-full text-xs px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                          />
                        </div>

                        <button
                          type="submit"
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg cursor-pointer"
                        >
                          Log Progress Note
                        </button>
                      </form>

                      {/* Administrative Resolution Form */}
                      <form onSubmit={handleResolveComplaint} className="border border-emerald-100 rounded-2xl p-5 bg-emerald-50/20 space-y-4">
                        <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wider">Final Resolution Sign-off</h3>
                        <p className="text-[11px] text-emerald-800">Complete repair works, document with photographic evidence, and sign off to close the case.</p>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-emerald-900">Administrative Sign-Off Notes *</label>
                          <textarea
                            rows={3}
                            required
                            placeholder="e.g. Roads dept successfully sealed pothole, certified by Ward Engineer. Road restored to traffic..."
                            value={completionNotes}
                            onChange={(e)=>setCompletionNotes(e.target.value)}
                            className="w-full text-xs px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-emerald-900 block">Resolution Evidence Photos</label>
                          <div className="flex flex-wrap gap-2 items-center">
                            <label className="w-14 h-14 border border-dashed border-emerald-300 hover:border-emerald-500 rounded-lg flex flex-col items-center justify-center cursor-pointer bg-white">
                              <Camera className="w-4 h-4 text-emerald-600" />
                              <span className="text-[8px] text-emerald-600 font-bold mt-1">Upload</span>
                              <input
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>

                            {completionImages.map((img, idx) => (
                              <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border">
                                <img src={img} alt="completion" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                <button
                                  type="button"
                                  onClick={()=>removeImage(idx)}
                                  className="absolute top-0.5 right-0.5 bg-gray-900/80 text-white rounded-full p-0.5"
                                >
                                  <X className="w-2 h-2" />
                                </button>
                              </div>
                            ))}

                            {isUploading && (
                              <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center border">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer uppercase tracking-wider"
                        >
                          Mark as Resolved & Archive
                        </button>
                      </form>

                    </div>
                  )}

                  {/* 4. RECENT HISTORY OF REPAIR LOGS FOR REFERENCE */}
                  {selectedComplaint.repairStatusUpdates && selectedComplaint.repairStatusUpdates.length > 0 && (
                    <div className="p-4 border border-slate-100 rounded-xl space-y-2">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider pb-1 border-b">Active Repair Crew Logs</h4>
                      <div className="space-y-3 max-h-40 overflow-y-auto">
                        {selectedComplaint.repairStatusUpdates.map((log, idx) => (
                          <div key={idx} className="text-xs border-l-2 border-orange-500 pl-2.5 py-0.5">
                            <p className="font-bold text-gray-800">{log.status} <span className="font-mono text-[10px] text-gray-400 font-medium">- {log.date}</span></p>
                            <p className="text-gray-500 italic mt-0.5">"{log.note}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* IF CASE ALREADY RESOLVED */}
                  {selectedComplaint.status === 'Resolved' && (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2 text-xs">
                      <h4 className="text-xs font-bold text-emerald-800">Resolution Sign-Off Details</h4>
                      <p><strong>Sign-off Date:</strong> {selectedComplaint.resolvedAt ? new Date(selectedComplaint.resolvedAt).toLocaleString() : 'Archived'}</p>
                      <p><strong>Close-out Notes:</strong> <span className="font-medium italic text-emerald-900">"{selectedComplaint.completionNotes}"</span></p>
                      
                      {selectedComplaint.completionImages && selectedComplaint.completionImages.length > 0 && (
                        <div className="pt-2">
                          <h5 className="font-bold text-gray-500 mb-1">Signed-off Repair Proofs:</h5>
                          <div className="flex gap-2">
                            {selectedComplaint.completionImages.map((img, idx) => (
                              <img key={idx} src={img} alt="resolution" className="w-16 h-16 object-cover rounded border" referrerPolicy="no-referrer" />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* IF CASE REJECTED */}
                  {selectedComplaint.status === 'Rejected' && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl space-y-1 text-xs">
                      <h4 className="text-xs font-bold text-rose-800">Case Rejection Record</h4>
                      <p className="text-rose-900"><strong>Justification:</strong> "{selectedComplaint.rejectionReason}"</p>
                    </div>
                  )}

                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
