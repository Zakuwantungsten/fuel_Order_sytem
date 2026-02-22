import { useState, useEffect } from 'react';
import { Upload, TruckIcon, CheckCircle, Trash2, Map } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../styles/fleet-tracking.css';
import apiClient from '../services/api';

interface Checkpoint {
  _id: string;
  name: string;
  displayName: string;
  alternativeNames?: string[];
  order: number;
  isActive: boolean;
  isMajor: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

interface FleetSnapshot {
  _id: string;
  uploadedAt: string;
  reportDate: string;
  reportType: 'IMPORT' | 'NO_ORDER';
  totalTrucks: number;
  checkpointDistribution: Record<string, number>;
  fileName?: string;
}

interface TruckPosition {
  _id: string;
  truckNo: string;
  trailerNo?: string;
  currentCheckpoint: string;
  checkpointOrder: number;
  status: string;
  direction: 'GOING' | 'RETURNING' | 'UNKNOWN';
  vehicleType?: string;
  departureDate?: string;
  daysInJourney?: number;
  fleetGroup: string;
  reportDate: string;
  snapshotId: string;
}

interface StatusColorMap {
  [status: string]: string;
}

// Component to handle map re-centering when data changes
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const currentCenter = map.getCenter();
    const [newLat, newLng] = center;
    // Only update if the center has actually changed (not just reference)
    if (Math.abs(currentCenter.lat - newLat) > 0.0001 || Math.abs(currentCenter.lng - newLng) > 0.0001) {
      map.setView(center, map.getZoom());
    }
  }, [center[0], center[1], map]); // Depend on actual values, not array reference
  return null;
}

