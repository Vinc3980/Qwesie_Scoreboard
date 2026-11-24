import { Router } from 'express';
import { matchRouter } from './match.routes.js';
import { healthRouter } from './health.routes.js';
import { broadcastRouter } from './broadcast.routes.js';
import { authRouter } from './auth.routes.js';
import { teamsRouter } from './teams.routes.js';
import { playersRouter } from './players.routes.js';
import { competitionsRouter } from './competitions.routes.js';
import { tournamentsRouter } from './tournaments.routes.js';
import { uploadsRouter } from './uploads.routes.js';
import { systemRouter } from './system.routes.js';
import { courtRouter } from './court.routes.js';
import { scorebugThemeRouter } from './scorebugTheme.routes.js';

export const apiRouter = Router();

// Versioned routes (v1)
apiRouter.use('/v1/auth', authRouter);
apiRouter.use('/v1/matches', matchRouter);
apiRouter.use('/v1/broadcast', broadcastRouter);
apiRouter.use('/v1/scorebug-themes', scorebugThemeRouter);
apiRouter.use('/v1/health', healthRouter);
apiRouter.use('/v1/system', systemRouter);
apiRouter.use('/v1/system/courts', courtRouter);
apiRouter.use('/v1/teams', teamsRouter);
apiRouter.use('/v1/players', playersRouter);
apiRouter.use('/v1/competitions', competitionsRouter);
apiRouter.use('/v1/tournaments', tournamentsRouter);
apiRouter.use('/v1/uploads', uploadsRouter);

// Backward-compatible endpoints
apiRouter.use('/match', matchRouter);
