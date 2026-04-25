import type {
  DamageType,
  NearbyOutage,
  NearbyReport,
  ServiceType,
} from '@clearwire/supabase';

export interface ReportFilters {
  damageTypes: ReadonlySet<DamageType>;
  serviceTypes: ReadonlySet<ServiceType>;
  orgs: ReadonlySet<string>;
}

export interface OutageFilters {
  serviceTypes: ReadonlySet<ServiceType>;
  orgs: ReadonlySet<string>;
}

export function filterReports(
  reports: readonly NearbyReport[],
  filters: ReportFilters
): NearbyReport[] {
  return reports.filter((r) => {
    if (filters.damageTypes.size > 0 && !filters.damageTypes.has(r.damage_type)) {
      return false;
    }
    if (filters.serviceTypes.size > 0) {
      // Report must have at least one selected service in its services_affected.
      if (!r.services_affected || r.services_affected.length === 0) return false;
      const matches = r.services_affected.some((s) => filters.serviceTypes.has(s));
      if (!matches) return false;
    }
    if (filters.orgs.size > 0) {
      if (!r.affected_company) return false;
      if (!filters.orgs.has(r.affected_company)) return false;
    }
    return true;
  });
}

export function filterOutages(
  outages: readonly NearbyOutage[],
  filters: OutageFilters
): NearbyOutage[] {
  return outages.filter((o) => {
    if (
      filters.serviceTypes.size > 0 &&
      !filters.serviceTypes.has(o.service_type)
    ) {
      return false;
    }
    if (filters.orgs.size > 0 && !filters.orgs.has(o.provider_company)) {
      return false;
    }
    return true;
  });
}

/** Unique organizations across damage (affected_company) + outage (provider_company). */
export function collectOrgs(
  reports: readonly NearbyReport[],
  outages: readonly NearbyOutage[]
): string[] {
  const set = new Set<string>();
  reports.forEach((r) => r.affected_company && set.add(r.affected_company));
  outages.forEach((o) => o.provider_company && set.add(o.provider_company));
  return Array.from(set).sort();
}
