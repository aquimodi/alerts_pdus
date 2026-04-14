import { RackData } from '../types';

export function groupRacksByCountry(racks: RackData[]): { [country: string]: { [site: string]: { [dc: string]: { [rackId: string]: { [gwKey: string]: RackData[] } } } } } {
  const countryGroups: { [country: string]: { [site: string]: { [dc: string]: { [rackId: string]: { [gwKey: string]: RackData[] } } } } } = {};

  if (!Array.isArray(racks)) {
    console.error('groupRacksByCountry: racks no es un array', racks);
    return {};
  }

  const racksByCountry: { [country: string]: RackData[] } = {};
  racks.forEach(rack => {
    const country = rack.country || 'N/A';
    if (!racksByCountry[country]) {
      racksByCountry[country] = [];
    }
    racksByCountry[country].push(rack);
  });

  Object.entries(racksByCountry).forEach(([country, countryRacks]) => {
    if (!countryGroups[country]) {
      countryGroups[country] = {};
    }

    const siteGroups = groupRacksBySite(countryRacks);
    Object.entries(siteGroups).forEach(([site, dcGroups]) => {
      if (!countryGroups[country][site]) {
        countryGroups[country][site] = {};
      }
      Object.entries(dcGroups).forEach(([dc, rackGroups]) => {
        countryGroups[country][site][dc] = rackGroups;
      });
    });
  });

  return countryGroups;
}

export function groupRacksBySite(racks: RackData[]): { [site: string]: { [dc: string]: { [rackId: string]: { [gwKey: string]: RackData[] } } } } {
  const siteGroups: { [site: string]: { [dc: string]: { [rackId: string]: { [gwKey: string]: RackData[] } } } } = {};

  const racksBySite: { [site: string]: RackData[] } = {};
  racks.forEach(rack => {
    const site = rack.site || 'N/A';
    if (!racksBySite[site]) {
      racksBySite[site] = [];
    }
    racksBySite[site].push(rack);
  });

  Object.entries(racksBySite).forEach(([site, siteRacks]) => {
    if (!siteGroups[site]) {
      siteGroups[site] = {};
    }

    const dcGroups = groupRacksByDc(siteRacks);
    Object.entries(dcGroups).forEach(([dc, rackGroups]) => {
      siteGroups[site][dc] = rackGroups;
    });
  });

  return siteGroups;
}

export function groupRacksByDc(racks: RackData[]): { [dc: string]: { [rackId: string]: { [gwKey: string]: RackData[] } } } {
  const dcGroups: { [dc: string]: { [rackId: string]: { [gwKey: string]: RackData[] } } } = {};

  const racksByDc: { [dc: string]: RackData[] } = {};
  racks.forEach(rack => {
    const dc = rack.dc || 'N/A';
    if (!racksByDc[dc]) {
      racksByDc[dc] = [];
    }
    racksByDc[dc].push(rack);
  });

  Object.entries(racksByDc).forEach(([dc, dcRacks]) => {
    dcGroups[dc] = groupByRackThenGateway(dcRacks);
  });

  return dcGroups;
}

export function groupByRackThenGateway(racks: RackData[]): { [rackId: string]: { [gwKey: string]: RackData[] } } {
  const result: { [rackId: string]: { [gwKey: string]: RackData[] } } = {};

  if (!Array.isArray(racks)) {
    console.error('groupByRackThenGateway: racks no es un array', racks);
    return {};
  }

  racks.forEach(rack => {
    const rackId = rack.rackId || rack.id;
    const gwName = rack.gwName || 'N/A';
    const gwIp = rack.gwIp || 'N/A';
    const gwKey = `${gwName}-${gwIp}`;

    if (!result[rackId]) {
      result[rackId] = {};
    }
    if (!result[rackId][gwKey]) {
      result[rackId][gwKey] = [];
    }
    result[rackId][gwKey].push(rack);
  });

  return result;
}

