import citiesData from '@/data/pakistan-cities.json';

/**
 * Pakistan provinces and cities for school address pickers.
 *
 * City lists come from `src/data/pakistan-cities.json`. Only `city` is persisted
 * on the server; province drives the cascade in the form.
 */

export const PAKISTAN_COUNTRY_LABEL = 'Pakistan' as const;

export interface LocationOption {
  readonly value: string;
  readonly label: string;
}

export const PAKISTAN_PROVINCES: readonly LocationOption[] = [
  { value: 'punjab', label: 'Punjab' },
  { value: 'sindh', label: 'Sindh' },
  { value: 'khyber-pakhtunkhwa', label: 'Khyber Pakhtunkhwa' },
  { value: 'balochistan', label: 'Balochistan' },
  { value: 'islamabad', label: 'Islamabad Capital Territory' },
  { value: 'gilgit-baltistan', label: 'Gilgit-Baltistan' },
  { value: 'ajk', label: 'Azad Jammu and Kashmir' },
];

type PakistanCitiesRegion = {
  region: string;
  cities: string[];
  former_fata_merged_districts?: string[];
};

/** Maps JSON `region` names to stable province slugs used in the form. */
const REGION_TO_PROVINCE: Record<string, string> = {
  'Islamabad Capital Territory': 'islamabad',
  Punjab: 'punjab',
  Sindh: 'sindh',
  'Khyber Pakhtunkhwa (KPK)': 'khyber-pakhtunkhwa',
  Balochistan: 'balochistan',
  'Azad Jammu & Kashmir': 'ajk',
  'Gilgit-Baltistan': 'gilgit-baltistan',
};

function buildCitiesByProvince(): Record<string, readonly LocationOption[]> {
  const grouped: Record<string, LocationOption[]> = {};

  for (const entry of citiesData.regions as PakistanCitiesRegion[]) {
    const provinceKey = REGION_TO_PROVINCE[entry.region];
    if (provinceKey === undefined) {
      continue;
    }

    const names = [...entry.cities, ...(entry.former_fata_merged_districts ?? [])];
    grouped[provinceKey] = names
      .map((label) => ({ value: label, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'en'));
  }

  return grouped;
}

const CITIES_BY_PROVINCE = buildCitiesByProvince();

export function citiesForPakistanProvince(provinceValue: string): readonly LocationOption[] {
  return CITIES_BY_PROVINCE[provinceValue] ?? [];
}

export function provinceForPakistanCity(city: string): string | undefined {
  const normalised = city.trim().toLowerCase();
  if (normalised === '') {
    return undefined;
  }
  for (const province of PAKISTAN_PROVINCES) {
    const cities = CITIES_BY_PROVINCE[province.value];
    if (cities?.some((option) => option.label.toLowerCase() === normalised)) {
      return province.value;
    }
  }
  return undefined;
}
