import type { ViewItem } from '../../view/item';
import { ViewItemClassifier } from '../../view/item-classifier';

export type WhatCategory = 'person' | 'vehicle' | 'animal' | 'other';
export const WHAT_CATEGORIES: WhatCategory[] = ['person', 'vehicle', 'animal', 'other'];

// Detection labels (lowercased media "what") per category; anything else is 'other'.
const LABELS: Record<string, WhatCategory> = {
  person: 'person',
  face: 'person',
  vehicle: 'vehicle',
  animal: 'animal',
};

// Module-wide so the full and mini timelines share one filter. Empty shows all.
export const whatFilter = new Set<WhatCategory>();

export const matchesWhatFilter = (item?: ViewItem | null): boolean => {
  // Only events/reviews carry detections; recordings and folders always pass.
  if (
    !whatFilter.size ||
    !(ViewItemClassifier.isEvent(item) || ViewItemClassifier.isReview(item))
  ) {
    return true;
  }
  const categories = (item.getWhat() ?? []).map((what) => LABELS[what]).filter(Boolean);
  return (categories.length ? categories : ['other' as const]).some((c) =>
    whatFilter.has(c),
  );
};
