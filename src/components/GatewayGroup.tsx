import React from 'react';
import { Network, ChevronUp, ChevronDown } from 'lucide-react';
import CombinedRackCard from './CombinedRackCard';
import { RackData } from '../types';

interface GatewayGroupProps {
  gwName: string;
  gwIp: string;
  pdus: RackData[];
  originalRackGroups: RackData[][];
  activeView: 'principal' | 'alertas' | 'mantenimiento';
  country: string;
  site: string;
  dc: string;
  rackId: string;
  isExpanded: boolean;
  onToggleExpand: (gwKey: string) => void;
  getThresholdValue: (key: string) => number | undefined;
  getMetricStatusColor: (
    value: number,
    criticalLow: number,
    criticalHigh: number,
    warningLow: number,
    warningHigh: number
  ) => string;
  getAmperageStatusColor: (rack: RackData) => string;
  activeStatusFilter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance';
  onStatusFilterChange: (filter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance') => void;
  onConfigureThresholds?: (rackId: string, rackName: string) => void;
  onSendRackToMaintenance?: (rackId: string, chain: string, rackName: string, rackData?: any) => void;
  onSendChainToMaintenance?: (chain: string, site: string, dc: string, rackData?: any) => void;
  onSendAlertToSonar?: (rackId: string, rackName: string) => void;
  maintenanceRacks: Set<string>;
  expandedRackNames: Set<string>;
  onToggleRackExpansion: (rackName: string) => void;
}

export default function GatewayGroup({
  gwName,
  gwIp,
  pdus,
  activeView,
  country,
  site,
  dc,
  rackId,
  isExpanded,
  onToggleExpand,
  getThresholdValue,
  getMetricStatusColor,
  getAmperageStatusColor,
  activeStatusFilter,
  onStatusFilterChange,
  onConfigureThresholds,
  onSendRackToMaintenance,
  onSendChainToMaintenance,
  onSendAlertToSonar,
  maintenanceRacks,
  expandedRackNames,
  onToggleRackExpansion
}: GatewayGroupProps) {

  const gwKey = `${gwName}-${gwIp}`;
  const totalPdus = pdus.length;

  const overallStatus = pdus.some(r => r.status === 'critical')
    ? 'critical'
    : pdus.some(r => r.status === 'warning')
    ? 'warning'
    : 'normal';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      case 'maintenance': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'normal': return 'Normal';
      case 'warning': return 'Advertencia';
      case 'critical': return 'Critico';
      case 'maintenance': return 'Mantenimiento';
      default: return 'Desconocido';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow space-y-4 border-2 border-cyan-600 mb-4">
      <div className="flex items-center justify-between cursor-pointer p-6" onClick={() => onToggleExpand(gwKey)}>
        <div className="flex items-center">
          <div className="bg-cyan-600 rounded-full mr-3 p-2">
            <Network className="text-white h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center mb-1">
              <span className="font-semibold text-cyan-600 uppercase tracking-wider text-xs">
                GATEWAY
              </span>
            </div>
            <h2 className="font-bold text-gray-900 text-lg">
              {gwName === 'N/A' ? 'Sin Gateway Definido' : gwName}
            </h2>
            <div className="flex items-center mt-1">
              <span className="text-gray-600 mr-2 text-sm">
                IP: {gwIp === 'N/A' ? 'No disponible' : gwIp}
              </span>
              <span className="text-gray-400 mx-2">{'\u2022'}</span>
              <span className="text-gray-600 text-sm">
                {totalPdus} PDU{totalPdus !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-1 rounded-full border px-2 py-1 ${
            overallStatus === 'critical' ? 'bg-red-100 border-red-500' :
            overallStatus === 'warning' ? 'bg-yellow-100 border-yellow-500' :
            'bg-green-100 border-green-500'
          }`}>
            <div className={`w-2 h-2 rounded-full ${getStatusColor(overallStatus)} ${
              overallStatus !== 'normal' ? 'animate-pulse' : ''
            }`}></div>
            <span className={`font-medium text-xs ${
              overallStatus === 'critical' ? 'text-red-800' :
              overallStatus === 'warning' ? 'text-yellow-800' :
              'text-green-800'
            }`}>
              {getStatusText(overallStatus)}
            </span>
          </div>

          <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            {isExpanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-6">
          <CombinedRackCard
            racks={pdus}
            overallStatus={overallStatus}
            getThresholdValue={getThresholdValue}
            getMetricStatusColor={getMetricStatusColor}
            getAmperageStatusColor={getAmperageStatusColor}
            onConfigureThresholds={onConfigureThresholds}
            onSendRackToMaintenance={onSendRackToMaintenance}
            onSendChainToMaintenance={onSendChainToMaintenance}
            onSendAlertToSonar={onSendAlertToSonar}
            maintenanceRacks={maintenanceRacks}
            isExpanded={expandedRackNames.has(pdus[0]?.name || '')}
            onToggleExpansion={() => onToggleRackExpansion(pdus[0]?.name || '')}
          />
        </div>
      )}
    </div>
  );
}
