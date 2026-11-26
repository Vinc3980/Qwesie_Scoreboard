import { z } from 'zod';

export const teamIdSchema = z.enum(['A', 'B'], {
  errorMap: () => ({ message: "team must be 'A' or 'B'" }),
});

export const sideParamSchema = z.enum(['A', 'B', 'HOME', 'AWAY'], {
  errorMap: () => ({ message: "side must be 'A', 'B', 'HOME', or 'AWAY'" }),
});

export const pointMutationSchema = z.object({
  team: teamIdSchema,
  delta: z.union([z.literal(1), z.literal(-1)]).optional().default(1),
  clientEventId: z.string().max(80).optional(),
});

export const actionMutationSchema = z.object({
  team: teamIdSchema,
  action: z.string().min(1, 'action is required').transform(v => v.trim().toUpperCase()),
  playerId: z.string().optional(),
  clientEventId: z.string().max(80).optional(),
});

export const timeoutMutationSchema = z.object({
  team: teamIdSchema,
  clientEventId: z.string().max(80).optional(),
});

export const substitutionMutationSchema = z.object({
  team: teamIdSchema,
  out: z.string().max(10).optional(),
  in: z.string().max(10).optional(),
  playerOutId: z.string().optional(),
  playerInId: z.string().optional(),
  clientEventId: z.string().max(80).optional(),
}).superRefine((d, ctx) => {
  if (!((d.out && d.in) || (d.playerOutId && d.playerInId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide out/in or playerOutId/playerInId' });
  }
});

export const undoMutationSchema = z.object({
  clientEventId: z.string().max(80).optional(),
});

const rulesetSchema = z.enum(['FIVB_BO5', 'BO3', 'CUSTOM']).optional();

export const matchSetupSchema = z.object({
  homeTeamId: z.string().optional(),
  awayTeamId: z.string().optional(),
  competitionId: z.string().optional(),
  tournamentId: z.string().optional(),
  team_a: z.string().max(60).optional(), // legacy
  team_b: z.string().max(60).optional(), // legacy
  tournament: z.string().max(120).optional(), // legacy/display
  division: z.string().max(60).optional(),
  court: z.string().max(40).optional(),
  venueType: z.string().max(30).optional(),
  match_no: z.string().max(20).optional(),
  match_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  scheduledAt: z.string().optional(),
  ruleset: rulesetSchema,
  bestOfSets: z.number().int().min(1).max(7).optional(),
  setsToWin: z.number().int().min(1).max(5).optional(),
  regularSetPoints: z.number().int().min(1).max(50).optional(),
  finalSetPoints: z.number().int().min(1).max(50).optional(),
  minPointDifference: z.number().int().min(1).max(10).optional(),
  timeoutsPerSet: z.number().int().min(0).max(5).optional(),
  substitutionsPerSet: z.number().int().min(0).max(20).optional(),
  confirmSetEnd: z.boolean().optional(),
  referee1: z.string().max(80).optional(),
  referee2: z.string().max(80).optional(),
});

export const startSetSchema = z.object({
  setNumber: z.number().int().min(1).max(7).optional(),
  servingSide: z.enum(['A', 'B']).optional(),
});

export const matchInfoSchema = z.object({
  match_no: z.string().max(20).optional(),
  match_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  scheduledAt: z.string().optional(),
  referee1: z.string().max(80).optional(),
  referee2: z.string().max(80).optional(),
});

export const rosterEntrySchema = z.object({
  playerId: z.string().optional(),
  jerseyNumber: z.number().int().min(1).max(99),
  name: z.string().max(120).optional(),
  position: z.string().max(10).nullable().optional(),
  isCaptain: z.boolean().optional().default(false),
  isLibero: z.boolean().optional().default(false),
});

export const rosterReplaceSchema = z.object({
  players: z.array(rosterEntrySchema),
});

export const lineupSetSchema = z.object({
  players: z.array(z.object({
    rotationPos: z.number().int().min(1).max(6),
    playerId: z.string().optional(),
    jerseyNumber: z.number().int().min(1).max(99).optional(),
  })).min(6).max(6),
  liberoId: z.string().nullable().optional(),
});

export const bulkPlayersSchema = z.object({
  text: z.string().default(''),
  dryRun: z.boolean().optional().default(false),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export const bootstrapSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(1).max(120),
  displayName: z.string().min(1).max(80),
  email: z.string().email().optional(),
});

export const createUserSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(1).max(120),
  displayName: z.string().min(1).max(80),
  email: z.string().email().optional(),
  role: z.enum(['SCORER', 'VIEWER', 'ADMIN']),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1).max(120),
});

export const adminUpdateUserSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  role: z.enum(['SCORER', 'VIEWER', 'ADMIN']).optional(),
  active: z.boolean().optional(),
}).refine((d) => d.displayName !== undefined || d.role !== undefined || d.active !== undefined, { message: 'No changes provided' });

export const adminResetPasswordSchema = z.object({}).optional();

export const forgotPasswordRequestSchema = z.object({
  identifier: z.string().min(1).max(120), // username or email (no enumeration)
});

export const resetPasswordWithCodeSchema = z.object({
  username: z.string().min(1).max(120),
  recoveryCode: z.string().min(1).max(120),
  newPassword: z.string().min(1).max(120),
});

export const resetPasswordWithTokenSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1).max(120),
});

export const consumeTempPasswordSchema = z.object({
  username: z.string().min(1).max(120),
  tempPassword: z.string().min(1).max(120),
  newPassword: z.string().min(1).max(120),
});
