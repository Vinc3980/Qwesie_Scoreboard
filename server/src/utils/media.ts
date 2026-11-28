import { getStorage, isObjectKey, resolveStoredUrl } from '../storage/index.js';

export function resolveImage(key?: string | null, thumbKey?: string | null, legacyUrl?: string | null) {
  const url = resolveStoredUrl(key) || resolveStoredUrl(legacyUrl);
  const thumbUrl = resolveStoredUrl(thumbKey) || url;
  return { url: url || null, thumbUrl: thumbUrl || null };
}

export function shapeTeamMedia<T extends Record<string, any> | null | undefined>(team: T): T {
  if (!team) return team;
  const logo = resolveImage(team.logoKey, team.logoThumbKey, team.logoUrl);
  const coach = resolveImage(team.coachPhotoKey, team.coachPhotoThumbKey, null);
  const teamPhoto = resolveImage(team.teamPhotoKey, team.teamPhotoThumbKey, null);
  return {
    ...team,
    logoUrl: logo.url,
    logoThumbUrl: logo.thumbUrl,
    coachPhotoUrl: coach.url,
    coachPhotoThumbUrl: coach.thumbUrl,
    teamPhotoUrl: teamPhoto.url,
    teamPhotoThumbUrl: teamPhoto.thumbUrl,
  } as T;
}

export function shapePlayerMedia<T extends Record<string, any> | null | undefined>(player: T): T {
  if (!player) return player;
  const photo = resolveImage(player.photoKey, player.thumbKey, player.photoUrl);
  return {
    ...player,
    photoUrl: photo.url,
    thumbUrl: photo.thumbUrl,
  } as T;
}

export async function deleteStoredKeys(keys: Array<string | null | undefined>) {
  const storage = getStorage();
  const unique = Array.from(new Set(keys.map(k => String(k || '').trim()).filter(k => isObjectKey(k))));
  await Promise.all(unique.map(async (k) => {
    try { await storage.delete(k); } catch { /* best effort */ }
  }));
}
