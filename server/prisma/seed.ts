import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function ensureRole(name: string, description: string) {
  return prisma.role.upsert({
    where: { name },
    update: { description },
    create: { name, description, permissions: {} },
  });
}

function mkPlayers() {
  // 14 players each incl. captain and libero
  return (teamKey: string) => {
    const base = teamKey === 'ELW'
      ? [
          ['Kojo','Mensah',1,'S',true,false], ['Yaw','Owusu',2,'OH'], ['Kwame','Boateng',3,'MB'], ['Ama','Serwaa',4,'OPP'],
          ['Kofi','Asante',5,'OH'], ['Nana','Adjei',6,'MB'], ['Esi','Quaye',7,'OH'], ['Sam','Tetteh',8,'S'],
          ['Fiifi','Mensima',9,'DS'], ['Kojo','Appiah',10,'MB'], ['Yaw','Badu',11,'OPP'], ['Lee','Armah',12,'L',false,true],
          ['Ben','Darko',13,'OH',false,false], ['Mike','Nyame',14,'DS',false,false],
        ]
      : [
          ['Daniel','Owusu',1,'S',true,false], ['Samuel','Addo',2,'OH'], ['Isaac','Mensah',3,'MB'], ['Peter','Quartey',4,'OPP'],
          ['Joseph','Annang',5,'OH'], ['Michael','Lamptey',6,'MB'], ['Eric','Sarpong',7,'OH'], ['Bright','Amoah',8,'S'],
          ['Robert','Tagoe',9,'DS'], ['Francis','Doe',10,'MB'], ['Henry','Koomson',11,'OPP'], ['Victor','Nyarko',12,'L',false,true],
          ['Paul','Osei',13,'OH',false,false], ['James','Kusi',14,'DS',false,false],
        ];
    return base.map(([first,last,jersey,position,isCaptain,isLibero]: any) => ({
      firstName: first, lastName: last, displayName: `${first} ${last}`,
      jerseyNumber: jersey, position, isCaptain: !!isCaptain, isLibero: !!isLibero,
    }));
  };
}

async function main() {
  console.log('Starting Stage A seed...');

  const adminRole = await ensureRole('ADMIN', 'Administrator');
  const scorerRole = await ensureRole('SCORER', 'Match scorer/operator');
  await ensureRole('VIEWER', 'Read-only viewer');

  const adminPass = await bcrypt.hash('admin123', 10);
  const scorerPass = await bcrypt.hash('scorer123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminPass, displayName: 'Administrator', email: 'admin@qwesie.local', roleId: adminRole.id, isActive: true },
    create: { username: 'admin', email: 'admin@qwesie.local', passwordHash: adminPass, displayName: 'Administrator', roleId: adminRole.id },
  });
  await prisma.user.upsert({
    where: { username: 'scorer' },
    update: { passwordHash: scorerPass, displayName: 'Scorer', email: 'scorer@qwesie.local', roleId: scorerRole.id, isActive: true },
    create: { username: 'scorer', email: 'scorer@qwesie.local', passwordHash: scorerPass, displayName: 'Scorer', roleId: scorerRole.id },
  });

  const teamsSeed = [
    { key: 'ELW', name: 'ELWAK WINGS', shortName: 'ELW', logoUrl: '/uploads/teams/elwak-wings.svg', primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#ffffff' },
    { key: 'NAV', name: 'GHANA NAVY', shortName: 'NAVY', logoUrl: '/uploads/teams/ghana-navy.svg', primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#ffffff' },
  ];
  const playersFor = mkPlayers();
  const teams: Record<string, any> = {};
  const teamPlayers: Record<string, any[]> = {};

  for (const t of teamsSeed) {
    const team = await prisma.team.upsert({
      where: { code: t.key },
      update: { name: t.name, shortName: t.shortName, logoUrl: t.logoUrl, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor, textColor: t.textColor },
      create: { name: t.name, shortName: t.shortName, code: t.key, logoUrl: t.logoUrl, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor, textColor: t.textColor },
    });
    teams[t.key] = team;
    await prisma.player.deleteMany({ where: { teamId: team.id } });
    const createdPlayers = [] as any[];
    for (const p of playersFor(t.key)) {
      createdPlayers.push(await prisma.player.create({ data: { ...p, teamId: team.id } }));
    }
    teamPlayers[t.key] = createdPlayers;
  }

  // Ready-to-go demo match (SCHEDULED, rosters + starting six set 1)
  const existingDemo = await prisma.match.findFirst({ where: { matchNumber: 'A-READY-01' } });
  let matchId = existingDemo?.id;
  if (!existingDemo) {
    const home = teams['ELW'];
    const away = teams['NAV'];
    const match = await prisma.match.create({
      data: {
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeTeamName: home.name,
        awayTeamName: away.name,
        tournamentName: 'GREATER ACCRA VOLLEYBALL LEAGUE',
        division: "MEN'S DIVISION",
        court: 'COURT 1',
        venueType: 'INDOOR',
        ruleset: 'FIVB_BO5',
        matchNumber: 'A-READY-01',
        status: 'SCHEDULED',
        currentSetNumber: 1,
        servingSide: 'HOME',
        revision: 1,
        bestOfSets: 5, setsToWin: 3, regularSetPoints: 25, finalSetPoints: 15, minPointDifference: 2, timeoutsPerSet: 2, substitutionsPerSet: 6,
        scheduledAt: new Date(),
        sets: { create: [1,2,3,4,5].map(n => ({ setNumber:n, homePoints:0, awayPoints:0, targetPoints:n===5?15:25, minDifference:2, status:'READY', servingSide:'HOME' })) },
        teamStatistics: { create: [{ side: 'HOME' }, { side: 'AWAY' }] },
      },
    });
    matchId = match.id;
  }

  if (matchId) {
    const home = teams['ELW']; const away = teams['NAV'];
    const setRoster = async (side: 'HOME'|'AWAY', team: any, players: any[]) => {
      await prisma.matchRoster.deleteMany({ where: { matchId, side } });
      for (const p of players) {
        await prisma.matchRoster.create({ data: { matchId, teamId: team.id, playerId: p.id, side, jerseyNumber: p.jerseyNumber, isCaptain: !!p.isCaptain, isLibero: !!p.isLibero, isActive: true } });
      }
      const starters = players.filter((p: any) => [1,2,3,4,5,6].includes(p.jerseyNumber)).sort((a: any,b: any)=>a.jerseyNumber-b.jerseyNumber);
      await prisma.startingLineup.deleteMany({ where: { matchId, side, setNumber: 1 } });
      for (let i = 0; i < 6; i++) {
        const p = starters[i];
        if (p) await prisma.startingLineup.create({ data: { matchId, side, setNumber: 1, teamId: team.id, playerId: p.id, rotationPos: i + 1 } });
      }
    };
    await setRoster('HOME', home, teamPlayers['ELW']);
    await setRoster('AWAY', away, teamPlayers['NAV']);
    await prisma.matchOfficial.deleteMany({ where: { matchId } });
    await prisma.matchOfficial.createMany({ data: [
      { matchId, role: 'FIRST_REFEREE', fullName: 'Demo Referee 1' },
      { matchId, role: 'SECOND_REFEREE', fullName: 'Demo Referee 2' },
    ]});
    await prisma.match.update({ where: { id: matchId }, data: { status: 'SCHEDULED', revision: { increment: 1 } } });
  }

  console.log('Stage A seed complete');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
