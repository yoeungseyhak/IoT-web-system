import { useState, useEffect, useRef, useContext } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Siren, Lock, Unlock, Loader2, Volume2, VolumeX } from 'lucide-react';
import { AuthContext } from '../App';
import { triggerEvacuation, triggerLockdown, clearEmergency } from '../api';
import toast from 'react-hot-toast';

export default function EmergencyBar({ emergencyState, onEmergencyChange }) {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(null); // 'evacuate' | 'lockdown' | null
  const [audioMuted, setAudioMuted] = useState(false);
  const audioCtxRef = useRef(null);
  const sirenIntervalRef = useRef(null);

  const mode = emergencyState?.mode || 'normal';
  const isActive = mode === 'evacuate' || mode === 'lockdown';

  // Play continuous siren during active evacuation
  useEffect(() => {
    if (mode === 'evacuate' && !audioMuted) {
      const playTone = () => {
        try {
          if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
          }
          const ctx = audioCtxRef.current;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.5);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.5);
        } catch (e) {}
      };

      playTone();
      sirenIntervalRef.current = setInterval(playTone, 600);
    } else {
      if (sirenIntervalRef.current) {
        clearInterval(sirenIntervalRef.current);
        sirenIntervalRef.current = null;
      }
    }

    return () => {
      if (sirenIntervalRef.current) {
        clearInterval(sirenIntervalRef.current);
        sirenIntervalRef.current = null;
      }
    };
  }, [mode, audioMuted]);

  const handleEvacuate = async () => {
    setLoading(true);
    try {
      const res = await triggerEvacuation();
      toast.error('🚨 EMERGENCY EVACUATION TRIGGERED! All exit doors and gates opened.', { duration: 6000 });
      onEmergencyChange?.(res.state);
      setShowConfirm(null);
    } catch (err) {
      toast.error(err.message || 'Failed to trigger evacuation');
    } finally {
      setLoading(false);
    }
  };

  const handleLockdown = async () => {
    setLoading(true);
    try {
      const res = await triggerLockdown();
      toast.error('🔒 MASTER LOCKDOWN ACTIVATED! All perimeter exits sealed.', { duration: 6000 });
      onEmergencyChange?.(res.state);
      setShowConfirm(null);
    } catch (err) {
      toast.error(err.message || 'Failed to trigger lockdown');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      const res = await clearEmergency();
      toast.success('✅ Emergency status cleared. Normal operation restored.');
      onEmergencyChange?.(res.state);
    } catch (err) {
      toast.error(err.message || 'Failed to clear emergency');
    } finally {
      setLoading(false);
    }
  };

  // Render Persistent Flashing Banner during Active Emergency
  if (isActive) {
    return (
      <div className={`w-full py-3.5 px-4 sm:px-6 mb-6 rounded-2xl shadow-xl transition-all duration-300 border ${
        mode === 'evacuate'
          ? 'bg-red-600/90 text-white border-red-500 animate-pulse'
          : 'bg-amber-600/90 text-white border-amber-500'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-center md:text-left">
            <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center flex-shrink-0 animate-bounce">
              {mode === 'evacuate' ? <Siren className="w-6 h-6 text-white" /> : <Lock className="w-6 h-6 text-white" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-wide uppercase">
                {mode === 'evacuate' ? '🚨 EMERGENCY EVACUATION ACTIVE' : '🔒 MASTER LOCKDOWN ACTIVE'}
              </h2>
              <p className="text-xs sm:text-sm text-white/90">
                {mode === 'evacuate'
                  ? 'All exit gates & doors have been forced OPEN. Hallway lights enabled. Proceed to emergency exits.'
                  : 'All perimeter gates and rolling doors are forced CLOSED. Access restricted.'}
                {emergencyState?.triggeredBy && (
                  <span className="ml-2 text-white/75 font-mono text-xs">(Triggered by {emergencyState.triggeredBy})</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mode === 'evacuate' && (
              <button
                onClick={() => setAudioMuted(!audioMuted)}
                className="p-2 rounded-xl bg-black/20 hover:bg-black/30 transition-colors"
                title={audioMuted ? 'Unmute siren' : 'Mute siren'}
              >
                {audioMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
              </button>
            )}

            {user?.role === 'admin' ? (
              <button
                onClick={handleClear}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-900 font-bold rounded-xl shadow hover:bg-slate-100 transition-all text-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin text-slate-900" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                Clear Emergency / All Clear
              </button>
            ) : (
              <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-black/30 text-white/90">
                Awaiting Security Reset
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // If Normal Mode & Admin: Show Quick-Access Emergency Protocol Bar
  if (user?.role === 'admin') {
    return (
      <>
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-3.5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-200">Emergency Protocols</span>
              <p className="text-[11px] text-slate-400">Immediate facility evacuation or perimeter lockdown controls</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => setShowConfirm('evacuate')}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
            >
              <Siren className="w-3.5 h-3.5" />
              Evacuation Protocol
            </button>
            <button
              onClick={() => setShowConfirm('lockdown')}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
            >
              <Lock className="w-3.5 h-3.5" />
              Perimeter Lockdown
            </button>
          </div>
        </div>

        {/* Confirmation Modal */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowConfirm(null)}>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${showConfirm === 'evacuate' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                  {showConfirm === 'evacuate' ? <Siren className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {showConfirm === 'evacuate' ? 'Confirm Emergency Evacuation' : 'Confirm Perimeter Lockdown'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">High-priority facility override</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                {showConfirm === 'evacuate'
                  ? 'This action will immediately OPEN the Rolling Door and Boom Gate, force all hallway lights ON, and sound the emergency siren across all active user terminals.'
                  : 'This action will immediately CLOSE and LOCK the Rolling Door and Boom Gate, preventing any vehicles or personnel from entering the facility.'}
              </p>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowConfirm(null)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={showConfirm === 'evacuate' ? handleEvacuate : handleLockdown}
                  disabled={loading}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-lg transition-all ${
                    showConfirm === 'evacuate'
                      ? 'bg-red-600 hover:bg-red-500 shadow-red-500/30'
                      : 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/30'
                  } disabled:opacity-50`}
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {showConfirm === 'evacuate' ? 'Initiate Evacuation' : 'Engage Lockdown'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
