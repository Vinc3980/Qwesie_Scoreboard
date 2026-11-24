export const MAX_SETS = 5;
export const SETS_TO_WIN = 3;
export const TIMEOUTS_PER_SET = 2;
export const EVENT_LIMIT = 50;

export const SCORING_ACTIONS = ['KILL', 'ACE', 'BLOCK'] as const;
export const NON_SCORING_ACTIONS = ['DIG', 'ASSIST'] as const;
export const OPPONENT_SCORING_ACTIONS = ['ATTACK ERROR'] as const;

export const ALL_VOLLEYBALL_ACTIONS = [
  'KILL',
  'ACE',
  'BLOCK',
  'DIG',
  'ASSIST',
  'ATTACK ERROR',
  'POINT',
  'TIMEOUT',
  'SUBSTITUTION',
  'SET WON',
] as const;

export const ACTION_STAT_MAP: Record<string, string> = {
  KILL: 'kill',
  ACE: 'ace',
  BLOCK: 'block',
  DIG: 'dig',
  'ATTACK ERROR': 'error',
  ASSIST: 'assist',
};

export const DEFAULT_TOURNAMENT = 'GREATER ACCRA VOLLEYBALL LEAGUE';
export const DEFAULT_DIVISION = "MEN'S DIVISION";
export const DEFAULT_COURT = 'COURT 1';
export const DEFAULT_MATCH_NO = '24';
export const DEFAULT_TEAMS = {
  A: 'ELWAK WINGS',
  B: 'GHANA NAVY',
} as const;
