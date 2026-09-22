import { useState, useEffect, useContext, useCallback, useRef } from "react";
import { AuthContext, WebSocketContext } from "../App";
import { getDevices, getEmergencyStatus, getParkingSlots } from "../api";
import Navbar from "../components/Navbar";
import DeviceCard from "../components/DeviceCard";
import AdminPanel from "../components/AdminPanel";
import ActivityLog from "../components/ActivityLog";
import NotificationCenter from "../components/NotificationCenter";
import ChangePasswordModal from "../components/ChangePasswordModal";
import AddComponentModal from "../components/AddComponentModal";
import ReportModal from "../components/ReportModal";
import EmergencyBar from "../components/EmergencyBar";
import ParkingFloor from "../components/ParkingFloor";
import { LayoutGrid, Users, Clock, Loader2, Plus, Lock, WifiOff, Car } from "lucide-react";
import toast from "react-hot-toast";

export default function DashboardPage() {
  const { user } = useContext(AuthContext);
  const { deviceOnline, esp32Online } = useContext(WebSocketContext);
  const isDeviceOnline = deviceOnline ?? esp32Online;
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("controls");
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Priority 1: Emergency System State
  const [emergencyState, setEmergencyState] = useState({ mode: 'normal' });

  // Priority 2: Parking Slots & Capacity State
  const [parkingSlots, setParkingSlots] = useState([]);
  const [parkingStats, setParkingStats] = useState({ total: 0, occupied: 0, available: 0, isFull: false });

  const audioCtxRef = useRef(null);
  const lastNotifRef = useRef({});

  // Fetch devices on mount
  const fetchDevices = useCallback(async () => {
    try {
      const data = await getDevices();
      setDevices(data.devices || []);
    } catch (err) {
      toast.error("Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch emergency & parking data
  const fetchEmergencyAndParking = useCallback(async () => {
    try {
      const [emData, pkData] = await Promise.all([
        getEmergencyStatus().catch(() => null),
        getParkingSlots().catch(() => null)
      ]);
      if (emData) setEmergencyState(emData);
      if (pkData) {
        setParkingSlots(pkData.slots || []);
        setParkingStats(pkData.stats || { total: 0, occupied: 0, available: 0, isFull: false });
      }
    } catch (e) {
      console.error("Failed to fetch emergency / parking data", e);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchEmergencyAndParking();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDevices();
        fetchEmergencyAndParking();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchDevices, fetchEmergencyAndParking]);

  // Play notification sound using Web Audio API
  const playNotifSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (
          window.AudioContext || window.webkitAudioContext
        )();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      /* audio not available */
    }
  }, [soundEnabled]);

  // Send browser notification
  const sendBrowserNotif = useCallback((title, body) => {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/logo.jpg" });
    }
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Listen for WebSocket messages
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      
      if (data.type === 'init-state') {
        setDevices(data.devices || []);
        if (data.emergency) setEmergencyState(data.emergency);
        if (data.parking) {
          setParkingSlots(data.parking.slots || []);
          setParkingStats(data.parking.stats || { total: 0, occupied: 0, available: 0, isFull: false });
        }
      }

      if (data.type === "device-update") {
        // Update device state
        setDevices((prev) =>
          prev.map((d) =>
            d.id === data.deviceId
              ? { ...d, state: { ...d.state, ...data.state } }
              : d,
          ),
        );

        // Build notification message
        const deviceNames = {
          "light-1": "Light 1",
          "light-2": "Light 2",
          "light-3": "Light 3",
          "rolling-door": "Rolling Door",
          "boom-gate": "Boom Gate",
          "party-light": "Party Light",
        };
        const devName = deviceNames[data.deviceId] || data.deviceId;
        const stateStr = Object.entries(data.state || {})
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        const message = `${devName} → ${stateStr}`;

        // Toast notification (only if triggered by someone else)
        if (data.triggeredBy && data.triggeredBy !== user?.username) {
          const now = Date.now();
          const dedupKey = `${data.deviceId}-${stateStr}`;
          const lastTime = lastNotifRef.current[dedupKey] || 0;
          
          if (now - lastTime > 1500) {
            lastNotifRef.current[dedupKey] = now;
            
            // Add to notification list
            const notif = {
              deviceId: data.deviceId,
              message,
              triggeredBy: data.triggeredBy,
              timestamp: data.timestamp || now,
              read: false,
            };
            setNotifications((prev) => [notif, ...prev].slice(0, 50));

            toast(message, {
              icon: data.deviceId?.includes("light")
                ? "💡"
                : data.deviceId === "boom-gate"
                  ? "🚧"
                  : data.deviceId === "rolling-door"
                    ? "🚪"
                    : "🎉",
              duration: 3000,
            });
            playNotifSound();
            sendBrowserNotif("Floor Management", `${data.triggeredBy}: ${message}`);
          }
        }
      }

      if (data.type === "automation-update") {
        setDevices((prev) =>
          prev.map((d) =>
            d.id === data.deviceId ? { ...d, automation: data.automation } : d,
          ),
        );
      }

      if (data.type === "devices-changed") {
        if (data.action === "create") {
          setDevices((prev) => [
            ...prev.filter((d) => d.id !== data.device.id),
            data.device,
          ]);
        } else if (data.action === "update") {
          setDevices((prev) =>
            prev.map((d) =>
              d.id === data.device.id ? { ...d, ...data.device } : d,
            ),
          );
        } else if (data.action === "delete") {
          setDevices((prev) => prev.filter((d) => d.id !== data.deviceId));
        }
      }

      if (data.type === "device-status" || data.type === "esp32-status") {
        // device status is handled in App.jsx context
      }

      if (data.type === "new-report") {
        window.dispatchEvent(new CustomEvent("report-event", { detail: data }));
        if (user?.role === "admin" && data.report?.username !== user?.username) {
          const now = Date.now();
          const dedupKey = `new-report-${data.report?.id}`;
          const lastTime = lastNotifRef.current[dedupKey] || 0;

          if (now - lastTime > 2500) {
            lastNotifRef.current[dedupKey] = now;
            const notif = {
              deviceId: "report",
              message: `⚠️ New Report: "${data.report?.title}" by ${data.report?.username}`,
              triggeredBy: data.report?.username,
              timestamp: data.timestamp || now,
              read: false,
            };
            setNotifications((prev) => [notif, ...prev].slice(0, 50));
            toast(`⚠️ New Report: "${data.report?.title}" by ${data.report?.username}`, {
              id: dedupKey,
              duration: 6000,
              icon: "⚠️",
            });
            playNotifSound();
            sendBrowserNotif("Floor Management - New Report", `${data.report?.username}: ${data.report?.title}`);
          }
        }
      }

      if (data.type === "report-status-update") {
        window.dispatchEvent(new CustomEvent("report-event", { detail: data }));
        const isMyReport = user?.id === data.report?.user_id || user?.username === data.report?.username;
        const statusLabel = data.report?.status === 'resolved' ? 'RESOLVED' : data.report?.status === 'in_progress' ? 'IN PROGRESS' : 'PENDING';
        if (isMyReport) {
          const now = Date.now();
          const dedupKey = `report-status-${data.report?.id}-${data.report?.status}`;
          const lastTime = lastNotifRef.current[dedupKey] || 0;

          if (now - lastTime > 2500) {
            lastNotifRef.current[dedupKey] = now;
            const notif = {
              deviceId: "report",
              message: `📋 Report "${data.report?.title}" status is now ${statusLabel}`,
              triggeredBy: "Admin",
              timestamp: data.timestamp || now,
              read: false,
            };
            setNotifications((prev) => [notif, ...prev].slice(0, 50));
            toast.success(`📋 Report "${data.report?.title}" is now ${statusLabel}!`, {
              id: dedupKey,
              duration: 6000,
              icon: "🔔",
            });
            playNotifSound();
            sendBrowserNotif("Floor Management - Report Updated", `"${data.report?.title}" is now ${statusLabel}`);
          }
        }
      }

      if (data.type === "report-deleted") {
        window.dispatchEvent(new CustomEvent("report-event", { detail: data }));
      }

      // Priority 1: Emergency System Events
      if (data.type === "emergency-alert") {
        setEmergencyState({
          mode: data.mode,
          triggeredBy: data.triggeredBy,
          timestamp: data.timestamp
        });
        toast.error(
          data.mode === "evacuate"
            ? `🚨 EMERGENCY EVACUATION TRIGGERED by ${data.triggeredBy}!`
            : `🔒 MASTER LOCKDOWN ACTIVATED by ${data.triggeredBy}!`,
          { duration: 8000 }
        );
        playNotifSound();
        sendBrowserNotif(
          "Floor Management - EMERGENCY ALERT",
          data.mode === "evacuate" ? "EVACUATION PROTOCOL ACTIVE" : "MASTER LOCKDOWN ACTIVE"
        );
      }

      if (data.type === "emergency-cleared") {
        setEmergencyState({ mode: "normal", clearedBy: data.clearedBy, timestamp: data.timestamp });
        toast.success(`✅ Emergency status cleared by ${data.clearedBy}. Normal operation resumed.`);
      }

      // Priority 2: Parking Slot Real-Time Telemetry
      if (data.type === "slot-update") {
        setParkingSlots((prev) =>
          prev.map((s) => (s.id === data.slotId ? { ...s, occupied: data.occupied } : s))
        );
        if (data.stats) setParkingStats(data.stats);
      }

      if (data.type === "slots-changed") {
        if (data.action === "create" && data.slot) {
          setParkingSlots((prev) => [...prev.filter((s) => s.id !== data.slot.id), data.slot]);
        } else if (data.action === "delete" && data.slotId) {
          setParkingSlots((prev) => prev.filter((s) => s.id !== data.slotId));
        }
        if (data.stats) setParkingStats(data.stats);
      }
    };

    window.addEventListener("ws-message", handler);
    return () => window.removeEventListener("ws-message", handler);
  }, [user, playNotifSound, sendBrowserNotif]);

  const tabs = [
    { id: "controls", label: "Controls", icon: LayoutGrid },
    {
      id: "parking",
      label: "Parking",
      icon: Car,
      badge: parkingStats.total > 0 ? (parkingStats.isFull ? "FULL" : `${parkingStats.available} Free`) : null,
      badgeColor: parkingStats.isFull
        ? "bg-red-500/20 text-red-400 border-red-500/30"
        : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    },
    ...(user?.role === "admin"
      ? [{ id: "admin", label: "Admin", icon: Users }]
      : []),
    { id: "logs", label: "Logs", icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar
        notifications={notifications}
        onBellClick={() => {
          setNotifOpen(true);
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        }}
        onChangePassword={() => setPasswordModalOpen(true)}
        onReportIssue={() => setReportOpen(true)}
      />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 pt-20 pb-24 md:pb-8">
        {/* Priority 1: Emergency Protocols Bar & Alarm Overlay */}
        <EmergencyBar
          emergencyState={emergencyState}
          onEmergencyChange={setEmergencyState}
        />

        {/* Tab navigation (desktop) */}
        <div className="hidden md:flex items-center gap-1 mb-6 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-cyan-500/15 text-cyan-400 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${tab.badgeColor}`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === "controls" && (
              <div className="space-y-6">
                {/* Device status banner */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
                    isDeviceOnline
                      ? "bg-green-500/5 border-green-500/20 text-green-400"
                      : "bg-red-500/5 border-red-500/20 text-red-400"
                  }`}
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${isDeviceOnline ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
                  />
                  <span className="font-medium">
                    ESP32 Controller:{" "}
                    {isDeviceOnline ? "Connected & Healthy" : "Offline / Not Responding"}
                  </span>
                  {!isDeviceOnline && (
                    <span className="text-xs text-red-400/90 ml-auto flex items-center gap-1.5 font-medium">
                      <Lock className="w-3.5 h-3.5" /> Controls Locked — Connect ESP32 to operate
                    </span>
                  )}
                </div>

                {/* Header with Add Component button */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    Building Components ({devices.length})
                  </h3>
                  {user?.role === "admin" && (
                    <button
                      type="button"
                      onClick={() => setAddComponentOpen(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Component
                    </button>
                  )}
                </div>

                {/* Device grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {devices.map((device) => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      onUpdate={fetchDevices}
                      isParkingFull={parkingStats.isFull}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeTab === "parking" && (
              <div className="space-y-6">
                <ParkingFloor
                  slots={parkingSlots}
                  stats={parkingStats}
                  onSlotUpdated={(slot, stats) => {
                    setParkingSlots((prev) => prev.map((s) => (s.id === slot.id ? slot : s)));
                    if (stats) setParkingStats(stats);
                  }}
                  onSlotRemoved={(slotId, stats) => {
                    setParkingSlots((prev) => prev.filter((s) => s.id !== slotId));
                    if (stats) setParkingStats(stats);
                  }}
                  onSlotAdded={(slot, stats) => {
                    setParkingSlots((prev) => [...prev, slot]);
                    if (stats) setParkingStats(stats);
                  }}
                />
              </div>
            )}

            {activeTab === "admin" && user?.role === "admin" && <AdminPanel />}

            {activeTab === "logs" && <ActivityLog />}
          </>
        )}
      </main>

      {/* Mobile bottom tabs */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 z-40">
        <div className="flex items-center justify-around px-2 py-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-0 ${
                activeTab === tab.id ? "text-cyan-400" : "text-slate-500"
              }`}
            >
              <div className="relative">
                <tab.icon className="w-5 h-5" />
                {tab.badge && (
                  <span
                    className={`absolute -top-1.5 -right-3 text-[9px] font-bold px-1 py-0.2 rounded-full border ${tab.badgeColor}`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notification panel */}
      <NotificationCenter
        notifications={notifications}
        isOpen={notifOpen}
        onClose={() => setNotifOpen(false)}
        onClear={() => setNotifications([])}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />

      {/* Add Component Modal */}
      <AddComponentModal
        isOpen={addComponentOpen}
        onClose={() => setAddComponentOpen(false)}
      />

      {/* Report Modal */}
      <ReportModal 
        isOpen={reportOpen} 
        onClose={() => setReportOpen(false)} 
      />
    </div>
  );
}
