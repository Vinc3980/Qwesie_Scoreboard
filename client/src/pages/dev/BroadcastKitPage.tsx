import React from 'react';
import { ScaledStage, TeamLogo, ScoreDigits, TimeoutPips, ServeMarker, StatBar, Banner, ConnectionGuard } from '../../components/broadcast/index.js';

const sampleMatch = {
  teams: {
    A: { name: 'ELWAK WINGS', shortName: 'ELW', primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#ffffff', score: 24, sets: 2, timeoutsUsed: 1, timeoutsPerSet: 2 },
    B: { name: 'GHANA NAVY', shortName: 'NAVY', primaryColor: '#1d4ed8', secondaryColor: '#0f172a', textColor: '#ffffff', score: 22, sets: 1, timeoutsUsed: 0, timeoutsPerSet: 2 },
  }
};

export const BroadcastKitPage: React.FC = () => {
  return (
    <ScaledStage match={sampleMatch}>
      <div className="broadcast-safe" style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg,#0b0f17 0%, #06080d 100%)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignContent: 'start' }}>
        <div style={{ gridColumn: '1 / -1', fontSize: 56, fontWeight: 800, letterSpacing: '0.02em' }}>Broadcast Kit (1920×1080)</div>

        <section style={{ background: 'rgba(255,255,255,0.04)', padding: 32, borderRadius: 16 }}>
          <div style={{ fontSize: 34, color: 'var(--broadcast-muted)', marginBottom: 16, textTransform: 'uppercase' }}>TeamLogo</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <TeamLogo name={sampleMatch.teams.A.name} shortName={sampleMatch.teams.A.shortName} color="var(--team-a)" textColor="var(--team-a-text)" />
            <TeamLogo name={sampleMatch.teams.B.name} shortName={sampleMatch.teams.B.shortName} color="var(--team-b)" textColor="var(--team-b-text)" />
            <TeamLogo src="/uploads/teams/elwak-wings.svg" name="ELW" shortName="ELW" size={84} />
          </div>
        </section>

        <section style={{ background: 'rgba(255,255,255,0.04)', padding: 32, borderRadius: 16 }}>
          <div style={{ fontSize: 34, color: 'var(--broadcast-muted)', marginBottom: 16, textTransform: 'uppercase' }}>ScoreDigits</div>
          <div style={{ display: 'flex', gap: 32, alignItems: 'center', fontSize: 120, fontWeight: 800 }}>
            <div style={{ color: 'var(--team-a)' }}><ScoreDigits value={sampleMatch.teams.A.score} /></div>
            <div style={{ fontSize: 64, color: 'var(--broadcast-muted)' }}>:</div>
            <div style={{ color: 'var(--team-b)' }}><ScoreDigits value={sampleMatch.teams.B.score} /></div>
          </div>
        </section>

        <section style={{ background: 'rgba(255,255,255,0.04)', padding: 32, borderRadius: 16 }}>
          <div style={{ fontSize: 34, color: 'var(--broadcast-muted)', marginBottom: 16, textTransform: 'uppercase' }}>TimeoutPips / ServeMarker</div>
          <div style={{ display: 'grid', gap: 18, fontSize: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>ELW</span><div style={{ display:'flex', alignItems:'center', gap:16 }}><ServeMarker active color="#facc15" /><TimeoutPips total={2} used={1} color="var(--team-a)" /></div></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>NAVY</span><div style={{ display:'flex', alignItems:'center', gap:16 }}><ServeMarker active={false} /><TimeoutPips total={2} used={0} color="var(--team-b)" /></div></div>
          </div>
        </section>

        <section style={{ background: 'rgba(255,255,255,0.04)', padding: 32, borderRadius: 16 }}>
          <div style={{ fontSize: 34, color: 'var(--broadcast-muted)', marginBottom: 16, textTransform: 'uppercase' }}>StatBar</div>
          <div style={{ display: 'grid', gap: 20 }}>
            <StatBar label="Kills" valueA={18} valueB={14} />
            <StatBar label="Blocks" valueA={6} valueB={9} />
          </div>
        </section>

        <section style={{ background: 'rgba(255,255,255,0.04)', padding: 32, borderRadius: 16, gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 34, color: 'var(--broadcast-muted)', marginBottom: 16, textTransform: 'uppercase' }}>Banner</div>
          <div style={{ position: 'relative', height: 140, overflow: 'hidden', borderRadius: 12, background: 'rgba(0,0,0,0.2)' }}>
            <Banner show className="absolute left-0 bottom-0 right-0" color="var(--team-a)" textColor="var(--team-a-text)">
              <div style={{ padding: '18px 28px', fontSize: 48, fontWeight: 800, letterSpacing: '0.03em' }}>SET POINT • ELWAK WINGS</div>
            </Banner>
          </div>
        </section>

        <ConnectionGuard debug live connected revision={42} />
      </div>
    </ScaledStage>
  );
};

export default BroadcastKitPage;
