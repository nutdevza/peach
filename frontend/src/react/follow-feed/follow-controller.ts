import { FOLLOW_RANDOM_SORT, type FollowFeedActions, type FollowFeedHelpers, type FollowFeedProps, type FollowView } from './follow-feed';
import { followViewPath, readFollowView } from './follow-view';

export interface FollowSession {
  discoverySeed: number;
  revision: number;
  scrollY: number;
}
export type FollowPreferences = Pick<FollowFeedProps, 'selectMode' | 'selected' | 'photoSize' | 'photoLayout' | 'imagesOnly'>;

/** Address claiming, session storage and host actions are each provided by a single owner. */
export interface FollowControllerPorts {
  location(): { pathname: string; search: string };
  view(): FollowView;
  adoptView(view: FollowView): void;
  session(): FollowSession;
  writeSession(patch: Partial<FollowSession>): void;
  preferences(): FollowPreferences;
  live(): boolean;
  push(patch: Partial<FollowFeedProps>): void;
  route(path: string): void;
  openPage(path: string): void;
  rollSeed(): number;
  enterSeed(): number;
  revealFeed(): void;
  syncPhotoWalls(): void;
  scrollTop(): void;
}

export function createFollowController(ports: FollowControllerPorts, helpers: FollowFeedHelpers,
  delegated: Omit<FollowFeedActions, 'route' | 'shuffle'>) {
  const read = () => {
    const view = readFollowView(ports.location().search, ports.view().seed, ports.rollSeed);
    ports.adoptView(view);
    return view;
  };
  const push = (patch: Partial<FollowFeedProps>) => { if (ports.live()) ports.push(patch) };
  const route = (view: FollowView, patch: Partial<FollowFeedProps> = {}) => {
    ports.adoptView(view);
    ports.route(followViewPath(view));
    push({ ...patch, view: ports.view() });
    ports.syncPhotoWalls();
  };
  const shuffle = () => {
    const seed = ports.rollSeed();
    ports.writeSession({ discoverySeed: seed });
    route({ ...ports.view(), seed, sort: FOLLOW_RANDOM_SORT }, { seed: ports.session().discoverySeed });
  };
  // Action objects keep their identity across props pushes, so the card's memo does not bust on in-page filter changes.
  const actions: FollowFeedActions = { ...delegated, route, shuffle };
  const props = (): FollowFeedProps => {
    const session = ports.session(), preferences = ports.preferences();
    return { ...preferences, selected: new Set(preferences.selected), view: ports.view(),
      seed: session.discoverySeed, revision: session.revision, helpers, actions };
  };
  return {
    actions, props, read, route, shuffle,
    refresh(restored?: Pick<FollowFeedProps, 'view' | 'seed' | 'revision'>): boolean {
      if (restored) {
        ports.adoptView(restored.view);
        ports.writeSession({ discoverySeed: restored.seed, revision: restored.revision });
      }
      const view = read();
      if (!ports.live()) return false;
      ports.revealFeed();
      push({ view, seed: ports.session().discoverySeed, revision: ports.session().revision });
      ports.syncPhotoWalls();
      return true;
    },
    enter(fresh = false): void {
      if (fresh) {
        ports.writeSession({ discoverySeed: ports.enterSeed(), scrollY: 0,
          revision: ports.session().revision + 1 });
        ports.openPage('/follow');
      } else if (ports.location().pathname !== '/follow') ports.openPage(followViewPath(ports.view()));
    },
  };
}

/** The profile page's online cards reuse the detail and preference actions; page-level filters, the drawer and local multi-select are each owned by the profile page. */
export function entityFollowActions(actions: FollowFeedActions): FollowFeedActions {
  return { ...actions, route: () => {}, shuffle: () => {}, loaded: () => {}, toggleSelection: () => {} };
}