export function filterRacks(
  racks: RackData[],
  statusFilter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance',
  countryFilter: string = 'all',
  siteFilter: string = 'all',
  dcFilter: string = 'all',
  gwFilter: string = 'all',
  searchQuery: string = '',
  searchField: string = 'all',
  metricFilter: string = 'all',
  showAllRacks: boolean = false,
  maintenanceRacks: Set<string> = new Set()
): RackData[] {
  let filteredRacks = racks;

  if (searchQuery.trim() !== '') {
    const lowercaseQuery = searchQuery.toLowerCase().trim();
    filteredRacks = filteredRacks.filter(rack => {
      if (searchField === 'all') {
        const searchableFields = [
          rack.site,
          rack.country,
          rack.dc,
          rack.node,
          rack.chain,
          rack.name,
          rack.serial
        ];

        return searchableFields.some(field =>
          field && String(field).toLowerCase().includes(lowercaseQuery)
        );
      }

      let fieldValue = '';
      switch (searchField) {
        case 'site':
          fieldValue = String(rack.site || '');
          break;
        case 'country':
          fieldValue = String(rack.country || '');
          break;
        case 'dc':
          fieldValue = String(rack.dc || '');
          break;
        case 'node':
          fieldValue = String(rack.node || '');
          break;
        case 'chain':
          fieldValue = String(rack.chain || '');
          break;
        case 'name':
          fieldValue = String(rack.name || '');
          break;
        case 'serial':
          fieldValue = String(rack.serial || '');
          break;
        default:
          return true;
      }

      return fieldValue.toLowerCase().includes(lowercaseQuery);
    });
  }

  if (countryFilter !== 'all') {
    filteredRacks = filteredRacks.filter(rack => rack.country === countryFilter);
  }

  if (siteFilter !== 'all') {
    filteredRacks = filteredRacks.filter(rack => rack.site === siteFilter);
  }

  if (dcFilter !== 'all') {
    filteredRacks = filteredRacks.filter(rack => rack.dc === dcFilter);
  }

  if (gwFilter !== 'all') {
    filteredRacks = filteredRacks.filter(rack => {
      const gwName = rack.gwName || 'N/A';
      const gwIp = rack.gwIp || 'N/A';
      const gwKey = `${gwName}-${gwIp}`;
      return gwKey === gwFilter;
    });
  }

  const isRackInMaintenance = (rack: RackData): boolean => {
    const rackName = String(rack.name || '').trim();
    const rackId = String(rack.rackId || rack.id || '').trim();
    return (rackName && maintenanceRacks.has(rackName)) || (rackId && maintenanceRacks.has(rackId));
  };

  if (showAllRacks) {
    if (statusFilter !== 'all') {
      if (statusFilter === 'maintenance') {
        filteredRacks = filteredRacks.filter(rack => isRackInMaintenance(rack));
      } else {
        filteredRacks = filteredRacks.filter(rack => {
          return !isRackInMaintenance(rack) && rack.status === statusFilter;
        });
      }
    }
  } else {
    filteredRacks = filteredRacks.filter(rack => {
      const isInMaintenance = isRackInMaintenance(rack);
      const hasAlert = rack.status === 'critical' || rack.status === 'warning';

      if (isInMaintenance) {
        return false;
      }

      return hasAlert;
    });

    if (statusFilter !== 'all') {
      filteredRacks = filteredRacks.filter(rack => {
        return rack.status === statusFilter;
      });
    }
  }

  if (metricFilter !== 'all' && statusFilter !== 'all' && !showAllRacks) {
    filteredRacks = filteredRacks.filter(rack => {
      if (!rack.reasons || rack.reasons.length === 0) {
        return false;
      }

      const hasSpecificMetricAlert = rack.reasons.some(reason => {
        const hasStatusMatch = reason.startsWith(`${statusFilter}_`);
        const hasMetricMatch = reason.includes(metricFilter);
        return hasStatusMatch && hasMetricMatch;
      });

      return hasSpecificMetricAlert;
    });
  }

  return filteredRacks;
}
