import React, { useState, useEffect, useMemo } from 'react';
import {
  Server,
  Save,
  RefreshCw,
  TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle,
  Search,
  MessageSquare,
  X as XIcon,
} from 'lucide-react';

interface RackOverride {
  id: string;
  rack_id: string;
  threshold_key: string;
  value: number;
  unit: string | null;
  comentario: string | null;
  created_at: string;
  updated_at: string;
}

interface RackOverridesManagerProps {
  readOnly?: boolean;
}

const THRESHOLD_LABELS: Record<string, string> = {
  critical_temperature_low: 'Temperatura Critica Baja',
  critical_temperature_high: 'Temperatura Critica Alta',
  warning_temperature_low: 'Temperatura Advertencia Baja',
  warning_temperature_high: 'Temperatura Advertencia Alta',
  critical_humidity_low: 'Humedad Critica Baja',
  critical_humidity_high: 'Humedad Critica Alta',
  warning_humidity_low: 'Humedad Advertencia Baja',
  warning_humidity_high: 'Humedad Advertencia Alta',
  critical_amperage_low_single_phase: 'Amperaje Critico Bajo (1F)',
  critical_amperage_high_single_phase: 'Amperaje Critico Alto (1F)',
  warning_amperage_low_single_phase: 'Amperaje Advertencia Bajo (1F)',
  warning_amperage_high_single_phase: 'Amperaje Advertencia Alto (1F)',
  critical_amperage_low_3_phase: 'Amperaje Critico Bajo (3F)',
  critical_amperage_high_3_phase: 'Amperaje Critico Alto (3F)',
  warning_amperage_low_3_phase: 'Amperaje Advertencia Bajo (3F)',
  warning_amperage_high_3_phase: 'Amperaje Advertencia Alto (3F)',
  critical_voltage_low: 'Voltaje Critico Bajo',
  critical_voltage_high: 'Voltaje Critico Alto',
  warning_voltage_low: 'Voltaje Advertencia Bajo',
  warning_voltage_high: 'Voltaje Advertencia Alto',
};

export default function RackOverridesManager({ readOnly = false }: RackOverridesManagerProps) {
  const [overrides, setOverrides] = useState<RackOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchOverrides = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/rack-threshold-overrides', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Error al obtener los umbrales por rack');
      }
      const json = await response.json();
      setOverrides(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los umbrales por rack');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverrides();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return overrides;
    return overrides.filter((o) => {
      const label = THRESHOLD_LABELS[o.threshold_key] || o.threshold_key;
      return (
        o.rack_id.toLowerCase().includes(term) ||
        o.threshold_key.toLowerCase().includes(term) ||
        label.toLowerCase().includes(term) ||
        (o.comentario || '').toLowerCase().includes(term)
      );
    });
  }, [overrides, search]);

  const startEdit = (o: RackOverride) => {
    setEditingId(o.id);
    setEditingValue(o.comentario || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const saveComment = async (id: string) => {
    try {
      setSavingId(id);
      setError(null);
      setSuccess(null);
      const response = await fetch(`/api/rack-threshold-overrides/${id}/comentario`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario: editingValue }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Error al guardar el comentario');
      }
      setOverrides((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, comentario: editingValue, updated_at: new Date().toISOString() }
            : item
        )
      );
      setSuccess('Comentario actualizado correctamente');
      cancelEdit();
      setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el comentario');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Server className="h-5 w-5 mr-2 text-blue-600" />
          Umbrales Especificos por Rack
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar rack, umbral o comentario..."
              className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-72"
            />
          </div>
          <button
            onClick={fetchOverrides}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            title="Actualizar listado"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {readOnly && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start">
          <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Solo lectura:</span> El rol Observador no puede modificar comentarios.
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
          <AlertTriangle className="h-5 w-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-start">
          <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-green-700">{success}</div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
          <p className="text-gray-600 text-sm">Cargando umbrales por rack...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
          <Server className="h-10 w-10 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            {overrides.length === 0
              ? 'No hay umbrales especificos por rack registrados.'
              : 'Ningun resultado coincide con la busqueda.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Rack
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Umbral
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Valor
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Comentario
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actualizado
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map((o) => {
                const label = THRESHOLD_LABELS[o.threshold_key] || o.threshold_key;
                const isEditing = editingId === o.id;
                const isCritical = o.threshold_key.startsWith('critical_');
                return (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {o.rack_id}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            isCritical ? 'bg-red-500' : 'bg-amber-500'
                          }`}
                        />
                        <div>
                          <div className="font-medium text-gray-900">{label}</div>
                          <div className="text-xs text-gray-500">{o.threshold_key}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-gray-900 whitespace-nowrap">
                      {Number(o.value).toString()}
                      {o.unit ? <span className="text-xs text-gray-500 ml-1">{o.unit}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-md">
                      {isEditing ? (
                        <textarea
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          rows={2}
                          className="w-full text-sm border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Agregar un comentario..."
                        />
                      ) : o.comentario ? (
                        <div className="flex items-start gap-1">
                          <MessageSquare className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span className="whitespace-pre-wrap break-words">{o.comentario}</span>
                        </div>
                      ) : (
                        <span className="text-xs italic text-gray-400">Sin comentario</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(o.updated_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm whitespace-nowrap">
                      {readOnly ? (
                        <span className="text-xs italic text-gray-400">Sin acciones</span>
                      ) : isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => saveComment(o.id)}
                            disabled={savingId === o.id}
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                          >
                            <Save className="h-3.5 w-3.5 mr-1" />
                            {savingId === o.id ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={savingId === o.id}
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <XIcon className="h-3.5 w-3.5 mr-1" />
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(o)}
                          className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100"
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1" />
                          {o.comentario ? 'Editar' : 'Agregar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
