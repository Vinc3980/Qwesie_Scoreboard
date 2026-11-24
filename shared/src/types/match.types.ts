export type TeamId = 'A' | 'B';
export type MatchStatus = 'SCHEDULED' | 'READY' | 'LIVE' | 'PAUSED' | 'BETWEEN_SETS' | 'SUSPENDED' | 'COMPLETED' | 'CANCELLED' | 'FINISHED';

export interface TeamBrand {
  id?: string;
  name: string;
  shortName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  textColor?: string | null;
}

export interface VolleyballStats {
  kill: number;
  error: number;
  ace: number;
  block: number;
  dig: number;
  assist: number;
  side_out: number;
  sideout_attempts?: number;
  sideout_wins?: number;
}

export interface PlayerOnCourt {
  id?: string;
  jerseyNumber?: number | string | null;
  name?: string;
  position?: string | null;
  isCaptain?: boolean;
  isLibero?: boolean;
  /** Per-match player stats (points, kill, ace, block, dig, …) for graphics/MVP. */
  stats?: Record<string, number>;
}

export interface TeamMatchState {
  id?: string;
  name: string;
  shortName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  textColor?: string | null;
  score: number;
  sets: number;
  timeouts: number; // remaining
  timeoutsUsed: number;
  timeoutsPerSet: number;
  substitutionsUsed?: number;
  substitutionsPerSet?: number;
  stats: VolleyballStats;
  lineup: PlayerOnCourt[]; // on-court in rotation order (1..6)
  bench: PlayerOnCourt[];
  rotationOrder: Array<string | number | null>; // 1..6
  serverPosition: number | null; // 1..6
}

export interface SetHistoryItem {
  number: number;
  scoreA: number;
  scoreB: number;
  winner: TeamId | null;
  pendingEnd?: boolean;
}

export interface MatchFlags {
  setPoint: TeamId | null;
  matchPoint: TeamId | null;
  setWon: TeamId | null;
  matchWon: TeamId | null;
  pendingEnd: boolean;
  courtSwitchDue: boolean;
  isDecidingSet: boolean;
  technicalTimeoutDue: boolean;
}

export interface MatchEventData {
  id?: string;
  seq?: number;
  team: TeamId | null;
  action: string;
  time: string;
  payload?: any;
  playerId?: string | null;
  clientEventId?: string | null;
}

export interface MatchState {
  id: string;
  status: MatchStatus;
  winner: TeamId | null;
  teams: {
    A: TeamMatchState;
    B: TeamMatchState;
  };
  current_set: number;
  max_sets: number;
  set_scores: {
    A: number[];
    B: number[];
  };
  setHistory: SetHistoryItem[];
  server: TeamId;
  tournament: string;
  division: string;
  court: string;
  venueType?: string | null;
  competitionId?: string | null;
  tournamentId?: string | null;
  match_no: string;
  match_date: string;
  scheduledAt?: string | null;
  referee1: string;
  referee2: string;
  started_at: string;
  ended_at: string | null;
  server_time: string;
  events: MatchEventData[];
  flags: MatchFlags;
  revision: number;
  lastEvent: MatchEventData | null;
  rules: {
    bestOfSets: number;
    setsToWin: number;
    regularSetPoints: number;
    finalSetPoints: number;
    minPointDifference: number;
    rallyScoring: boolean;
    timeoutsPerSet: number;
    substitutionsPerSet: number;
    confirmSetEnd: boolean;
  };
}

export type RulesetPreset = 'FIVB_BO5' | 'BO3' | 'CUSTOM';
export type VenueType = 'INDOOR' | 'BEACH' | 'OUTDOOR' | string;

export interface MatchSetupInput {
  homeTeamId?: string;
  awayTeamId?: string;
  competitionId?: string;
  tournamentId?: string;
  team_a?: string; // legacy compatibility
  team_b?: string; // legacy compatibility
  tournament?: string; // legacy/display fallback
  division?: string;
  court?: string;
  venueType?: VenueType;
  match_no?: string;
  match_date?: string; // legacy date-only
  scheduledAt?: string; // full date-time ISO/local accepted by server
  ruleset?: RulesetPreset;
  bestOfSets?: number;
  setsToWin?: number;
  regularSetPoints?: number;
  finalSetPoints?: number;
  minPointDifference?: number; // win-by
  timeoutsPerSet?: number;
  substitutionsPerSet?: number;
  confirmSetEnd?: boolean;
  referee1?: string;
  referee2?: string;
}

