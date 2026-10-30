import { add } from 'date-fns';
import { LitElement } from 'lit';
import type { TimelineEventPropertiesResult, TimelineWindow } from 'vis-timeline';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { CameraManager } from '../../../src/camera-manager/manager';
import type { FoldersManager } from '../../../src/card-controller/folders/manager';
import type {
  ViewManagerEpoch,
  ViewManagerInterface,
} from '../../../src/card-controller/view/types';
import { TimelineController } from '../../../src/components-lib/timeline/controller';
import type { AdvancedCameraCardTimelineItem } from '../../../src/components-lib/timeline/source';
import type {
  ExtendedTimeline,
  TimelineRangeChange,
} from '../../../src/components-lib/timeline/types';
import type { ConditionStateManagerReadonlyInterface } from '../../../src/condition-trigger/conditions/types';
import type {
  TimelineCoreComponentConfig,
  TimelinePanMode,
} from '../../../src/config/schema/common/controls/timeline';
import { ViewMediaType, type ViewMedia } from '../../../src/view/item';
import { QueryResults } from '../../../src/view/query-results';
import { UnifiedQuery } from '../../../src/view/unified-query';
import { createCameraManager, createStore } from '../../camera-manager/test-utils';
import { createHASS, stubMatchMedia } from '../../test-utils';
import { createReviewQuery, createView, TestViewMedia } from '../../view/test-utils';

// Vitest hoists vi.mock above this, so its factory can only reach a vi.hoisted value.
const { timelineConstructor } = vi.hoisted(() => ({
  timelineConstructor: vi.fn(),
}));
vi.mock('vis-timeline', () => ({
  Timeline: timelineConstructor,
}));

const CAMERA_ID = 'camera-1';

// The window the mocked timeline reports for the duration of every test.
const WINDOW: TimelineWindow = {
  start: new Date('2026-09-01T12:00:00Z'),
  end: new Date('2026-09-01T13:00:00Z'),
};

class TimelineControllerTestHost extends LitElement {}
customElements.define(
  'advanced-camera-card-timeline-controller-test-host',
  TimelineControllerTestHost,
);

const createTimelineConfig = (
  panMode: TimelinePanMode,
  style: 'ribbon' | 'stack' = 'ribbon',
): TimelineCoreComponentConfig => ({
  clustering_threshold: 3,
  window_seconds: 60 * 60,
  show_recordings: false,
  style,
  format: { '24h': true },
  pan_mode: panMode,
});

interface TestHarness {
  controller: TimelineController;
  timeline: ExtendedTimeline;
  manager: ViewManagerInterface;
  cameraManager: CameraManager;
  trigger: (event: string, ...args: unknown[]) => void;
}

const createHarness = async (options?: {
  panMode?: TimelinePanMode;
  media?: ViewMedia[];
  mini?: boolean;
  style?: 'ribbon' | 'stack';
  limit?: number;
}): Promise<TestHarness> => {
  stubMatchMedia().mockReturnValue({ matches: true });

  const handlers = new Map<string, (...args: unknown[]) => void>();
  const selection: string[] = [];

  const timeline = mock<ExtendedTimeline>();
  timeline.on.mockImplementation((event?: string, callback?): void => {
    if (event && callback) {
      handlers.set(event, callback);
    }
  });
  timeline.getWindow.mockReturnValue(WINDOW);
  timeline.getSelection.mockReturnValue(selection);
  timeline.setSelection.mockImplementation((ids): void => {
    selection.length = 0;
    selection.push(...(Array.isArray(ids) ? ids.map(String) : [String(ids)]));
  });
  timelineConstructor.mockImplementation(function () {
    return timeline;
  });

  const cameraManager = createCameraManager(createStore([{ cameraID: CAMERA_ID }]));
  vi.mocked(cameraManager.getCameraMetadata).mockReturnValue({
    title: 'Camera Title',
    icon: { icon: 'mdi:camera' },
  });
  vi.mocked(cameraManager.executeMediaQueries).mockResolvedValue([]);

  const query = new UnifiedQuery();
  query.addNode(createReviewQuery(CAMERA_ID, { limit: options?.limit }));

  const controller = new TimelineController(new TimelineControllerTestHost());
  controller.setHass(createHASS());
  controller.setOptions({
    cameraManager: cameraManager,
    foldersManager: mock<FoldersManager>(),
    conditionStateManager: mock<ConditionStateManagerReadonlyInterface>(),
    timelineConfig: createTimelineConfig(options?.panMode ?? 'pan', options?.style),
    mini: options?.mini ?? true,
    query,
  });
  controller.setTimelineElement(document.createElement('div'));

  const manager = mock<ViewManagerInterface>();
  manager.getView.mockReturnValue(
    createView({
      view: 'live',
      camera: CAMERA_ID,
      query: query,
      queryResults: new QueryResults({
        results: options?.media ?? [],
        selectedIndex: 0,
      }),
    }),
  );
  await controller.setView(mock<ViewManagerEpoch>({ manager: manager }));

  return {
    controller: controller,
    timeline: timeline,
    manager: manager,
    cameraManager: cameraManager,
    trigger: (event: string, ...args: unknown[]): void => {
      handlers.get(event)?.(...args);
    },
  };
};

