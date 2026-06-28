import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { 
  Users, CheckCircle2, ShieldCheck, MapPin, Calendar, Clock, 
  Eye, Navigation2, Camera, AlertCircle, Sparkles, Plus, 
  Check, FileText, ChevronRight, X, Loader2, ArrowRight, LogOut, Wrench, Phone
} from 'lucide-react';
import { UserProfile, Complaint, ComplaintStatus } from '../types';
import MapComponent from './MapComponent';

interface VolunteerDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export default function VolunteerDashboard({ user, onLogout }: VolunteerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'history' | 'repairs-verification'>('available');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  // Verification report fields
  const [volunteerNotes, setVolunteerNotes] = useState('');
  const [volunteerImages, setVolunteerImages] = useState<string[]>([]);
  const [isGenuine, setIsGenuine] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

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
        setVolunteerImages((prev) => [...prev, ...base64Strings]);
      })
      .catch((err) => console.error('Error reading files:', err))
      .finally(() => setIsUploading(false));
  };

  const removeImage = (index: number) => {
    setVolunteerImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Accept a complaint for physical verification
  const handleAcceptAssignment = async (complaintId: string) => {
    setActionError('');
    setActionSuccess('');
    try {
      const docRef = doc(db, 'complaints', complaintId);
      await updateDoc(docRef, {
        status: 'Volunteer Verification In Progress',
        assignedVolunteerId: user.uid,
        assignedVolunteerName: user.fullName,
      });

      setActionSuccess('Dispatch accepted successfully! Head to Current Assignments to report verification.');
      fetchComplaints();
      
      setTimeout(() => {
        setActiveTab('active');
        setActionSuccess('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setActionError('Could not claim dispatch. Please retry.');
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaintId}`);
    }
  };

  // Submit physical verification report
  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;
    setActionError('');
    setActionSuccess('');

    if (!volunteerNotes.trim()) {
      setActionError('Please provide detailed on-site notes describing physical verification.');
      return;
    }

    setIsSubmitting(true);
    try {
      const docRef = doc(db, 'complaints', selectedComplaint.id);
      await updateDoc(docRef, {
        status: 'Authority Verified', // Forward to authority
        volunteerNotes,
        volunteerImages,
        isGenuine,
        volunteerVerificationDate: new Date().toISOString(),
      });

      setActionSuccess('Physical inspection report uploaded successfully. Forwarded to municipal board.');
      
      // Clear fields
      setVolunteerNotes('');
      setVolunteerImages([]);
      setIsGenuine(true);
      setSelectedComplaint(null);
      
      // Refresh
      fetchComplaints();
      
      setTimeout(() => {
        setActiveTab('history');
        setActionSuccess('');
      }, 2000);
    } catch (err) {
      console.error(err);
      setActionError('Failed to record physical audit report.');
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${selectedComplaint.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm repair work is completed on-site
  const handleConfirmRepairWorkDone = async (complaint: Complaint) => {
    setActionError('');
    setActionSuccess('');
    try {
      const docRef = doc(db, 'complaints', complaint.id);
      const currentUpdates = complaint.repairStatusUpdates || [];
      const newUpdate = {
        date: new Date().toISOString().split('T')[0],
        note: `Volunteer verified on-site completion of repair works. Transmitted to board for final sign-off.`,
        status: 'Work Done - Volunteer Confirmed'
      };
      
      await updateDoc(docRef, {
        status: 'Work Done - Volunteer Confirmed',
        repairStatusUpdates: [...currentUpdates, newUpdate]
      });

      setActionSuccess('Work status updated and transmitted to municipal board successfully!');
      fetchComplaints();
    } catch (err) {
      console.error(err);
      setActionError('Could not update status. Please try again.');
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaint.id}`);
    }
  };

  // Simulated distance calculator between user's sector and issue
  const getSimulatedDistance = (complaintId: string) => {
    // Generate static distance based on character codes to keep consistent across renders
    const code = complaintId.charCodeAt(0) + complaintId.charCodeAt(1) || 5;
    return `${(0.5 + (code % 40) * 0.12).toFixed(1)} km`;
  };

  // Categorize complaints based on volunteer tabs
  const availableDispatches = complaints.filter(c => c.status === 'Reported');
  
  const activeAssignments = complaints.filter(
    c => c.status === 'Volunteer Verification In Progress' && c.assignedVolunteerId === user.uid
  );

  const completedVerifications = complaints.filter(
    c => c.assignedVolunteerId === user.uid && c.status !== 'Volunteer Verification In Progress' && c.status !== 'Repair In Progress'
  );

  const repairsToConfirm = complaints.filter(
    c => c.assignedVolunteerId === user.uid && c.status === 'Repair In Progress'
  );

  const getSeverityBadge = (sev: 'Low' | 'Medium' | 'Critical') => {
    switch (sev) {
      case 'Critical': return 'bg-rose-50 text-rose-700 font-bold border-rose-100';
      case 'Medium': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Low': return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navigation Header */}
      <nav className="bg-slate-900 text-white py-3.5 px-6 shadow-md sticky top-0 z-[1100] border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5">
                COMMUNITY HERO
                <span className="text-[9px] font-bold bg-amber-500 text-slate-900 px-1 rounded uppercase">VOLUNTEER</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">Volunteer Alliance</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold text-slate-100">{user.fullName}</p>
              <p className="text-[10px] text-amber-400 font-semibold">{user.area}, {user.district}</p>
            </div>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 border border-slate-700 hover:border-rose-400 hover:bg-rose-950/30 text-slate-300 hover:text-rose-400 rounded-lg transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl w-full mx-auto px-4 py-6 flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Navigation Rail Left */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center font-bold text-sm">
                {user.fullName.split(' ').map(n=>n[0]).join('').toUpperCase()}
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">{user.fullName}</h4>
                <p className="text-[10px] text-gray-400">Enlisted Inspector Profile</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-gray-500 space-y-1">
              <p><strong>Assigned Sector:</strong> {user.area}</p>
              <p><strong>Jurisdiction:</strong> {user.district}, {user.state}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-left p-2 space-y-1">
            <button
              onClick={() => { setActiveTab('available'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'available'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Clock className="w-4 h-4" />
                Available Dispatches ({availableDispatches.length})
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveTab('active'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Navigation2 className="w-4 h-4 animate-pulse" />
                Current Assignments ({activeAssignments.length})
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveTab('history'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4" />
                Inspection History ({completedVerifications.length})
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveTab('repairs-verification'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'repairs-verification'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Wrench className="w-4 h-4" />
                Active Repairs Support ({repairsToConfirm.length})
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Workstation Right */}
        <div className="lg:col-span-3 space-y-6">
          
          {actionSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl font-bold flex items-center gap-2 text-left">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              {actionSuccess}
            </div>
          )}

          {actionError && (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-xl font-bold text-left">
              {actionError}
            </div>
          )}

          {/* TAB 1: AVAILABLE DISPATCHES */}
          {activeTab === 'available' && !selectedComplaint && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-left space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Nearby Civic Reports</h3>
                <p className="text-xs text-gray-500">Physical verification reports are required before municipal board departments issue repair orders.</p>
              </div>

              {loading ? (
                <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs">Scanning sector dispatches...</span>
                </div>
              ) : availableDispatches.length === 0 ? (
                <div className="py-16 border-2 border-dashed border-gray-100 rounded-xl flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center">
                    <Check className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-800">All local reports verified!</h4>
                    <p className="text-xs text-gray-500 max-w-xs mt-1">There are currently no new citizen complaints filed in your assigned sector.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {availableDispatches.map((item) => (
                    <div 
                      key={item.id} 
                      className="border border-gray-100 hover:border-amber-200 hover:shadow-sm rounded-xl p-4 transition-all bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSeverityBadge(item.severity)}`}>
                            {item.severity} Severity
                          </span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded flex items-center gap-1 font-semibold font-mono">
                            <Navigation2 className="w-2.5 h-2.5 text-blue-500 fill-current" />
                            {getSimulatedDistance(item.id)}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-gray-900 leading-tight">{item.issueType}</h4>
                          <p className="text-[10px] text-gray-400 font-mono">ID: COMP-2026-{(item as any).id?.slice(-6) || 'XXXXXX'}</p>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                        </div>

                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate max-w-lg">{item.landmark || item.address}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                        <button
                          onClick={() => handleAcceptAssignment(item.id)}
                          className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Check className="w-4 h-4" />
                          Claim Dispatch
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CURRENT ACTIVE ASSIGNMENTS */}
          {activeTab === 'active' && !selectedComplaint && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-left space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Your Current Audit Dispatches</h3>
                <p className="text-xs text-gray-500">Travel to the indicated coordinates, inspect, and submit a physical verification report.</p>
              </div>

              {activeAssignments.length === 0 ? (
                <div className="py-16 border-2 border-dashed border-gray-100 rounded-xl flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center">
                    <Navigation2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-800">No active dispatches</h4>
                    <p className="text-xs text-gray-500 max-w-xs mt-1">Claim a civic dispatch in the Nearby tab to perform physical verifications.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeAssignments.map((item) => (
                    <div 
                      key={item.id} 
                      className="border border-gray-100 hover:border-gray-200 hover:shadow-md rounded-xl p-4 transition-all flex flex-col justify-between bg-white"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                            On-Site Audit Active
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSeverityBadge(item.severity)}`}>
                            {item.severity}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-gray-900 leading-tight truncate">{item.issueType}</h4>
                          <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.description}</p>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{item.landmark || item.address}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Claimed: {item.date}</span>
                        <button
                          onClick={() => {
                            setSelectedComplaint(item);
                            setVolunteerNotes('');
                            setVolunteerImages([]);
                            setIsGenuine(true);
                          }}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                        >
                          Execute Audit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ACTIVE DISPATCH INSPECTION EXPANDED WORKSPACE */}
          {activeTab === 'active' && selectedComplaint && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-left space-y-6">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedComplaint(null)}
                  className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to Assignments
                </button>
                <span className="text-[11px] bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full font-bold">
                  Inspection Mode Active
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Details Left */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selectedComplaint.issueType}</h2>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">Reference ID: COMP-2026-{(selectedComplaint as any).id?.slice(-6) || 'XXXXXX'}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                    <h4 className="text-xs font-bold text-gray-700">Citizen Reported Description</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">"{selectedComplaint.description}"</p>
                  </div>

                  {selectedComplaint.landmark && (
                    <div className="text-xs flex gap-1.5">
                      <strong className="text-gray-700 shrink-0">Reported Landmark:</strong>
                      <span className="text-gray-600">{selectedComplaint.landmark}</span>
                    </div>
                  )}

                  <div className="text-xs flex gap-1.5">
                    <strong className="text-gray-700 shrink-0">Official Address:</strong>
                    <span className="text-gray-600">{selectedComplaint.address}</span>
                  </div>

                  {selectedComplaint.images && selectedComplaint.images.length > 0 && (
                    <div>
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

                  {/* Citizen coordinates map (Non-draggable) */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-700 mb-2">Report Coordinates Navigation Map</h4>
                    <MapComponent 
                      lat={selectedComplaint.coordinates.lat} 
                      lng={selectedComplaint.coordinates.lng} 
                      address={selectedComplaint.address} 
                      onChange={() => {}} 
                      draggable={false} 
                    />
                  </div>
                </div>

                {/* Audit Submission Form Right */}
                <form onSubmit={handleSubmitVerification} className="border border-slate-100 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                  <h3 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">On-Site Inspection Report Form</h3>

                  {/* genuine toggle */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700 block">Is this complaint genuine and requiring urgent repair? *</label>
                    <div className="flex gap-2 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setIsGenuine(true)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          isGenuine
                            ? 'bg-emerald-600 text-white border-transparent shadow-sm'
                            : 'bg-white text-gray-600 border-gray-100'
                        }`}
                      >
                        Yes - Genuine civic issue
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsGenuine(false)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          !isGenuine
                            ? 'bg-rose-600 text-white border-transparent shadow-sm'
                            : 'bg-white text-gray-600 border-gray-100'
                        }`}
                      >
                        No - False / spam report
                      </button>
                    </div>
                  </div>

                  {/* On-site notes */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700">Physical Inspection Notes *</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="e.g. Physically verified pothole dimensions: approx 2ft deep, 3ft wide. Water is logged. Poses heavy hazard to two-wheelers during night..."
                      value={volunteerNotes}
                      onChange={(e) => setVolunteerNotes(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-500 bg-white"
                    />
                  </div>

                  {/* Verification photos */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 block">On-Site Verification Photos (Optional)</label>
                    <div className="flex flex-wrap gap-2.5 items-center">
                      <label className="w-16 h-16 border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl flex flex-col items-center justify-center cursor-pointer bg-white transition-colors">
                        <Camera className="w-4 h-4 text-gray-400" />
                        <span className="text-[8px] text-gray-400 font-bold mt-1">Camera</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>

                      {volunteerImages.map((img, idx) => (
                        <div key={idx} className="relative w-16 h-16 border border-gray-100 rounded-xl overflow-hidden shadow-sm shrink-0">
                          <img src={img} alt="volunteer-evidence" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute top-1 right-1 bg-gray-900/80 text-white rounded-full p-0.5 hover:bg-rose-600 cursor-pointer"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}

                      {isUploading && (
                        <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center border border-gray-100">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading Inspection Audit...
                      </>
                    ) : (
                      <>
                        Submit Verification Report
                        <Check className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

              </div>
            </div>
          )}

          {/* TAB 3: VERIFICATION HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-left space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Your Verification History</h3>
                <p className="text-xs text-gray-500">List of physical civic inspections completed and submitted to the municipal board.</p>
              </div>

              {completedVerifications.length === 0 ? (
                <p className="text-xs text-gray-400">You have not completed any inspections yet.</p>
              ) : (
                <div className="space-y-4">
                  {completedVerifications.map((item) => (
                    <div key={item.id} className="p-4 border border-gray-50 rounded-xl bg-slate-50/50 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                            item.isGenuine ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
                          }`}>
                            {item.isGenuine ? 'Genuine Report' : 'Spam Report'}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400">Inspected on: {item.volunteerVerificationDate ? new Date(item.volunteerVerificationDate).toLocaleDateString() : item.date}</span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-gray-900 leading-tight">{item.issueType}</h4>
                        <p className="text-xs text-gray-600 mt-1.5 italic">" {item.volunteerNotes} "</p>
                        <p className="text-[10px] text-gray-400 mt-2">Complaint Status: <span className="font-semibold text-blue-600">{item.status}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ACTIVE REPAIRS SUPPORT / SIGN-OFFS */}
          {activeTab === 'repairs-verification' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-left space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Active Repairs Verification</h3>
                <p className="text-xs text-gray-500">Track and coordinate with repair crews working on dispatches you verified. Once the crew confirms work is complete, verify the work and update the municipal board.</p>
              </div>

              {repairsToConfirm.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-gray-200">
                  <Wrench className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No active repair dispatches assigned under your physical tracking sector.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {repairsToConfirm.map((item) => (
                    <div key={item.id} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/30 space-y-4">
                      <div className="flex justify-between items-start flex-wrap gap-2">
                        <div>
                          <span className="text-[10px] font-black tracking-wider uppercase bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">
                            {item.status}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">Reference ID: COMP-{(item.id || '').slice(-6).toUpperCase()}</span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-gray-900 leading-snug">{item.issueType}</h4>
                        <p className="text-xs text-gray-500 mt-1">{item.address}</p>
                        {item.landmark && <p className="text-xs text-slate-400">Landmark: {item.landmark}</p>}
                      </div>

                      {/* Workers & Contact Details Card */}
                      <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="text-xs text-slate-700">
                            <p><strong>Assigned Crew:</strong> {item.assignedWorkers || 'Pending assign'}</p>
                            <p className="mt-0.5"><strong>Department:</strong> {item.assignedDepartment || 'N/A'}</p>
                            {item.assignedWorkersPhone && (
                              <p className="mt-0.5"><strong>Contact:</strong> {item.assignedWorkersPhone}</p>
                            )}
                            <p className="mt-0.5"><strong>Target Date:</strong> {item.expectedCompletionDate || 'Not Scheduled'}</p>
                          </div>
                          {item.assignedWorkersPhone && (
                            <a
                              href={`tel:${item.assignedWorkersPhone}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                            >
                              <Phone className="w-3.5 h-3.5" /> Call Repairer
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Interactive Button to sign off */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-4">
                        <p className="text-[11px] text-slate-500 max-w-md">
                          <strong>Action required:</strong> Coordinate with the repair crew listed above. Once they report complete, inspect on-site and transmit your sign-off to the municipal board.
                        </p>
                        <button
                          onClick={() => handleConfirmRepairWorkDone(item)}
                          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-extrabold shadow-sm transition-all shrink-0 cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Confirm Work Completed
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
