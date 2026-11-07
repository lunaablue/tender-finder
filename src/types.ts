// Shapes of the data we work with.
//
// Both government services use a standard format called OCDS (Open Contracting Data Standard).
// The types below list only the fields we use. Almost everything is optional,
// because not every notice has every field.

// One notice as it arrives from either service.
export interface Release {
  id: string;
  ocid?: string;
  date?: string;
  tag?: string[];
  buyer?: { name?: string };
  parties?: Party[];
  tender?: Tender;
}

export interface Party {
  name?: string;
  roles?: string[];
  address?: { region?: string };
}

// A code from a standard list, such as a CPV code (the list of what is being bought).
export interface Classification {
  scheme?: string;
  id?: string;
  description?: string;
}

export interface Tender {
  title?: string;
  description?: string;
  value?: { amount?: number; currency?: string };
  tenderPeriod?: { endDate?: string };
  mainProcurementCategory?: string;
  classification?: Classification;
  items?: Array<{
    classification?: Classification;
    additionalClassifications?: Classification[];
    deliveryAddresses?: Array<{ region?: string }>;
  }>;
  documents?: Array<{ url?: string; datePublished?: string }>;
}

// Which service a notice came from.
export type Source = "find-tender" | "contracts-finder";

// Our common shape. Every notice from either service is turned into this.
export interface Notice {
  id: string;
  source: Source;
  ocid: string | null;
  title: string;
  description: string | null;
  buyer: string | null;
  value: number | null; // value before tax, in the currency below
  currency: string | null;
  deadline: string | null;
  stage: string; // "tender", "pipeline", "award", or the raw tag if none of those
  cpvCodes: string[];
  procurementCategory: string | null; // "services", "goods", "works", or null
  region: string | null;
  url: string | null;
  publishedDate: string | null;
}
