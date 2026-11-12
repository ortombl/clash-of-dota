import { CONFIG } from '../data/config';
const M = CONFIG.map;

export const mirrorY = (team: number, y: number) => (team === 0 ? y : M.h - y);
/** +1 if the team's base is at larger y (team 0), i.e. "back" direction. */
export const backDir = (team: number) => (team === 0 ? 1 : -1);
export const isHigh = (y: number) => Math.abs(y - M.riverY) > M.highGround;
export const laneOf = (x: number) => (x < M.w / 2 ? 0 : 1);
export const fountainPos = (team: number) => ({ x: M.fountain.x, y: mirrorY(team, M.fountain.y) });
export const ancientPos = (team: number) => ({ x: M.ancient.x, y: mirrorY(team, M.ancient.y) });
export const structY = (team: number, which: 't1' | 't2' | 'barracks') =>
  mirrorY(team, which === 't1' ? M.t1Y : which === 't2' ? M.t2Y : M.barracksY);
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Is (x,y) inside the troop/building deploy zone of `team`? `forward[lane]` opens a forward column. */
export function inDeployZone(team: number, forward: readonly boolean[], x: number, y: number): boolean {
  if (x < 30 || x > M.w - 30 || y < 30 || y > M.h - 30) return false;
  const ty = mirrorY(team, y); // in team-0 space: own half is ty >= river edge
  if (ty >= M.riverY + M.riverHalf) return true;
  for (let l = 0; l < 2; l++) {
    if (forward[l] && Math.abs(x - M.laneX[l]) <= M.deployLaneHalfWidth && ty >= M.deployForwardY) return true;
  }
  return false;
}
