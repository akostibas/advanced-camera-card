import { afterEach, describe, expect, it } from 'vitest';

import {
  matchesWhatFilter,
  whatFilter,
} from '../../../src/components-lib/timeline/what-filter';
import { ViewMediaType } from '../../../src/view/item';
import { TestViewMedia } from '../../view/test-utils';

const clip = (what: string[] | null) => new TestViewMedia({ what });

describe('matchesWhatFilter', () => {
  afterEach(() => whatFilter.clear());

  it('should show everything when nothing is ticked', () => {
    expect(matchesWhatFilter(clip(['motion']))).toBe(true);
  });

  it('should match any ticked category', () => {
    whatFilter.add('person').add('animal');
    expect(matchesWhatFilter(clip(['motion', 'person']))).toBe(true);
    expect(matchesWhatFilter(clip(['face']))).toBe(true);
    expect(matchesWhatFilter(clip(['animal']))).toBe(true);
    expect(matchesWhatFilter(clip(['vehicle']))).toBe(false);
    expect(matchesWhatFilter(clip(['motion']))).toBe(false);
  });

  it('should treat clips without a person, vehicle or animal as other', () => {
    whatFilter.add('other');
    expect(matchesWhatFilter(clip(null))).toBe(true);
    expect(matchesWhatFilter(clip(['motion']))).toBe(true);
    expect(matchesWhatFilter(clip(['motion', 'vehicle']))).toBe(false);
  });

  it('should never hide recordings', () => {
    whatFilter.add('person');
    expect(
      matchesWhatFilter(new TestViewMedia({ mediaType: ViewMediaType.Recording })),
    ).toBe(true);
  });
});