export interface StartSetInput {
  setNumber?: number;
  servingSide?: TeamId;
}

export interface MatchInfoInput {
  match_no?: string;
  match_date?: string;
  scheduledAt?: string;
  referee1?: string;
  referee2?: string;
}

export interface PointMutationInput {
  team: TeamId;
  delta?: 1 | -1;
  clientEventId?: string;
}

export interface ActionMutationInput {
  team: TeamId;
  action: string;
  playerId?: string;
  clientEventId?: string;
}

export interface TimeoutMutationInput {
  team: TeamId;
  clientEventId?: string;
}

export interface SubstitutionMutationInput {
  team: TeamId;
  out?: string;
  in?: string;
  playerOutId?: string;
  playerInId?: string;
  clientEventId?: string;
}

export interface UndoMutationInput {
  clientEventId?: string;
}

export interface OutputSceneState {
  matchId: string;
  scene: 'PLAY' | 'SET_BREAK' | 'TIMEOUT' | 'MATCH_STATS' | 'LINEUPS' | 'HEAD_TO_HEAD' | 'PLAYER_SPOTLIGHT' | 'MATCH_MOMENTUM' | 'FINAL' | 'BREAK_SLATE';
  /** Active graphic template id, or null when showing scorebug/clear PLAY output. */
  template: string | null;
  /** Graphic payload (e.g. selected player). */
  payload: Record<string, any>;
  /** When the current graphic/template was started, or null. */
  startedAt: string | null;
  scorebug: {
    visible: boolean;
    variant?: string | null; // classic | compact | wide
    position?: string | null;
    scale?: number | null;
    showSetHistory?: boolean;
    /** SCHEDULED/READY: show the scorebug before the first serve. */
    showPreMatch?: boolean;
    showLogos?: boolean;
    showTournament?: boolean;
    tournamentLabel?: string | null;
    /** Resolved scorebug theme config for OBS/program rendering. */
    theme?: any;
    /** Resolved theme metadata. */
    themeId?: string | null;
    themeVersion?: number | null;
    themeName?: string | null;
  };
  /** Resolved scorebug theme applied to this output (match override > competition > global default > Classic). */
  scorebugTheme?: {
    id: string;
    name: string;
    version: number;
    isBuiltIn?: boolean;
    config: any;
  } | null;
  lock: boolean;
  timerEndsAt: string | null;
  autoTriggers: {
    setBreakSeconds: number;
    timeoutSeconds: number;
    setBreakEnabled: boolean;
    timeoutEnabled: boolean;
    finalEnabled: boolean;
    /** Mid-match stats after set N (0/undefined disables). */
    midMatchAfterSet?: number | null;
    midMatchSeconds?: number;
  };
  version: number;
  revision: number;
}

export interface MatchRosterEntryInput {
  playerId?: string;
  jerseyNumber: number;
  name?: string;
  position?: string | null;
  isCaptain?: boolean;
  isLibero?: boolean;
}

export interface MatchLineupInput {
  players: Array<{ rotationPos: number; playerId?: string; jerseyNumber?: number }>;
  liberoId?: string | null;
}

export interface RosterBulkRow {
  raw: string;
  jerseyNumber?: number;
  name?: string;
  position?: string | null;
  valid: boolean;
  errors: string[];
}

export interface RosterBulkParseResult {
  rows: RosterBulkRow[];
  validCount: number;
  errorCount: number;
}

export interface ReadinessChecklistItem {
  key: string;
  ok: boolean;
  message: string;
}

export interface MatchReadiness {
  matchId: string;
  ready: boolean;
  canGoLive: boolean;
  checklist: ReadinessChecklistItem[];
}

export interface SystemInfo {
  version: string;
  port: number;
  lanIpv4: string[];
  connectedClients: {
    total: number;
    byType: {
      scorebug: number;
      graphics: number;
      console: number;
      other: number;
    };
  };
}
