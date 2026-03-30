import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, MapPin, Power } from 'lucide-react';

interface LocationAlertConfig {
  location_name: string;
  alerts_enabled: boolean;
  updated_at?: string;
  updated_by?: string;
}

interface LocationAlertManagerProps {
  availableSites: string[];
  onConfigChanged?: () => void;
}

export default function LocationAlertManager({ availableSites, onConfigChanged }: LocationAlertManagerProps) {
  const [configs, setConfigs] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/location-alerts', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const configMap = new Map<string, boolean>();
        data.locations.forEach((loc: LocationAlertConfig) => {
          configMap.set(loc.location_name, loc.alerts_enabled);
        });
        availableSites.forEach(site => {
          if (!configMap.has(site)) {
            configMap.set(site, true);
          }
        });
        setConfigs(configMap);
      }
    } catch {
      const configMap = new Map<string, boolean>();
      availableSites.forEach(site => configMap.set(site, true));
      setConfigs(configMap);
    } finally {
      setLoading(false);
    }
  }, [availableSites]);

  useEffect(() => {
    if (availableSites.length > 0) {
      fetchConfig();
    }
  }, [fetchConfig, availableSites]);

  const saveConfig = async (locations: { location_name: string; alerts_enabled: boolean }[]) => {
    try {
      const res = await fetch('/api/location-alerts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations })
      });
      if (res.ok) {
        onConfigChanged?.();
      }
    } catch {
      fetchConfig();
    }
  };

  const toggleLocation = async (site: string) => {
    const newEnabled = !configs.get(site);
    const newConfigs = new Map(configs);
    newConfigs.set(site, newEnabled);
    setConfigs(newConfigs);
    setSaving(site);
    await saveConfig([{ location_name: site, alerts_enabled: newEnabled }]);
    setSaving(null);
  };

  const enableAll = async () => {
    const updates: { location_name: string; alerts_enabled: boolean }[] = [];
    const newConfigs = new Map<string, boolean>();
    availableSites.forEach(site => {
      newConfigs.set(site, true);
      updates.push({ location_name: site, alerts_enabled: true });
    });
    setConfigs(newConfigs);
    setSaving('__all__');
    await saveConfig(updates);
    setSaving(null);
  };

  const allEnabled = availableSites.every(site => configs.get(site) !== false);

  if (loading || availableSites.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg mb-6 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-blue-600" />
          Alertas por Ubicacion
        </h3>
        <button
          onClick={enableAll}
          disabled={allEnabled || saving === '__all__'}
          className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            allEnabled
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
          }`}
        >
          <Power className="h-3.5 w-3.5" />
          {saving === '__all__' ? 'Activando...' : 'Activar Todas'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {availableSites.map(site => {
          const enabled = configs.get(site) !== false;
          const isSaving = saving === site;

          return (
            <button
              key={site}
              onClick={() => toggleLocation(site)}
              disabled={isSaving}
              className={`group relative flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all ${
                enabled
                  ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
              } ${isSaving ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
            >
              <div className="flex items-center gap-2">
                {enabled ? (
                  <Bell className="h-4 w-4 text-emerald-600" />
                ) : (
                  <BellOff className="h-4 w-4 text-gray-400" />
                )}
                <span className={`text-sm font-medium ${
                  enabled ? 'text-emerald-800' : 'text-gray-500'
                }`}>
                  {site}
                </span>
              </div>

              <div
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  enabled ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
