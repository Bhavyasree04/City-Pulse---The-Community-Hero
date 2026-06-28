import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs, orderBy, doc, updateDoc } from 'firebase/firestore';
import { 
  FileText, Plus, List, MessageSquare, HelpCircle, LogOut, MapPin, 
  AlertTriangle, CheckCircle, Clock, Search, ChevronRight, X, 
  Sparkles, Camera, ArrowRight, Phone, Mail, FileCheck, ShieldAlert, Loader2,
  ThumbsUp, Bell, Wrench
} from 'lucide-react';
import { UserProfile, Complaint, ComplaintStatus, FeedbackSubmission } from '../types';
import MapComponent from './MapComponent';

interface CitizenDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

const ISSUE_CATEGORIES = [
  "Pothole", "Damaged Road", "Broken Streetlight", "Water Leakage", 
  "Sewage Overflow", "Drainage Blockage", "Garbage Dumping", "Construction Waste", 
  "Fallen Tree", "Electrical Hazard", "Illegal Parking", "Traffic Signal Issue", 
  "Missing Zebra Crossing", "Road Accident Hazard", "Stray Animal Problem", 
  "Public Property Damage", "Flooded Area", "Open Manhole", "Damaged Footpath", 
  "Unsafe Construction Site", "Broken Traffic Divider", "Damaged Bus Stop", 
  "Damaged Electric Pole", "Park Maintenance Issue", "Illegal Dumping", 
  "Dangerous Tree Branch", "Damaged Water Pipeline", "Damaged Public Bench", 
  "Others"
];

const TIMELINE_STEPS: ComplaintStatus[] = [
  'Reported',
  'Volunteer Verification In Progress',
  'Authority Verified',
  'Repair In Progress',
  'Resolved'
];