const FleetTracking = () => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [snapshots, setSnapshots] = useState<FleetSnapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [copiedCheckpoint, setCopiedCheckpoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [truckPositions, setTruckPositions] = useState<TruckPosition[]>([]);
  const [statusColorMap, setStatusColorMap] = useState<StatusColorMap>({});
  const [viewMode, setViewMode] = useState<'checkpoints' | 'trucks'>('checkpoints');
  const [deletingSnapshot, setDeletingSnapshot] = useState<string | null>(null);
  const [activeStatusTab, setActiveStatusTab] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState<{ stage: string; percent: number } | null>(null);

  // Fetch checkpoints on mount
  useEffect(() => {
    fetchCheckpoints();
    fetchSnapshots();
  }, []);

  const fetchCheckpoints = async () => {
    try {
      const response = await apiClient.get('/checkpoints');
      console.log('Checkpoints response:', response.data);
      const checkpointsData = Array.isArray(response.data) ? response.data : (response.data.data || []);
      console.log('Checkpoints fetched:', checkpointsData.length, 'checkpoints');
      
      // Debug: Check if checkpoints have coordinates
      const withCoords = checkpointsData.filter((c: Checkpoint) => c.coordinates);
      console.log(`Checkpoints with coordinates: ${withCoords.length}/${checkpointsData.length}`);
      if (withCoords.length === 0) {
        console.warn('⚠️ No checkpoints have coordinates! Markers will not appear on map.');
      }
      
      setCheckpoints(checkpointsData);
      return checkpointsData;
    } catch (error) {
      console.error('Error fetching checkpoints:', error);
      return [];
    }
  };

  const fetchSnapshots = async () => {
    try {
      const response = await apiClient.get('/fleet-tracking/snapshots');
      console.log('Snapshots response:', response.data);
      const snapshotsData = Array.isArray(response.data) ? response.data : (response.data.data || []);
      console.log('Snapshots fetched:', snapshotsData.length, 'snapshots');
      setSnapshots(snapshotsData);
      if (snapshotsData.length > 0) {
        console.log('Setting selected snapshot to:', snapshotsData[0]._id);
        setSelectedSnapshot(snapshotsData[0]._id);
      }
      return snapshotsData;
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchTruckPositions = async (snapshotId: string) => {
    try {
      const response = await apiClient.get('/fleet-tracking/positions', {
        params: { snapshotId },
      });
      console.log('Truck positions response:', response.data);
      const positions = response.data?.data?.positions || [];
      console.log('Truck positions fetched:', positions.length, 'trucks');
      
      if (positions.length > 0) {
        console.log('Sample truck position:', positions[0]);
        
        // Debug: Check unique checkpoints in truck data
        const uniqueCheckpoints = [...new Set(positions.map((p: TruckPosition) => p.currentCheckpoint))];
        console.log(`✅ Trucks found at ${uniqueCheckpoints.length} unique checkpoints:`, uniqueCheckpoints);
        
        // Check which checkpoints match our database
        const matchedCheckpoints = uniqueCheckpoints.filter(name => 
          checkpoints.some(cp => cp.name === name)
        );
        const unmatchedCheckpoints = uniqueCheckpoints.filter(name => 
          !checkpoints.some(cp => cp.name === name)
        );
        
        console.log(`✅ ${matchedCheckpoints.length} checkpoints MATCHED in database:`, matchedCheckpoints);
        if (unmatchedCheckpoints.length > 0) {
          console.warn(`⚠️ ${unmatchedCheckpoints.length} checkpoints NOT FOUND in database:`, unmatchedCheckpoints);
          console.warn('These trucks will NOT appear on map. Add these checkpoints to database.');
        }
      }
      
      setTruckPositions(positions);
      
      // Generate color map for statuses
      const statusMap = generateStatusColorMap(positions);
      setStatusColorMap(statusMap);
      
      return positions;
    } catch (error) {
      console.error('Error fetching truck positions:', error);
      return [];
    }
  };

  // Generate smart color map for different statuses
  const generateStatusColorMap = (positions: TruckPosition[]): StatusColorMap => {
    const uniqueStatuses = Array.from(new Set(positions.map(p => p.status)));
    const colorPalette = [
      '#3B82F6', // Blue
      '#10B981', // Green
      '#F59E0B', // Amber
      '#EF4444', // Red
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#14B8A6', // Teal
      '#F97316', // Orange
      '#6366F1', // Indigo
      '#84CC16', // Lime
      '#06B6D4', // Cyan
      '#F43F5E', // Rose
    ];
    
    const colorMap: StatusColorMap = {};
    uniqueStatuses.forEach((status, index) => {
      colorMap[status] = colorPalette[index % colorPalette.length];
    });
    
    return colorMap;
  };

  // Fetch truck positions when snapshot changes
  useEffect(() => {
    if (selectedSnapshot) {
      fetchTruckPositions(selectedSnapshot);
    }
  }, [selectedSnapshot]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploadingFile(true);
    setUploadProgress({ stage: 'Uploading file...', percent: 15 });

    try {
      // Stage 1: upload & parse on server
      const uploadResponse = await apiClient.post('/fleet-tracking/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded / e.total) * 40) : 20;
          setUploadProgress({ stage: 'Uploading file...', percent: pct });
        },
      });

      setUploadProgress({ stage: 'Processing trucks...', percent: 60 });

      const data = uploadResponse.data?.data;
      const totalTrucks = data?.totalTrucks || 0;
      const fleetGroups = data?.fleetGroups || 0;
      const newSnapshotId = data?.snapshotId;

      // Stage 2: fetch only the updated snapshot list (skip re-fetching checkpoints)
      const snapshotsResponse = await apiClient.get('/fleet-tracking/snapshots');
      const snapshotsData = Array.isArray(snapshotsResponse.data)
        ? snapshotsResponse.data
        : (snapshotsResponse.data.data || []);
      setSnapshots(snapshotsData);

      setUploadProgress({ stage: 'Loading map...', percent: 80 });

      // Stage 3: select the new snapshot directly (triggers fetchTruckPositions via useEffect)
      if (newSnapshotId) {
        setSelectedSnapshot(newSnapshotId);
      } else if (snapshotsData.length > 0) {
        setSelectedSnapshot(snapshotsData[0]._id);
      }

      setUploadProgress({ stage: 'Done!', percent: 100 });
      setTimeout(() => setUploadProgress(null), 1200);

      if (totalTrucks === 0) {
        alert(`⚠️ Upload completed but 0 trucks were processed.\n\nThis usually means:\n• The CSV/Excel format doesn't match expected structure\n• Headers are not recognized\n• Column positions are incorrect\n\nPlease check the file format and try again.`);
      }

      event.target.value = '';
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadProgress(null);
      alert('Error uploading file. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  };

  const getTruckCountAtCheckpoint = (checkpointName: string): number => {
    const snapshot = snapshots.find(s => s._id === selectedSnapshot);
    if (!snapshot) return 0;
    
    return snapshot.checkpointDistribution[checkpointName] || 0;
  };

  const deleteFleetSnapshot = async (snapshotId: string) => {
    if (!confirm('Are you sure you want to delete this fleet report? This action cannot be undone.')) {
      return;
    }
    
    setDeletingSnapshot(snapshotId);
    try {
      await apiClient.delete(`/fleet-tracking/snapshots/${snapshotId}`);
      
      // Refresh snapshots
      await fetchSnapshots();
      
      // If deleted snapshot was selected, select the first available one
      if (selectedSnapshot === snapshotId) {
        const remainingSnapshots = snapshots.filter(s => s._id !== snapshotId);
        if (remainingSnapshots.length > 0) {
          setSelectedSnapshot(remainingSnapshots[0]._id);
        } else {
          setSelectedSnapshot(null);
          setTruckPositions([]);
        }
      }
      
      alert('Fleet report deleted successfully');
    } catch (error) {
      console.error('Error deleting snapshot:', error);
      alert('Error deleting fleet report. Please try again.');
    } finally {
      setDeletingSnapshot(null);
    }
  };

  const formatSnapshotDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Calculate offset positions for trucks at same checkpoint (circular clustering)
  const getTruckOffset = (index: number, total: number): [number, number] => {
    if (total === 1) return [0, 0];
    
    const radius = 0.01 + (total > 10 ? 0.005 : 0); // Adjust radius based on count
    const angle = (2 * Math.PI * index) / total;
    const latOffset = radius * Math.cos(angle);
    const lngOffset = radius * Math.sin(angle);
    
    return [latOffset, lngOffset];
  };

  // Calculate map center (middle of route - around Tanzania/Zambia border)
  const mapCenter: [number, number] = [-8.0, 31.5];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
              <img src="/truck-image.png" alt="Fleet" className="w-20 h-20 mr-3 object-contain" />
              Fleet Tracking
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Upload fleet reports and track truck positions across checkpoints
            </p>
          </div>
          
          <label className={`inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white cursor-pointer ${uploadingFile ? 'bg-primary-400 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700'}`}>
            <Upload className="w-4 h-4 mr-2" />
            {uploadingFile ? uploadProgress?.stage || 'Uploading...' : 'Upload Report'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploadingFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Upload Progress Bar */}
      {uploadProgress && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{uploadProgress.stage}</span>
            <span className="text-sm font-bold text-primary-600">{uploadProgress.percent}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${uploadProgress.percent}%`,
                background: uploadProgress.percent === 100
                  ? 'linear-gradient(90deg, #10B981, #059669)'
                  : 'linear-gradient(90deg, #3B82F6, #6366F1)',
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span className={uploadProgress.percent >= 40 ? 'text-primary-600 font-semibold' : ''}>Upload</span>
            <span className={uploadProgress.percent >= 60 ? 'text-primary-600 font-semibold' : ''}>Processing</span>
            <span className={uploadProgress.percent >= 80 ? 'text-primary-600 font-semibold' : ''}>Loading map</span>
            <span className={uploadProgress.percent === 100 ? 'text-green-600 font-semibold' : ''}>Done</span>
          </div>
        </div>
      )}

      {/* Snapshot Selector */}
      {snapshots.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Report Snapshot
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode(viewMode === 'checkpoints' ? 'trucks' : 'checkpoints')}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                {viewMode === 'checkpoints' ? (
                  <>
                    <TruckIcon className="w-4 h-4" />
                    Show Individual Trucks
                  </>
                ) : (
                  <>
                    <Map className="w-4 h-4" />
                    Show Checkpoints
                  </>
                )}
              </button>
              {selectedSnapshot && (
                <button
                  onClick={() => deleteFleetSnapshot(selectedSnapshot)}
                  disabled={deletingSnapshot === selectedSnapshot}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
                >
                  {deletingSnapshot === selectedSnapshot ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Report
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={selectedSnapshot || ''}
              onChange={(e) => setSelectedSnapshot(e.target.value)}
              className="form-select flex-1"
            >
              {snapshots.map((snapshot) => {
                const dateStr = formatSnapshotDate(snapshot.reportDate || snapshot.uploadedAt);
                return (
                  <option key={snapshot._id} value={snapshot._id}>
                    {dateStr} - {snapshot.reportType} ({snapshot.totalTrucks} trucks)
                    {snapshot.fileName ? ` - ${snapshot.fileName}` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          
          {/* Status Legend */}
          {viewMode === 'trucks' && Object.keys(statusColorMap).length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Truck Status Distribution:</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.entries(statusColorMap)
                  .sort((a, b) => {
                    const countA = truckPositions.filter(t => t.status === a[0]).length;
                    const countB = truckPositions.filter(t => t.status === b[0]).length;
                    return countB - countA; // Sort by count descending
                  })
                  .map(([status, color]) => {
                    const truckCount = truckPositions.filter(t => t.status === status).length;
                    return (
                      <div key={status} className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded">
                        <div 
                          className="w-4 h-4 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: color }}
                        ></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate" title={status}>
                            {status}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {truckCount} truck{truckCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          
          {/* Checkpoint Summary */}
          {viewMode === 'checkpoints' && truckPositions.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Trucks by Location (Click checkpoint on map to copy truck numbers):
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {(() => {
                  const checkpointCounts = checkpoints
                    .map(cp => ({
                      name: cp.displayName,
                      fullName: cp.name,
                      count: getTruckCountAtCheckpoint(cp.name),
                      isMajor: cp.isMajor,
                    }))
                    .filter(cp => cp.count > 0)
                    .sort((a, b) => b.count - a.count);
                  
                  return checkpointCounts.map(cp => (
                    <div 
                      key={cp.fullName} 
                      className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={async () => {
                        const trucksHere = truckPositions.filter(t => t.currentCheckpoint === cp.fullName);
                        const truckNumbers = trucksHere.map(t => t.truckNo).join('\n');
                        await navigator.clipboard.writeText(truckNumbers);
                        setCopiedCheckpoint(cp.fullName);
                        setTimeout(() => setCopiedCheckpoint(null), 2000);
                      }}
                      title="Click to copy all truck numbers at this checkpoint"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div 
                          className={`w-3 h-3 rounded-full flex-shrink-0`}
                          style={{ backgroundColor: cp.isMajor ? '#3B82F6' : '#10B981' }}
                        ></div>
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                          {cp.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2">
                        {cp.count}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Leaflet Map Visualization */}
      {checkpoints.length > 0 && selectedSnapshot ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {viewMode === 'checkpoints' 
                  ? `Checkpoint View (${checkpoints.filter(c => getTruckCountAtCheckpoint(c.name) > 0).length} locations with trucks)` 
                  : `Individual Truck View (${truckPositions.length} trucks)`}
              </h2>
              {viewMode === 'trucks' && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Color-coded by status • {Object.keys(statusColorMap).length} different statuses
                </div>
              )}
            </div>
          </div>

          <div style={{ height: '700px', width: '100%' }}>
            <MapContainer
              center={mapCenter}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={true}
            >
              <MapController center={mapCenter} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {viewMode === 'checkpoints' ? (
                // Checkpoint View - One marker per checkpoint with tabbed status view
                checkpoints.filter(checkpoint => {
                  const count = getTruckCountAtCheckpoint(checkpoint.name);
                  return checkpoint.coordinates && count > 0;
                }).map((checkpoint) => {
                  const totalTruckCount = getTruckCountAtCheckpoint(checkpoint.name);
                  
                  // Group trucks by status at this checkpoint
                  const trucksHere = truckPositions.filter(t => t.currentCheckpoint === checkpoint.name);
                  const statusGroups = trucksHere.reduce((acc, truck) => {
                    if (!acc[truck.status]) {
                      acc[truck.status] = [];
                    }
                    acc[truck.status].push(truck);
                    return acc;
                  }, {} as Record<string, TruckPosition[]>);
                  
                  const statuses = Object.keys(statusGroups);
                  const checkpointKey = checkpoint.name;
                  const currentTab = activeStatusTab[checkpointKey] || statuses[0];
                  
                  const size = checkpoint.isMajor ? 40 : 32;
                  const fillColor = checkpoint.isMajor ? '#3B82F6' : '#10B981';
                  
                  // Create custom icon with total truck count
                  const customIcon = L.divIcon({
                    className: 'custom-marker',
                    html: `
                      <div style="
                        width: ${size}px;
                        height: ${size}px;
                        background-color: ${fillColor};
                        border: 3px solid white;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        cursor: pointer;
                      ">
                        <span style="
                          color: white;
                          font-weight: bold;
                          font-size: ${checkpoint.isMajor ? '16px' : '14px'};
                          text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
                        ">${totalTruckCount}</span>
                      </div>
                    `,
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2],
                  });
                  
                  return (
                    <Marker
                      key={checkpoint._id}
                      position={[checkpoint.coordinates!.latitude, checkpoint.coordinates!.longitude]}
                      icon={customIcon}
                    >
                      <Popup maxHeight={450} maxWidth={320} autoPan={false} closeButton={true}>
                        <div 
                          className="min-w-[280px] max-w-[300px]"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                        >
                          {/* Header */}
                          <div className="font-bold text-base mb-2 pb-2 border-b border-gray-200">
                            {checkpoint.displayName}
                          </div>
                          <div className="text-xs mb-3 text-center text-gray-600">
                            {totalTruckCount} Truck{totalTruckCount !== 1 ? 's' : ''} Total
                          </div>
                          
                          {/* Status Tabs */}
                          <div className="flex flex-wrap gap-1 mb-3 border-b border-gray-200 pb-2">
                            {statuses.map((status) => {
                              const isActive = currentTab === status;
                              const statusColor = statusColorMap[status] || '#10B981';
                              const count = statusGroups[status].length;
                              
                              return (
                                <button
                                  key={status}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.nativeEvent.stopImmediatePropagation();
                                    setActiveStatusTab(prev => ({
                                      ...prev,
                                      [checkpointKey]: status
                                    }));
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onTouchStart={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  className="px-2 py-1 text-xs font-semibold rounded transition-all flex-shrink-0"
                                  style={{
                                    backgroundColor: isActive ? statusColor : `${statusColor}15`,
                                    color: isActive ? 'white' : statusColor,
                                    border: `1px solid ${statusColor}40`,
                                    maxWidth: '160px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={`${status} (${count} trucks)`}
                                >
                                  {status.length > 15 ? status.substring(0, 12) + '...' : status} ({count})
                                </button>
                              );
                            })}
                          </div>
                          
                          {/* Tab Content */}
                          {statuses.map((status) => {
                            if (status !== currentTab) return null;
                            
                            const trucksInGroup = statusGroups[status];
                            const statusColor = statusColorMap[status] || '#10B981';
                            const isCopied = copiedCheckpoint === `${checkpoint.name}-${status}`;
                            
                            return (
                              <div key={status}>
                                {/* Truck List */}
                                <div className="mb-3 max-h-52 overflow-y-auto bg-gray-50 rounded-lg p-2">
                                  <div className="space-y-1">
                                    {trucksInGroup.map((truck, idx) => (
                                      <div 
                                        key={truck._id} 
                                        className="text-xs p-1.5 rounded flex items-center gap-2 bg-white shadow-sm"
                                      >
                                        <span className="font-mono text-gray-500 min-w-[20px]">{idx + 1}.</span>
                                        <span className="font-bold text-gray-800">{truck.truckNo}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                
                                {/* Copy Button */}
                                <button
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const truckNumbers = trucksInGroup.map(t => t.truckNo).join('\n');
                                    await navigator.clipboard.writeText(truckNumbers);
                                    setCopiedCheckpoint(`${checkpoint.name}-${status}`);
                                    setTimeout(() => setCopiedCheckpoint(null), 2000);
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="w-full px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                                  style={{
                                    backgroundColor: statusColor,
                                    color: 'white'
                                  }}
                                >
                                  {isCopied ? (
                                    <span className="flex items-center justify-center gap-1">
                                      <CheckCircle className="w-4 h-4" />
                                      Copied!
                                    </span>
                                  ) : (
                                    `Copy ${trucksInGroup.length} Truck${trucksInGroup.length !== 1 ? 's' : ''}`
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })
              ) : (
                // Individual Truck View - Status-based colors with clustering
                (() => {
                  // Group trucks by checkpoint
                  const trucksByCheckpoint = truckPositions.reduce((acc, truck) => {
                    if (!acc[truck.currentCheckpoint]) {
                      acc[truck.currentCheckpoint] = [];
                    }
                    acc[truck.currentCheckpoint].push(truck);
                    return acc;
                  }, {} as Record<string, TruckPosition[]>);
                  
                  return Object.entries(trucksByCheckpoint).flatMap(([checkpointName, trucks]) => {
                    const checkpoint = checkpoints.find(c => c.name === checkpointName);
                    if (!checkpoint) {
                      console.warn(`⚠️ Checkpoint not found for: "${checkpointName}"`);
                      return [];
                    }
                    if (!checkpoint.coordinates) {
                      console.warn(`⚠️ Checkpoint "${checkpointName}" has no coordinates`);
                      return [];
                    }
                    
                    return trucks.map((truck, index) => {
                      const [latOffset, lngOffset] = getTruckOffset(index, trucks.length);
                      const position: [number, number] = [
                        checkpoint.coordinates!.latitude + latOffset,
                        checkpoint.coordinates!.longitude + lngOffset,
                      ];
                      
                      const color = statusColorMap[truck.status] || '#9CA3AF';
                      
                      return (
                        <CircleMarker
                          key={truck._id}
                          center={position}
                          radius={10}
                          fillColor={color}
                          fillOpacity={0.9}
                          color="#FFFFFF"
                          weight={2.5}
                        >
                          <Popup maxWidth={300} autoPan={false} closeButton={true}>
                            <div 
                              className="min-w-[200px] max-w-[280px]"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                            >
                              <div className="font-bold text-lg mb-2">{truck.truckNo}</div>
                              {truck.trailerNo && (
                                <div className="text-sm text-gray-600 mb-1">Trailer: {truck.trailerNo}</div>
                              )}
                              <div className="text-sm mb-1">
                                <span className="font-semibold">Location:</span> {checkpoint.displayName}
                              </div>
                              <div className="text-sm mb-1 flex flex-wrap items-center gap-1">
                                <span className="font-semibold">Status:</span> 
                                <span 
                                  className="px-2 py-0.5 rounded text-white text-xs break-words max-w-full"
                                  style={{ backgroundColor: color }}
                                  title={truck.status}
                                >
                                  {truck.status.length > 25 ? truck.status.substring(0, 22) + '...' : truck.status}
                                </span>
                              </div>
                              <div className="text-sm mb-1">
                                <span className="font-semibold">Direction:</span> {truck.direction}
                              </div>
                              {truck.daysInJourney && (
                                <div className="text-sm mb-1">
                                  <span className="font-semibold">Days in Journey:</span> {truck.daysInJourney}
                                </div>
                              )}
                              {truck.fleetGroup && (
                                <div className="text-sm mb-2">
                                  <span className="font-semibold">Fleet:</span> {truck.fleetGroup}
                                </div>
                              )}
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(truck.truckNo);
                                  alert(`Copied: ${truck.truckNo}`);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="w-full text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                              >
                                Copy Truck Number
                              </button>
                            </div>
                          </Popup>
                        </CircleMarker>
                      );
                    });
                  });
                })()
              )}
            </MapContainer>
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            {viewMode === 'checkpoints' ? (
              <>
                <div className="flex items-center justify-center space-x-6 text-sm">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-500 mr-2"></div>
                    <span className="text-gray-700 dark:text-gray-300">Major Checkpoint</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-6 h-6 rounded-full bg-green-500 mr-2"></div>
                    <span className="text-gray-700 dark:text-gray-300">Minor Checkpoint</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded-full bg-gray-400 mr-2"></div>
                    <span className="text-gray-700 dark:text-gray-300">No Trucks</span>
                  </div>
                </div>
                <div className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Click any checkpoint marker with trucks to copy truck list
                </div>
              </>
            ) : (
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                Trucks are color-coded by status. Click individual markers for details.
                <br />
                <span className="text-xs">Trucks at the same checkpoint are clustered in a circle pattern.</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-center text-gray-600 dark:text-gray-400">
            <p>Debug Info:</p>
            <p>Checkpoints loaded: {checkpoints.length}</p>
            <p>Selected snapshot: {selectedSnapshot || 'None'}</p>
            <p>Snapshots available: {snapshots.length}</p>
            {checkpoints.length === 0 && <p className="text-red-500 mt-2">⚠️ No checkpoints loaded from API</p>}
            {!selectedSnapshot && snapshots.length > 0 && <p className="text-red-500 mt-2">⚠️ Snapshot not selected</p>}
          </div>
        </div>
      )}

      {/* Empty State */}
      {snapshots.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <img src="/truck-image.png" alt="Fleet" className="w-16 h-16 mx-auto object-contain mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Fleet Reports Yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Upload an Excel fleet report to start tracking truck positions
          </p>
          <label className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 cursor-pointer">
            <Upload className="w-4 h-4 mr-2" />
            Upload Your First Report
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploadingFile}
              className="hidden"
            />
          </label>
        </div>
      )}
    </div>
  );
};

export default FleetTracking;