const createEventMedia = (options?: { id?: string }): TestViewMedia =>
  new TestViewMedia({
    mediaType: ViewMediaType.Clip,
    cameraID: CAMERA_ID,
    id: options?.id ?? 'event-1',
    startTime: add(WINDOW.start, { minutes: 29 }),
    endTime: add(WINDOW.start, { minutes: 31 }),
  });

const createReviewMedia = (options?: {
  id?: string;
  startTime?: Date;
  endTime?: Date;
}): TestViewMedia =>
  new TestViewMedia({
    mediaType: ViewMediaType.Review,
    cameraID: CAMERA_ID,
    id: options?.id ?? 'review-1',
    startTime: options?.startTime ?? add(WINDOW.start, { minutes: 29 }),
    endTime: options?.endTime ?? add(WINDOW.start, { minutes: 31 }),
  });

const dragTimeline = (harness: TestHarness, pointerTime: Date): void => {
  harness.trigger(
    'mouseDown',
    mock<TimelineEventPropertiesResult>({ time: pointerTime }),
  );

  const rangeChange: TimelineRangeChange = {
    start: WINDOW.start,
    end: WINDOW.end,
    byUser: true,
    event: new Event('pointermove'),
  };
  harness.trigger('rangechange', rangeChange);
};

// @vitest-environment jsdom
describe('TimelineController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the item severity as a data attribute', async () => {
    await createHarness();

    const options = timelineConstructor.mock.calls[0]?.at(-1);

    expect(options).toEqual(expect.objectContaining({ dataAttributes: ['severity'] }));
  });

  it('should not cap windowed queries at the view limit', async () => {
    const harness = await createHarness({ limit: 50 });

    // The limit pages the view's startup query; a window must load everything in range.
    const queries = vi
      .mocked(harness.cameraManager.executeMediaQueries)
      .mock.calls.flatMap((call) => call[0]);
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      expect(query.limit).toBeUndefined();
    }
  });

  describe('should re-fetch today while it is in view', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const getUncachedFetches = (harness: TestHarness): number =>
      vi
        .mocked(harness.cameraManager.executeMediaQueries)
        .mock.calls.filter((call) => call[1]?.useCache === false).length;

    it('soon after opening, then every minute', async () => {
      vi.useFakeTimers({
        now: add(WINDOW.end, { minutes: 10 }),
        toFake: ['setTimeout', 'setInterval', 'Date'],
      });
      const harness = await createHarness();
      expect(getUncachedFetches(harness)).toBe(0);

      await vi.advanceTimersByTimeAsync(5 * 1000);
      expect(getUncachedFetches(harness)).toBe(1);

      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(getUncachedFetches(harness)).toBe(2);

      harness.controller.destroyTimeline();
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(getUncachedFetches(harness)).toBe(2);
    });

    it('and keep the scroll limit an hour past now', async () => {
      const now = add(WINDOW.end, { days: 2 });
      vi.useFakeTimers({ now, toFake: ['setTimeout', 'setInterval', 'Date'] });
      const harness = await createHarness();
      expect(timelineConstructor.mock.calls[0]?.at(-1).max).toEqual(
        add(now, { hours: 1 }),
      );

      await vi.advanceTimersByTimeAsync(65 * 1000);
      expect(harness.timeline.setOptions).toHaveBeenLastCalledWith({
        max: add(now, { hours: 1, seconds: 65 }),
      });
    });

    it('but not when looking at an earlier day', async () => {
      vi.useFakeTimers({
        now: add(WINDOW.end, { days: 2 }),
        toFake: ['setTimeout', 'setInterval', 'Date'],
      });
      const harness = await createHarness();

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(getUncachedFetches(harness)).toBe(0);
    });
  });

  describe('should decide what can be clustered', () => {
    const createItem = (
      media: ViewMedia,
      type: 'range' | 'background' = 'range',
    ): AdvancedCameraCardTimelineItem => ({
      id: media.getID() ?? '',
      group: CAMERA_ID,
      content: '',
      start: WINDOW.start.getTime(),
      type,
      media,
      query: new UnifiedQuery(),
    });

    const getCriteria = async (
      media?: ViewMedia[],
    ): Promise<
      (
        first: AdvancedCameraCardTimelineItem,
        second: AdvancedCameraCardTimelineItem,
      ) => boolean
    > => {
      await createHarness({ style: 'stack', media });
      return timelineConstructor.mock.calls[0]?.at(-1).cluster.clusterCriteria;
    };

    it('should cluster two reviews', async () => {
      const criteria = await getCriteria();

      expect(
        criteria(
          createItem(createReviewMedia({ id: 'review-1' })),
          createItem(createReviewMedia({ id: 'review-2' })),
        ),
      ).toBe(true);
    });

    it('should not cluster a review with an event', async () => {
      const criteria = await getCriteria();

      expect(
        criteria(createItem(createReviewMedia()), createItem(createEventMedia())),
      ).toBe(false);
    });

    it('should cluster two events', async () => {
      const criteria = await getCriteria();

      expect(
        criteria(
          createItem(createEventMedia({ id: 'event-1' })),
          createItem(createEventMedia({ id: 'event-2' })),
        ),
      ).toBe(true);
    });

    it('should not cluster a recording', async () => {
      const criteria = await getCriteria();

      expect(
        criteria(
          createItem(createReviewMedia({ id: 'review-1' }), 'background'),
          createItem(createReviewMedia({ id: 'review-2' }), 'background'),
        ),
      ).toBe(false);
    });

    it('should not cluster an item with a recording', async () => {
      const criteria = await getCriteria();

      expect(
        criteria(
          createItem(createReviewMedia({ id: 'review-1' })),
          createItem(createReviewMedia({ id: 'review-2' }), 'background'),
        ),
      ).toBe(false);
    });

    it('should not cluster the selected item', async () => {
      const selected = createReviewMedia({ id: 'review-1' });
      const criteria = await getCriteria([selected]);

      expect(
        criteria(
          createItem(selected),
          createItem(createReviewMedia({ id: 'review-2' })),
        ),
      ).toBe(false);
    });

    it('should not cluster an item that carries no media', async () => {
      const criteria = await getCriteria();
      const withoutMedia: AdvancedCameraCardTimelineItem = {
        id: 'no-media',
        group: CAMERA_ID,
        content: '',
        start: WINDOW.start.getTime(),
        type: 'range',
      };

      expect(criteria(withoutMedia, createItem(createReviewMedia()))).toBe(false);
      expect(criteria(createItem(createReviewMedia()), withoutMedia)).toBe(false);
    });
  });

  describe('should set the target bar during a drag', () => {
    // The time the pointer is pressed at. dragTimeline() leaves the window where
    // it was, so the controller places the target bar at this same time.
    const POINTER_TIME = add(WINDOW.start, { minutes: 30 });

    it.each([
      ['pan' as const, false],
      ['seek' as const, true],
      ['seek-in-camera' as const, true],
      ['seek-in-media' as const, true],
    ])('%s', async (panMode: TimelinePanMode, expectedVisible: boolean) => {
      const harness = await createHarness({ panMode: panMode });

      dragTimeline(harness, POINTER_TIME);

      if (expectedVisible) {
        expect(harness.timeline.addCustomTime).toHaveBeenCalledWith(
          POINTER_TIME,
          'target_bar',
        );
      } else {
        expect(harness.timeline.addCustomTime).not.toHaveBeenCalled();
      }
    });

    it('should set the target bar when the target time is outside the selected media', async () => {
      const harness = await createHarness({
        panMode: 'seek-in-media',
        media: [
          createReviewMedia({
            startTime: add(WINDOW.start, { minutes: 50 }),
            endTime: add(WINDOW.start, { minutes: 55 }),
          }),
        ],
      });

      dragTimeline(harness, POINTER_TIME);

      expect(harness.timeline.addCustomTime).toHaveBeenCalledWith(
        POINTER_TIME,
        'target_bar',
      );
    });

    it('should remove the target bar when the pointer is released', async () => {
      const harness = await createHarness({ panMode: 'seek' });

      dragTimeline(harness, POINTER_TIME);
      expect(harness.timeline.addCustomTime).toHaveBeenCalled();

      harness.trigger('mouseUp');
      expect(harness.timeline.removeCustomTime).toHaveBeenCalledWith('target_bar');
    });
  });

  describe('should select the media from the view', () => {
    it('should select a review', async () => {
      const harness = await createHarness({ media: [createReviewMedia()] });

      expect(harness.timeline.setSelection).toHaveBeenCalledWith(
        ['review-1'],
        expect.anything(),
      );
    });

    it('should select an event', async () => {
      const harness = await createHarness({
        media: [
          new TestViewMedia({
            mediaType: ViewMediaType.Clip,
            cameraID: CAMERA_ID,
            id: 'clip-1',
            startTime: add(WINDOW.start, { minutes: 29 }),
            endTime: add(WINDOW.start, { minutes: 31 }),
          }),
        ],
      });

      expect(harness.timeline.setSelection).toHaveBeenCalledWith(
        ['clip-1'],
        expect.anything(),
      );
    });

    it('should not select a recording', async () => {
      const harness = await createHarness({
        media: [
          new TestViewMedia({
            mediaType: ViewMediaType.Recording,
            cameraID: CAMERA_ID,
            id: 'recording-1',
            startTime: add(WINDOW.start, { minutes: 29 }),
            endTime: add(WINDOW.start, { minutes: 31 }),
          }),
        ],
      });

      expect(harness.timeline.setSelection).not.toHaveBeenCalled();
    });
  });

  describe('should handle a click on an item', () => {
    it('should seek to the clicked time within a review', async () => {
      const harness = await createHarness({ media: [createReviewMedia()] });
      const clickTime = add(WINDOW.start, { minutes: 30 });

      harness.trigger('click', {
        what: 'item',
        item: 'review-1',
        group: CAMERA_ID,
        time: clickTime,
        event: new Event('click'),
      });

      const parameters = vi.mocked(harness.manager.setViewByParameters).mock
        .calls[0]?.[0];
      const view = createView();
      parameters?.modifiers?.forEach((modifier) => modifier.modify(view));

      expect(view.context?.mediaViewer?.seek).toEqual(clickTime);
    });

    it('should zoom into a cluster on a single click', async () => {
      const harness = await createHarness({ media: [createReviewMedia()] });
      const cluster = document.createElement('div');
      cluster.className = 'vis-item vis-cluster';
      const content = document.createElement('div');
      cluster.append(content);
      const dblclick = vi.fn();
      cluster.addEventListener('dblclick', dblclick);
      const event = new Event('click');
      Object.defineProperty(event, 'target', { value: content });

      harness.trigger('click', {
        what: 'item',
        item: 'cluster-1',
        isCluster: true,
        group: CAMERA_ID,
        event,
      });

      expect(dblclick).toHaveBeenCalled();
      expect(harness.manager.setViewByParameters).not.toHaveBeenCalled();
    });
  });
});

declare global {
  interface HTMLElementTagNameMap {
    'advanced-camera-card-timeline-controller-test-host': TimelineControllerTestHost;
  }
}