export default function CitizenDashboard({ user, onLogout }: CitizenDashboardProps) {
  const [activeTab, setActiveTab] = useState<'report' | 'my-complaints' | 'neighborhood-alerts' | 'feedback' | 'help'>('my-complaints');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [allNeighborhoodComplaints, setAllNeighborhoodComplaints] = useState<Complaint[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackSubmission[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(false);
  const [loadingNeighborhood, setLoadingNeighborhood] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  // --- REPORT FORM STATE ---
  const [issueType, setIssueType] = useState(ISSUE_CATEGORIES[0]);
  const [customIssueType, setCustomIssueType] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'Critical'>('Medium');
  const [aiSeverity, setAiSeverity] = useState<'Low' | 'Medium' | 'Critical' | ''>('');
  const [aiSummary, setAiSummary] = useState('');
  const [recommendedDept, setRecommendedDept] = useState('');
  const [analyzingDescription, setAnalyzingDescription] = useState(false);
  
  // Maps & Location
  const [lat, setLat] = useState(19.1136); // Default Andheri, Mumbai coords
  const [lng, setLng] = useState(72.8697);
  const [address, setAddress] = useState('Andheri, Mumbai, Maharashtra, India');
  const [landmark, setLandmark] = useState('');

  // Image Uploads (Base64 list for Firestore resilience)
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState('');
  const [submissionError, setSubmissionError] = useState('');

  // --- FEEDBACK FORM STATE ---
  const [feedbackType, setFeedbackType] = useState<'Feedback' | 'Suggestion' | 'Appreciation'>('Feedback');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState('');

  // Initialize: Load user complaints & feedback history
  useEffect(() => {
    fetchComplaints();
    fetchNeighborhoodComplaints();
    fetchFeedbacks();
    
    // Auto-request GPS position to configure initial map location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      }, null, { timeout: 4000 });
    }
  }, []);

  const fetchComplaints = async () => {
    if (!auth.currentUser) return;
    setLoadingComplaints(true);
    try {
      const q = query(
        collection(db, 'complaints'),
        where('citizenUid', '==', user.uid)
      );
      const querySnapshot = await getDocs(q);
      const list: Complaint[] = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Complaint);
      });
      // Sort client-side by date/time (most recent first)
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setComplaints(list);
    } catch (err) {
      console.error('Error fetching complaints:', err);
      handleFirestoreError(err, OperationType.LIST, 'complaints');
    } finally {
      setLoadingComplaints(false);
    }
  };

  const fetchNeighborhoodComplaints = async () => {
    setLoadingNeighborhood(true);
    try {
      const q = query(collection(db, 'complaints'));
      const querySnapshot = await getDocs(q);
      const list: Complaint[] = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Complaint);
      });
      // Sort client-side by date/time (most recent first)
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllNeighborhoodComplaints(list);
    } catch (err) {
      console.error('Error fetching neighborhood complaints:', err);
    } finally {
      setLoadingNeighborhood(false);
    }
  };

  const handleLikeComplaint = async (complaintId: string) => {
    try {
      const docRef = doc(db, 'complaints', complaintId);
      // Find the complaint in our state list
      const comp = allNeighborhoodComplaints.find(c => c.id === complaintId) || complaints.find(c => c.id === complaintId);
      if (!comp) return;

      const likedBy = comp.likedBy || [];
      const isAlreadyLiked = likedBy.includes(user.uid);
      
      let newLikedBy: string[];
      let newLikesCount: number;

      if (isAlreadyLiked) {
        newLikedBy = likedBy.filter(uid => uid !== user.uid);
        newLikesCount = Math.max(0, (comp.likesCount || 0) - 1);
      } else {
        newLikedBy = [...likedBy, user.uid];
        newLikesCount = (comp.likesCount || 0) + 1;
      }

      await updateDoc(docRef, {
        likedBy: newLikedBy,
        likesCount: newLikesCount
      });

      // Update both local states to keep them synced in real-time
      const updater = (prev: Complaint[]) => prev.map(c => c.id === complaintId ? { ...c, likedBy: newLikedBy, likesCount: newLikesCount } : c);
      setAllNeighborhoodComplaints(updater);
      setComplaints(updater);
      
      if (selectedComplaint && selectedComplaint.id === complaintId) {
        setSelectedComplaint(prev => prev ? { ...prev, likedBy: newLikedBy, likesCount: newLikesCount } : null);
      }
    } catch (err) {
      console.error('Error liking complaint:', err);
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaintId}`);
    }
  };

  const fetchFeedbacks = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'feedbacks'),
        where('citizenEmail', '==', user.email)
      );
      const querySnapshot = await getDocs(q);
      const list: FeedbackSubmission[] = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as FeedbackSubmission);
      });
      setFeedbacks(list);
    } catch (err) {
      console.error('Error fetching feedbacks:', err);
      handleFirestoreError(err, OperationType.LIST, 'feedbacks');
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
        setImages((prev) => [...prev, ...base64Strings]);
      })
      .catch((err) => console.error('Error reading files:', err))
      .finally(() => setIsUploading(false));
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Analyze complaint text server-side using Gemini AI
  const runAiSeverityCheck = async () => {
    if (!description.trim()) {
      alert("Please provide some details in the description before checking with AI.");
      return;
    }

    setAnalyzingDescription(true);
    try {
      const response = await fetch('/api/analyze-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueType: issueType === 'Others' ? customIssueType : issueType,
          description,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiSeverity(data.predictedSeverity);
        setSeverity(data.predictedSeverity); // Automatically pre-fill the citizen dropdown
        setAiSummary(data.summary || '');
        setRecommendedDept(data.recommendedDepartment || '');
      }
    } catch (error) {
      console.error('AI check failed:', error);
    } finally {
      setAnalyzingDescription(false);
    }
  };

  // Submit new Complaint
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionSuccess('');
    setSubmissionError('');

    if (issueType === 'Others' && !customIssueType.trim()) {
      setSubmissionError('Please specify the custom issue type.');
      return;
    }
    if (!description.trim()) {
      setSubmissionError('Please provide a detailed description of the issue.');
      return;
    }
    if (!address) {
      setSubmissionError('Please select the issue location on the map.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Generate standard government format Complaint ID (e.g. COMP-2026-042859)
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const generatedId = `COMP-2026-${randomSuffix}`;

      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      const timeString = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newComplaint: Omit<Complaint, 'id'> = {
        issueType: issueType === 'Others' ? customIssueType : issueType,
        description,
        severity,
        userSeverity: severity,
        aiSeverity: aiSeverity || 'Medium',
        aiSummary: aiSummary || description.slice(0, 80) + '...',
        recommendedDepartment: recommendedDept || 'Municipal Engineering Division',
        images,
        coordinates: { lat, lng },
        address,
        landmark,
        citizenName: user.fullName,
        citizenEmail: user.email,
        citizenUid: user.uid,
        createdAt: today.toISOString(),
        date: dateString,
        time: timeString,
        status: 'Reported',
      };

      // Add to firestore
      try {
        await addDoc(collection(db, 'complaints'), newComplaint);
      } catch (fErr) {
        handleFirestoreError(fErr, OperationType.CREATE, 'complaints');
      }

      setSubmissionSuccess(`Complaint logged successfully! ID: ${generatedId}`);
      
      // Reset form fields
      setIssueType(ISSUE_CATEGORIES[0]);
      setCustomIssueType('');
      setDescription('');
      setSeverity('Medium');
      setAiSeverity('');
      setAiSummary('');
      setRecommendedDept('');
      setImages([]);
      setLandmark('');
      
      // Refresh complaints list
      fetchComplaints();
      
      // Auto-toggle view
      setTimeout(() => {
        setActiveTab('my-complaints');
        setSubmissionSuccess('');
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setSubmissionError('Failed to record complaint in database. Please check your network connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Feedback
  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackSuccess('');
    if (!feedbackContent.trim()) return;

    try {
      const submission: Omit<FeedbackSubmission, 'id'> = {
        type: feedbackType,
        content: feedbackContent,
        citizenName: user.fullName,
        citizenEmail: user.email,
        createdAt: new Date().toISOString(),
      };

      try {
        await addDoc(collection(db, 'feedbacks'), submission);
      } catch (fErr) {
        handleFirestoreError(fErr, OperationType.CREATE, 'feedbacks');
      }
      setFeedbackSuccess('Thank you for your valuable feedback! Submissions are reviewed by our civic board.');
      setFeedbackContent('');
      fetchFeedbacks();
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusColor = (status: ComplaintStatus) => {
    switch (status) {
      case 'Reported': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'Volunteer Verification In Progress': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Authority Verified': return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Repair In Progress': return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'Resolved': return 'bg-emerald-50 text-emerald-800 border-emerald-100';
      case 'Rejected': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const getSeverityColor = (sev: 'Low' | 'Medium' | 'Critical') => {
    switch (sev) {
      case 'Critical': return 'bg-rose-50 text-rose-700 font-bold border-rose-100';
      case 'Medium': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Low': return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Government Navigation Header */}
      <nav className="bg-slate-900 text-white py-3.5 px-6 shadow-md sticky top-0 z-[1100] border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5">
                COMMUNITY HERO
                <span className="text-[9px] font-bold bg-indigo-500 text-white px-1 rounded uppercase">CITIZEN</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">Citizen Console</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold text-slate-100">{user.fullName}</p>
              <p className="text-[10px] text-slate-400 font-mono">UID: {user.uid.slice(0, 8).toUpperCase()}</p>
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

      {/* Main Grid Layout */}
      <div className="max-w-7xl w-full mx-auto px-4 py-6 flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Navigation Rail Left */}
        <div className="space-y-4">
          {/* Simple Profile summary card */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-sm">
                {user.fullName.split(' ').map(n=>n[0]).join('').toUpperCase()}
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">{user.fullName}</h4>
                <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-gray-500">Citizen Profile Status</span>
              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Active
              </span>
            </div>
          </div>

          {/* Sidebar Menu Options */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-left p-2 space-y-1">
            <button
              onClick={() => { setActiveTab('my-complaints'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'my-complaints'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <List className="w-4 h-4" />
                My Complaints ({complaints.length})
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveTab('neighborhood-alerts'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'neighborhood-alerts'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Bell className="w-4 h-4" />
                Neighborhood Alerts ({allNeighborhoodComplaints.length})
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveTab('report'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'report'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Plus className="w-4 h-4" />
                Report New Issue
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveTab('feedback'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'feedback'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4" />
                Feedback & Suggestions
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => { setActiveTab('help'); setSelectedComplaint(null); }}
              className={`w-full py-2.5 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'help'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <HelpCircle className="w-4 h-4" />
                Help Center
              </span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Dashboard Workstation Right */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* TAB 1: MY COMPLAINTS LIST */}
          {activeTab === 'my-complaints' && !selectedComplaint && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-left space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Your Civic Reports</h3>
                  <p className="text-xs text-gray-500">Track and view status updates on reported public infrastructure issues.</p>
                </div>
                <button
                  onClick={() => setActiveTab('report')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Report An Issue
                </button>
              </div>

              {loadingComplaints ? (
                <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs">Loading complaint history...</span>
                </div>
              ) : complaints.length === 0 ? (
                <div className="py-16 border-2 border-dashed border-slate-100 rounded-xl flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-800">No active complaints found</h4>
                    <p className="text-xs text-gray-500 max-w-xs mt-1">Your localized civic issue reports will appear here. Tap the report button to begin.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {complaints.map((item) => (
                    <div 
                      key={item.id} 
                      className="border border-gray-100 hover:border-gray-200 hover:shadow-md rounded-xl p-4 transition-all flex flex-col justify-between bg-white"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getStatusColor(item.status)}`}>
                            {item.status}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSeverityColor(item.severity)}`}>
                            {item.severity} Severity
                          </span>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-gray-900 leading-tight truncate">{item.issueType}</h4>
                          <p className="text-[10px] text-gray-400 font-mono mt-1">ID: COMP-2026-{(item as any).id?.slice(-6) || 'XXXXXX'}</p>
                          <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.description}</p>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{item.landmark || item.address}</span>
                        </div>
                      </div>

                      {/* Timeline miniature visual */}
                      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                        <span className="text-[10px] font-medium text-gray-400">Filed: {item.date}</span>
                        <button
                          onClick={() => setSelectedComplaint(item)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          View Details
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DETAILED VIEW */}
          {(activeTab === 'my-complaints' || activeTab === 'neighborhood-alerts') && selectedComplaint && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-left space-y-6">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedComplaint(null)}
                  className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back to List
                </button>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${getStatusColor(selectedComplaint.status)}`}>
                    Status: {selectedComplaint.status}
                  </span>
                </div>
              </div>

              {/* Grid with description and maps */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Details Left */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selectedComplaint.issueType}</h2>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">Reference ID: COMP-2026-{(selectedComplaint as any).id?.slice(-6) || 'XXXXXX'}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                    <h4 className="text-xs font-bold text-gray-700">Detailed Complaint Description</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">{selectedComplaint.description}</p>
                  </div>

                  {selectedComplaint.landmark && (
                    <div className="flex items-start gap-1.5 text-xs">
                      <strong className="text-gray-700 shrink-0">Near Landmark:</strong>
                      <span className="text-gray-600">{selectedComplaint.landmark}</span>
                    </div>
                  )}

                  <div className="flex items-start gap-1.5 text-xs">
                    <strong className="text-gray-700 shrink-0">Official Address:</strong>
                    <span className="text-gray-600">{selectedComplaint.address}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <div>
                      <strong>Severity Level:</strong>
                      <div className="mt-1 font-bold text-gray-800">{selectedComplaint.severity}</div>
                    </div>
                    <div>
                      <strong>Submitting Citizen:</strong>
                      <div className="mt-1 font-medium text-gray-800">{selectedComplaint.citizenName}</div>
                    </div>
                  </div>

                  {/* Department Assignment Info */}
                  {selectedComplaint.assignedDepartment && (
                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                      <h4 className="text-xs font-bold text-blue-800 flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5 shrink-0 rotate-45 text-blue-600" />
                        Municipal Action Details
                      </h4>
                      <div className="text-xs text-gray-600 space-y-1">
                        <p><strong>Department Assigned:</strong> {selectedComplaint.assignedDepartment}</p>
                        {selectedComplaint.assignedWorkers && <p><strong>Service Crew:</strong> {selectedComplaint.assignedWorkers}</p>}
                        {selectedComplaint.assignedWorkersPhone && (
                          <p>
                            <strong>Contact Repairer:</strong>{' '}
                            <a
                              href={`tel:${selectedComplaint.assignedWorkersPhone}`}
                              className="text-blue-600 hover:text-blue-800 font-bold underline inline-flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3 animate-pulse" /> {selectedComplaint.assignedWorkersPhone}
                            </a>
                          </p>
                        )}
                        {selectedComplaint.expectedCompletionDate && <p><strong>Target Completion Date:</strong> {selectedComplaint.expectedCompletionDate}</p>}
                      </div>
                    </div>
                  )}

                  {/* Notes / verification logs */}
                  {selectedComplaint.volunteerNotes && (
                    <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl space-y-1">
                      <h4 className="text-xs font-bold text-amber-800">Volunteer Verification Report</h4>
                      <p className="text-xs text-amber-900 italic">" {selectedComplaint.volunteerNotes} "</p>
                      <p className="text-[10px] text-gray-400 mt-2">Verified Genuine by: {selectedComplaint.assignedVolunteerName || 'Authorized Volunteer'}</p>
                    </div>
                  )}

                  {selectedComplaint.completionNotes && (
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                      <h4 className="text-xs font-bold text-emerald-800">Resolution & Sign-off Notes</h4>
                      <p className="text-xs text-emerald-900 font-medium">" {selectedComplaint.completionNotes} "</p>
                      {selectedComplaint.resolvedAt && <p className="text-[10px] text-gray-400 mt-1">Completed Date: {new Date(selectedComplaint.resolvedAt).toLocaleString()}</p>}
                    </div>
                  )}
                </div>

                {/* Media and Map Right */}
                <div className="space-y-4">
                  {/* Photo attachments */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-700 mb-2">Complaint Photo Evidence</h4>
                    {selectedComplaint.images && selectedComplaint.images.length > 0 ? (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {selectedComplaint.images.map((img, idx) => (
                          <img 
                            key={idx} 
                            src={img} 
                            alt={`evidence-${idx}`} 
                            referrerPolicy="no-referrer"
                            className="w-24 h-24 object-cover rounded-lg border border-gray-100 shadow-sm shrink-0" 
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="h-24 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">
                        No photo attachments provided.
                      </div>
                    )}
                  </div>

                  {/* Mini-Map showing precise location (Non-draggable) */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-700 mb-2">Pinpointed Location</h4>
                    <MapComponent 
                      lat={selectedComplaint.coordinates.lat} 
                      lng={selectedComplaint.coordinates.lng} 
                      address={selectedComplaint.address} 
                      onChange={() => {}} 
                      draggable={false} 
                    />
                  </div>
                </div>
              </div>

              {/* Timeline Progress visualizer */}
              <div className="border-t border-gray-100 pt-6">
                <h4 className="text-xs font-bold text-gray-700 mb-4">Official Resolution Workflow Status</h4>
                
                {selectedComplaint.status === 'Rejected' ? (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl">
                    <h5 className="text-xs font-bold text-rose-800">Complaint Rejected</h5>
                    <p className="text-xs text-rose-700 mt-1">This report was rejected by authorities: <strong>{selectedComplaint.rejectionReason || 'Duplicate or Insufficient details'}</strong></p>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    {TIMELINE_STEPS.map((step, idx) => {
                      const currentStepIdx = TIMELINE_STEPS.indexOf(selectedComplaint.status);
                      const isCompleted = idx <= currentStepIdx;
                      const isActive = idx === currentStepIdx;

                      return (
                        <div key={idx} className="flex-1 w-full flex flex-row md:flex-col items-center gap-2">
                          <div className="flex items-center w-full md:w-auto">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isCompleted 
                                ? 'bg-emerald-600 text-white' 
                                : 'bg-gray-100 text-gray-400'
                            } ${isActive ? 'ring-2 ring-emerald-600 ring-offset-2' : ''}`}>
                              {isCompleted ? '✓' : idx + 1}
                            </div>
                            {idx < TIMELINE_STEPS.length - 1 && (
                              <div className={`hidden md:block h-0.5 w-full flex-1 mx-2 ${
                                idx < currentStepIdx ? 'bg-emerald-600' : 'bg-gray-100'
                              }`} />
                            )}
                          </div>
                          <span className={`text-[10px] md:text-center mt-1 font-semibold ${
                            isActive ? 'text-blue-600' : isCompleted ? 'text-gray-700' : 'text-gray-400'
                          }`}>
                            {step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: REPORT NEW ISSUE FORM */}
          {activeTab === 'report' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-left space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Municipal Complaint Registry</h3>
                <p className="text-xs text-gray-500">File a new civic issue. Real-time GPS verification and AI triage are applied instantly.</p>
              </div>

              {submissionSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl font-bold flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  {submissionSuccess}
                </div>
              )}

              {submissionError && (
                <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-xl font-bold">
                  {submissionError}
                </div>
              )}

              <form onSubmit={handleReportSubmit} className="space-y-6">
                
                {/* Issue select dropdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700">Infrastructure Concern Category *</label>
                    <select
                      value={issueType}
                      onChange={(e) => setIssueType(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-blue-500 bg-white"
                    >
                      {ISSUE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700">Citizen Severity Selection *</label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as any)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-blue-500 bg-white"
                    >
                      <option value="Low">Low - cosmetic / non-blocking concern</option>
                      <option value="Medium">Medium - disrupting standard civic activity</option>
                      <option value="Critical">Critical - severe public hazard / hazard to life</option>
                    </select>
                  </div>
                </div>

                {/* Custom category field if Others is selected */}
                {issueType === 'Others' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700">Specify Custom Concern Category *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Stray Cattle Road Blockage"
                      value={customIssueType}
                      onChange={(e) => setCustomIssueType(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                {/* Detailed description */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-gray-700">Describe the Civic Issue in Detail *</label>
                    <button
                      type="button"
                      disabled={analyzingDescription || !description.trim()}
                      onClick={runAiSeverityCheck}
                      className="text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-md border border-blue-200/50 flex items-center gap-1 transition-all cursor-pointer disabled:bg-gray-50 disabled:text-gray-400 disabled:border-transparent"
                    >
                      {analyzingDescription ? (
                        <>
                          <Clock className="w-3 h-3 animate-spin" />
                          Consulting Gemini AI...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-blue-600 animate-pulse" />
                          Run AI Severity Check
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    required
                    placeholder="Provide depth such as approximate physical dimensions of hazard, any direct risk factor like water flowing into main electrical grid panel..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-blue-500 font-sans"
                  />
                </div>

                {/* AI recommendation showcase HUD */}
                {aiSeverity && (
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="space-y-1.5 text-xs text-blue-900">
                      <p className="font-bold flex items-center gap-1">
                        Gemini AI Analysis Complete
                        <span className="bg-blue-200 text-blue-800 text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold">Model Triage</span>
                      </p>
                      <p><strong>Predicted Severity:</strong> <span className="font-bold">{aiSeverity}</span></p>
                      {recommendedDept && <p><strong>Recommended Department:</strong> {recommendedDept}</p>}
                      {aiSummary && <p><strong>Issue Summary:</strong> <span className="italic">"{aiSummary}"</span></p>}
                      <p className="text-[10px] text-blue-600">The severity level has been adjusted in the form. You may still manually override this if required.</p>
                    </div>
                  </div>
                )}

                {/* Multiple Image Uploads */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 block">Photo Attachment Evidence (Optional)</label>
                  <div className="flex flex-wrap gap-3 items-center">
                    {/* Add Photo Button */}
                    <label className="w-20 h-20 border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors">
                      <Camera className="w-5 h-5 text-gray-400" />
                      <span className="text-[9px] text-gray-400 font-bold mt-1">Upload</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>

                    {/* Image Previews */}
                    {images.map((img, idx) => (
                      <div key={idx} className="relative w-20 h-20 border border-gray-100 rounded-xl overflow-hidden shadow-sm shrink-0">
                        <img src={img} alt="attachment" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 bg-gray-900/80 text-white rounded-full p-0.5 hover:bg-rose-600 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {isUploading && (
                      <div className="w-20 h-20 bg-slate-50 rounded-xl flex items-center justify-center border border-gray-100">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Location Map Selection area */}
                <div className="space-y-2 text-left">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <label className="text-xs font-semibold text-gray-700 block">Precise Location Pin *</label>
                    <span className="text-[10px] text-gray-400 font-semibold">Drag marker or tap map to update coordinates</span>
                  </div>
                  
                  <MapComponent 
                    lat={lat} 
                    lng={lng} 
                    address={address} 
                    onChange={(newLat, newLng, newAddress) => {
                      setLat(newLat);
                      setLng(newLng);
                      setAddress(newAddress);
                    }} 
                  />
                </div>

                {/* Landmark Input */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">Specific Landmark / Location Modifier</label>
                  <input
                    type="text"
                    placeholder="e.g. Opposite State Bank ATM, next to green electrical transformer box"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving secure report ...
                    </>
                  ) : (
                    <>
                      Register Complaint & dispatch verification
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB: NEIGHBORHOOD ALERTS & SUPPORT */}
          {activeTab === 'neighborhood-alerts' && !selectedComplaint && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-left space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Neighborhood Civic Alerts</h3>
                <p className="text-xs text-gray-500">View public issues reported by other citizens in your area. Show solidarity and support by upvoting/liking issues to help authorities prioritize repairs.</p>
              </div>

              {loadingNeighborhood ? (
                <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs">Scanning neighborhood alerts...</span>
                </div>
              ) : allNeighborhoodComplaints.length === 0 ? (
                <div className="py-16 border-2 border-dashed border-slate-100 rounded-xl flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center">
                    <Bell className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-800">All quiet in the neighborhood</h4>
                    <p className="text-xs text-gray-500 max-w-xs mt-1">No civic complaints have been reported by neighbors yet.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {allNeighborhoodComplaints.map((item) => {
                    const isLikedByMe = item.likedBy?.includes(user.uid);
                    return (
                      <div 
                        key={item.id} 
                        className="border border-slate-100 hover:border-slate-200 hover:shadow-md rounded-2xl p-5 transition-all bg-white space-y-4"
                      >
                        <div className="flex justify-between items-start flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${getStatusColor(item.status)}`}>
                              {item.status}
                            </span>
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${getSeverityColor(item.severity)}`}>
                              {item.severity} Severity
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono">Reference ID: COMP-{(item.id || '').slice(-6).toUpperCase()}</span>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-gray-950 leading-snug">{item.issueType}</h4>
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-3">"{item.description}"</p>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{item.landmark ? `${item.landmark}, ` : ''}{item.address}</span>
                        </div>

                        {/* Likes Count & Support Button */}
                        <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">
                              👍 {item.likesCount || 0} Citizens Supported
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleLikeComplaint(item.id)}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                                isLikedByMe
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <ThumbsUp className={`w-3.5 h-3.5 ${isLikedByMe ? 'fill-emerald-600 text-emerald-600 animate-bounce' : 'text-slate-500'}`} />
                              {isLikedByMe ? 'Supported!' : 'Support / Like'}
                            </button>

                            <button
                              onClick={() => setSelectedComplaint(item)}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                            >
                              View Details <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FEEDBACK & SUGGESTIONS */}
          {activeTab === 'feedback' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-left space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Civic Feedback Board</h3>
                <p className="text-xs text-gray-500">Provide direct suggestions, gratitude, or recommendations to township engineers.</p>
              </div>

              {feedbackSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl font-medium">
                  {feedbackSuccess}
                </div>
              )}

              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700">Submission Categorization</label>
                    <div className="flex gap-2">
                      {(['Feedback', 'Suggestion', 'Appreciation'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setFeedbackType(t)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            feedbackType === t
                              ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                              : 'bg-white text-gray-600 border-gray-100'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700">Submission Details *</label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Enter suggestions for structural planning, express appreciation for resolved works..."
                    value={feedbackContent}
                    onChange={(e) => setFeedbackContent(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  Submit to Board
                </button>
              </form>

              {/* Previous Feedbacks */}
              <div className="border-t border-gray-100 pt-6">
                <h4 className="text-xs font-bold text-gray-700 mb-4">Your Recent Submissions</h4>
                {feedbacks.length === 0 ? (
                  <p className="text-xs text-gray-400">You have not submitted feedback yet.</p>
                ) : (
                  <div className="space-y-3">
                    {feedbacks.map((f) => (
                      <div key={f.id} className="p-4 border border-gray-50 rounded-xl text-xs space-y-2 bg-slate-50/50">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-blue-700 uppercase tracking-wider text-[9px]">{f.type}</span>
                          <span className="text-[10px] text-gray-400">{new Date(f.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-gray-600 leading-relaxed italic">" {f.content} "</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: HELP CENTER */}
          {activeTab === 'help' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-left space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Citizen Help Center</h3>
                <p className="text-xs text-gray-500">Guidelines, emergency channels, and municipal office directories.</p>
              </div>

              {/* Hotlines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3">
                  <Phone className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-900">National Emergency</h4>
                    <p className="text-lg font-mono font-bold text-rose-700 mt-0.5">112</p>
                    <p className="text-[10px] text-rose-500 mt-1">Available 24/7 across states</p>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3">
                  <Phone className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-950">Municipal Disaster line</h4>
                    <p className="text-lg font-mono font-bold text-amber-800 mt-0.5">1916</p>
                    <p className="text-[10px] text-amber-600 mt-1">Water logs / tree collapses</p>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                  <Mail className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-blue-900">Support Desk</h4>
                    <p className="text-xs font-bold text-blue-800 mt-1">support@communityhero.gov</p>
                    <p className="text-[10px] text-blue-500 mt-1.5">Typical response in 4 hours</p>
                  </div>
                </div>
              </div>

              {/* FAQs */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-700">Frequently Asked Questions</h4>
                
                <div className="space-y-3">
                  <div className="p-3.5 border border-gray-50 rounded-lg">
                    <h5 className="text-xs font-bold text-gray-800">1. Who conducts the initial verification check?</h5>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      Enlisted civic volunteers in your nearby ward or sector receive a dispatch. They physically travel to verify coordinates and ensure duplicates are filtered out before department engineers receive a formal work request.
                    </p>
                  </div>

                  <div className="p-3.5 border border-gray-50 rounded-lg">
                    <h5 className="text-xs font-bold text-gray-800">2. How long does standard resolution take?</h5>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      Time scales depend heavily on severity. Critical hazards (e.g. electrical wiring exposures) are targeted for intervention within 12 hours. General road repair operations usually see a schedule of 3 to 7 working days once approved.
                    </p>
                  </div>

                  <div className="p-3.5 border border-gray-50 rounded-lg">
                    <h5 className="text-xs font-bold text-gray-800">3. Is my identity visible to the public?</h5>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      No. To secure privacy standards, your address and contact details are visible strictly to verified volunteers and board authorities. No other residents can access your profile indicators.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
